'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ReferencePicker } from '@/components/ai/reference-picker';
import { Markdown } from '@/components/ai/markdown';
import { parseSSEStream } from '@/lib/sse';
import { toast } from 'sonner';

type Chat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

type Attachments = { workIds?: string[]; materialIds?: string[] };

type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  attachments?: Attachments | null;
  tokensUsed?: { input: number; output: number } | null;
  createdAt: string;
};

type RefSummary = {
  works: { id: string; title: string; coverUrl: string | null }[];
  materials: { id: string; type: string; title: string }[];
};

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  COPY: '文案',
  TOPIC: '选题',
  VIDEO: '视频',
  IMAGE: '图片',
  AUDIO: '音频',
  IDEA: '创意',
  REFERENCE: '参考',
};

export default function AIChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingWorkIds, setPendingWorkIds] = useState<string[]>([]);
  const [pendingMaterialIds, setPendingMaterialIds] = useState<string[]>([]);
  const [pendingRefSummary, setPendingRefSummary] = useState<RefSummary>({
    works: [],
    materials: [],
  });
  const [historyRefSummaries, setHistoryRefSummaries] = useState<
    Record<string, RefSummary>
  >({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadChats();
  }, []);

  useEffect(() => {
    if (activeChat) {
      void loadMessages(activeChat);
    } else {
      setMessages([]);
    }
  }, [activeChat]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 加载待发送引用的标题
  useEffect(() => {
    if (pendingWorkIds.length === 0 && pendingMaterialIds.length === 0) {
      setPendingRefSummary({ works: [], materials: [] });
      return;
    }
    const url = new URL('/api/ai/chat/refs', window.location.origin);
    if (pendingWorkIds.length > 0) {
      url.searchParams.set('workIds', pendingWorkIds.join(','));
    }
    if (pendingMaterialIds.length > 0) {
      url.searchParams.set('materialIds', pendingMaterialIds.join(','));
    }
    void fetch(url)
      .then((r) => r.json() as Promise<RefSummary>)
      .then((data) => setPendingRefSummary(data))
      .catch(() => {});
  }, [pendingWorkIds, pendingMaterialIds]);

  // 加载历史消息中的引用标题
  useEffect(() => {
    const allWorkIds = new Set<string>();
    const allMaterialIds = new Set<string>();
    for (const m of messages) {
      if (m.attachments?.workIds) {
        for (const id of m.attachments.workIds) allWorkIds.add(id);
      }
      if (m.attachments?.materialIds) {
        for (const id of m.attachments.materialIds) allMaterialIds.add(id);
      }
    }

    const missingWorks = Array.from(allWorkIds).filter(
      (id) => !historyRefSummaries[`work:${id}`],
    );
    const missingMaterials = Array.from(allMaterialIds).filter(
      (id) => !historyRefSummaries[`mat:${id}`],
    );

    if (missingWorks.length === 0 && missingMaterials.length === 0) return;

    const url = new URL('/api/ai/chat/refs', window.location.origin);
    if (missingWorks.length > 0) {
      url.searchParams.set('workIds', missingWorks.join(','));
    }
    if (missingMaterials.length > 0) {
      url.searchParams.set('materialIds', missingMaterials.join(','));
    }
    void fetch(url)
      .then((r) => r.json() as Promise<RefSummary>)
      .then((data) => {
        setHistoryRefSummaries((prev) => {
          const next = { ...prev };
          for (const w of data.works) next[`work:${w.id}`] = { works: [w], materials: [] };
          for (const m of data.materials)
            next[`mat:${m.id}`] = { works: [], materials: [m] };
          return next;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function loadChats() {
    try {
      const res = await fetch('/api/ai/chat');
      const data = await res.json();
      setChats(data.items);
      if (data.items.length > 0 && !activeChat) {
        setActiveChat(data.items[0].id);
      }
    } catch (e) {
      toast.error('加载会话列表失败');
    }
  }

  async function loadMessages(chatId: string) {
    try {
      const res = await fetch(`/api/ai/chat/${chatId}`);
      const data = await res.json();
      setMessages(data.messages);
    } catch (e) {
      toast.error('加载消息失败');
    }
  }

  async function createChat() {
    try {
      const res = await fetch('/api/ai/chat', { method: 'POST' });
      const newChat = await res.json();
      setChats([newChat, ...chats]);
      setActiveChat(newChat.id);
      setMessages([]);
      clearPendingRefs();
      toast.success('新对话已创建');
    } catch (e) {
      toast.error('创建对话失败');
    }
  }

  async function deleteChat(chatId: string) {
    if (!confirm('确认删除此对话？')) return;

    try {
      await fetch(`/api/ai/chat/${chatId}`, { method: 'DELETE' });
      setChats(chats.filter((c) => c.id !== chatId));
      if (activeChat === chatId) {
        setActiveChat(chats[0]?.id || null);
      }
      toast.success('对话已删除');
    } catch (e) {
      toast.error('删除失败');
    }
  }

  function clearPendingRefs() {
    setPendingWorkIds([]);
    setPendingMaterialIds([]);
  }

  function removePendingWork(id: string) {
    setPendingWorkIds(pendingWorkIds.filter((x) => x !== id));
  }

  function removePendingMaterial(id: string) {
    setPendingMaterialIds(pendingMaterialIds.filter((x) => x !== id));
  }

  async function sendMessage() {
    if (!input.trim() || !activeChat) return;

    setSending(true);
    const userInput = input;
    const attachments: Attachments | undefined =
      pendingWorkIds.length > 0 || pendingMaterialIds.length > 0
        ? {
            ...(pendingWorkIds.length > 0 ? { workIds: pendingWorkIds } : {}),
            ...(pendingMaterialIds.length > 0
              ? { materialIds: pendingMaterialIds }
              : {}),
          }
        : undefined;

    setInput('');
    clearPendingRefs();

    // 先把用户消息和占位的 AI 消息加到 UI
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const optimisticUser: Message = {
      id: tempUserId,
      role: 'USER',
      content: userInput,
      attachments: attachments ?? null,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistant: Message = {
      id: tempAssistantId,
      role: 'ASSISTANT',
      content: '',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);

    try {
      const res = await fetch(
        `/api/ai/chat/${activeChat}/messages/stream`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: userInput, attachments }),
        },
      );

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '发送失败');
      }

      type StreamEvent =
        | { type: 'user-saved'; message: { id: string; createdAt: string } }
        | { type: 'text'; delta: string }
        | {
            type: 'finish';
            message: {
              id: string;
              content: string;
              tokensUsed: { input: number; output: number };
              createdAt: string;
            };
          }
        | { type: 'error'; message: string };

      let assistantText = '';

      for await (const event of parseSSEStream<StreamEvent>(res.body)) {
        if (event.type === 'user-saved') {
          // 替换临时用户消息 ID
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempUserId
                ? { ...m, id: event.message.id, createdAt: event.message.createdAt }
                : m,
            ),
          );
        } else if (event.type === 'text') {
          assistantText += event.delta;
          // 更新 AI 消息内容
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId ? { ...m, content: assistantText } : m,
            ),
          );
        } else if (event.type === 'finish') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    id: event.message.id,
                    content: event.message.content,
                    tokensUsed: event.message.tokensUsed,
                    createdAt: event.message.createdAt,
                  }
                : m,
            ),
          );
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }

      await loadChats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败');
      // 回滚：移除临时消息，恢复输入和引用
      setMessages((prev) =>
        prev.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId),
      );
      setInput(userInput);
      if (attachments) {
        if (attachments.workIds) setPendingWorkIds(attachments.workIds);
        if (attachments.materialIds)
          setPendingMaterialIds(attachments.materialIds);
      }
    } finally {
      setSending(false);
    }
  }

  function renderMessageRefs(attachments?: Attachments | null) {
    if (!attachments) return null;
    const refs: { type: 'work' | 'mat'; label: string; sublabel?: string }[] = [];

    if (attachments.workIds) {
      for (const id of attachments.workIds) {
        const summary = historyRefSummaries[`work:${id}`];
        const work = summary?.works[0];
        refs.push({
          type: 'work',
          label: work?.title || `作品 ${id.slice(-6)}`,
        });
      }
    }
    if (attachments.materialIds) {
      for (const id of attachments.materialIds) {
        const summary = historyRefSummaries[`mat:${id}`];
        const mat = summary?.materials[0];
        refs.push({
          type: 'mat',
          label: mat?.title || `素材 ${id.slice(-6)}`,
          sublabel: mat ? MATERIAL_TYPE_LABELS[mat.type] : undefined,
        });
      }
    }

    if (refs.length === 0) return null;

    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {refs.map((ref, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-background/30 px-2 py-0.5 text-xs"
          >
            <span>{ref.type === 'work' ? '📹' : '📄'}</span>
            {ref.sublabel && (
              <span className="opacity-70">[{ref.sublabel}]</span>
            )}
            <span className="max-w-40 truncate">{ref.label}</span>
          </span>
        ))}
      </div>
    );
  }

  const totalPending = pendingWorkIds.length + pendingMaterialIds.length;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* 会话列表 */}
      <aside className="w-64 shrink-0 border-r bg-muted/30 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">对话列表</h2>
          <Button size="sm" onClick={createChat}>
            新对话
          </Button>
        </div>
        <div className="space-y-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group relative cursor-pointer rounded-md p-3 transition-colors ${
                activeChat === chat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
              onClick={() => setActiveChat(chat.id)}
            >
              <div className="truncate text-sm font-medium">{chat.title}</div>
              <div className="text-xs opacity-70">
                {chat.messageCount} 条消息
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteChat(chat.id);
                }}
                className="absolute right-2 top-2 hidden rounded p-1 hover:bg-red-500/20 group-hover:block"
              >
                <span className="text-xs">删除</span>
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <p className="text-sm text-muted-foreground">
              暂无对话，点击"新对话"开始
            </p>
          )}
        </div>
      </aside>

      {/* 对话区域 */}
      <main className="flex flex-1 flex-col">
        {activeChat ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
                >
                  <Card
                    className={`max-w-2xl p-4 ${
                      msg.role === 'USER'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="mb-1 text-xs opacity-70">
                      {msg.role === 'USER' ? '你' : 'AI'}
                    </div>
                    {msg.role === 'ASSISTANT' && !msg.content ? (
                      <div className="text-sm text-muted-foreground italic">
                        思考中<span className="inline-block animate-pulse">...</span>
                      </div>
                    ) : msg.role === 'USER' ? (
                      <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                    ) : (
                      <Markdown compact>{msg.content}</Markdown>
                    )}
                    {renderMessageRefs(msg.attachments)}
                    {msg.tokensUsed && (
                      <div className="mt-2 text-xs opacity-70">
                        Token: {msg.tokensUsed.input + msg.tokensUsed.output}
                      </div>
                    )}
                  </Card>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  开始对话吧，可以引用作品或素材让 AI 分析
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入框区域 */}
            <div className="border-t p-4">
              {/* 待发送引用 chips */}
              {totalPending > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {pendingRefSummary.works.map((w) => (
                    <span
                      key={`pw-${w.id}`}
                      className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs"
                    >
                      <span>📹</span>
                      <span className="max-w-40 truncate">{w.title}</span>
                      <button
                        onClick={() => removePendingWork(w.id)}
                        className="ml-1 opacity-60 hover:opacity-100"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {pendingRefSummary.materials.map((m) => (
                    <span
                      key={`pm-${m.id}`}
                      className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs"
                    >
                      <span>📄</span>
                      <span className="opacity-70">
                        [{MATERIAL_TYPE_LABELS[m.type] || m.type}]
                      </span>
                      <span className="max-w-40 truncate">{m.title}</span>
                      <button
                        onClick={() => removePendingMaterial(m.id)}
                        className="ml-1 opacity-60 hover:opacity-100"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="输入消息... (Shift+Enter 换行)"
                  className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={3}
                  disabled={sending}
                />
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    disabled={sending}
                  >
                    引用 {totalPending > 0 && `(${totalPending})`}
                  </Button>
                  <Button
                    onClick={() => void sendMessage()}
                    disabled={sending || !input.trim()}
                  >
                    {sending ? '发送中...' : '发送'}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                点击"引用"可以选择作品或素材作为对话上下文
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            选择或创建一个对话开始聊天
          </div>
        )}
      </main>

      <ReferencePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialWorkIds={pendingWorkIds}
        initialMaterialIds={pendingMaterialIds}
        onSelect={(refs) => {
          setPendingWorkIds(refs.workIds);
          setPendingMaterialIds(refs.materialIds);
        }}
      />
    </div>
  );
}
