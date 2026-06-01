import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import type { ChatMessage } from '@/lib/llm/types';
import { formatMetrics } from './utils';

/**
 * 格式化引用内容
 */
async function formatAttachments(attachments: {
  workIds?: string[];
  materialIds?: string[];
}): Promise<string> {
  let text = '';

  if (attachments.workIds && attachments.workIds.length > 0) {
    const works = await db.work.findMany({
      where: { id: { in: attachments.workIds } },
      include: { metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 } },
    });

    for (const work of works) {
      text += `\n\n[引用作品]\n`;
      text += `标题：${work.title}\n`;
      text += `描述：${work.description || '无'}\n`;
      if (work.metrics[0]) {
        text += `数据：${formatMetrics(work.metrics[0])}\n`;
      }
    }
  }

  if (attachments.materialIds && attachments.materialIds.length > 0) {
    const materials = await db.material.findMany({
      where: { id: { in: attachments.materialIds } },
    });

    for (const material of materials) {
      text += `\n\n[引用素材 - ${material.type}]\n`;
      text += `标题：${material.title}\n`;
      if (material.content) {
        const content = material.content.slice(0, 500);
        text += `内容：${content}${material.content.length > 500 ? '...' : ''}\n`;
      }
    }
  }

  return text;
}

/**
 * 构建对话 Prompt（包含历史消息和引用内容）
 */
async function buildChatPrompt(
  chatId: string,
  userMessage: string,
  attachments?: { workIds?: string[]; materialIds?: string[] },
): Promise<ChatMessage[]> {
  // 1. 获取历史消息（最近 20 条）
  const history = await db.aIChatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  // 2. 转换为 ChatMessage 格式
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是一个专业的短视频运营助手。用户可能会引用作品数据或素材内容，请基于这些信息提供有价值的建议。',
    },
  ];

  for (const msg of history) {
    if (msg.role === 'SYSTEM') continue; // 跳过 system 消息
    messages.push({
      role: msg.role.toLowerCase() as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // 3. 添加当前用户消息
  let currentContent = userMessage;

  // 4. 如果有引用，添加引用内容
  if (attachments && (attachments.workIds?.length || attachments.materialIds?.length)) {
    const attachmentText = await formatAttachments(attachments);
    currentContent += attachmentText;
  }

  messages.push({
    role: 'user',
    content: currentContent,
  });

  return messages;
}

/**
 * 保存用户消息（流式开始前调用）
 */
async function saveUserMessage(
  chatId: string,
  userMessage: string,
  attachments?: { workIds?: string[]; materialIds?: string[] },
) {
  return db.aIChatMessage.create({
    data: {
      chatId,
      role: 'USER',
      content: userMessage,
      attachments: attachments ? (attachments as object) : undefined,
    },
  });
}

/**
 * 完成 LLM 调用后的善后工作：保存 AI 回复 + 更新会话标题
 */
async function finalizeChatMessage(
  chatId: string,
  userMessage: string,
  assistantText: string,
  usage: { inputTokens: number; outputTokens: number },
) {
  const assistantMsg = await db.aIChatMessage.create({
    data: {
      chatId,
      role: 'ASSISTANT',
      content: assistantText,
      tokensUsed: { input: usage.inputTokens, output: usage.outputTokens },
    },
  });

  await db.aIChat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });

  // 如果是第一条消息，自动生成标题
  const chat = await db.aIChat.findUnique({
    where: { id: chatId },
    include: { messages: true },
  });

  if (chat && chat.title === '新对话' && chat.messages.length === 2) {
    const newTitle =
      userMessage.slice(0, 20) + (userMessage.length > 20 ? '...' : '');
    await db.aIChat.update({
      where: { id: chatId },
      data: { title: newTitle },
    });
  }

  return assistantMsg;
}

/**
 * 执行 AI Chat 消息（非流式）
 */
export async function executeChatMessage(
  chatId: string,
  userMessage: string,
  attachments?: { workIds?: string[]; materialIds?: string[] },
) {
  const userMsg = await saveUserMessage(chatId, userMessage, attachments);

  const messages = await buildChatPrompt(chatId, userMessage, attachments);

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages,
    maxOutputTokens: 2000,
    temperature: 0.7,
  });

  const assistantMsg = await finalizeChatMessage(
    chatId,
    userMessage,
    result.text,
    result.usage,
  );

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    tokensUsed: result.usage,
  };
}

/**
 * 执行 AI Chat 消息（流式）
 *
 * 协议事件：
 *   - { type: 'user-saved', message: { id, ... } }      用户消息已落库
 *   - { type: 'text', delta: string }                    AI 输出片段
 *   - { type: 'finish', message: { id, ... }, tokensUsed }  完成，AI 消息落库
 *   - { type: 'error', message: string }                 出错
 */
export async function* streamChatMessage(
  chatId: string,
  userMessage: string,
  attachments?: { workIds?: string[]; materialIds?: string[] },
): AsyncIterable<
  | { type: 'user-saved'; message: { id: string; createdAt: Date } }
  | { type: 'text'; delta: string }
  | {
      type: 'finish';
      message: {
        id: string;
        content: string;
        tokensUsed: { input: number; output: number };
        createdAt: Date;
      };
    }
> {
  const userMsg = await saveUserMessage(chatId, userMessage, attachments);
  yield {
    type: 'user-saved',
    message: { id: userMsg.id, createdAt: userMsg.createdAt },
  };

  const messages = await buildChatPrompt(chatId, userMessage, attachments);
  const client = await getDefaultLLMClient();

  let fullText = '';
  let usage = { inputTokens: 0, outputTokens: 0 };

  for await (const chunk of client.stream({
    messages,
    maxOutputTokens: 2000,
    temperature: 0.7,
  })) {
    if (chunk.type === 'text') {
      fullText += chunk.delta;
      yield { type: 'text', delta: chunk.delta };
    } else if (chunk.type === 'finish') {
      fullText = chunk.text;
      usage = chunk.usage;
    }
  }

  const assistantMsg = await finalizeChatMessage(
    chatId,
    userMessage,
    fullText,
    usage,
  );

  yield {
    type: 'finish',
    message: {
      id: assistantMsg.id,
      content: assistantMsg.content,
      tokensUsed: { input: usage.inputTokens, output: usage.outputTokens },
      createdAt: assistantMsg.createdAt,
    },
  };
}
