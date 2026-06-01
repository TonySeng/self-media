/**
 * Server-Sent Events 工具：把异步生成器包装成 ReadableStream + Response。
 *
 * 使用 SSE 而不是 WebSocket 因为：
 * - 单向（服务器推到客户端）足够用
 * - 走 HTTP，无需额外协议
 * - 浏览器原生支持 EventSource，但我们走 fetch + ReadableStream 拿到更多控制
 *
 * 协议：每条消息是一行 `data: <JSON>\n\n`，前端用换行分隔解析。
 */

const encoder = new TextEncoder();

export function createSSEResponse<T>(
  generator: AsyncIterable<T>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          const line = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const errorLine = `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
        controller.enqueue(encoder.encode(errorLine));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no', // 关闭 Nginx 缓冲
    },
  });
}

/**
 * 客户端工具：解析 SSE 流。
 *
 * Usage:
 *   for await (const chunk of parseSSEStream<MyType>(response.body!)) {
 *     // ...
 *   }
 */
export async function* parseSSEStream<T>(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of event.split('\n')) {
          if (line.startsWith('data: ')) {
            const json = line.slice(6).trim();
            if (json) {
              yield JSON.parse(json) as T;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
