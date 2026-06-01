'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownProps = {
  children: string;
  /**
   * 紧凑模式（聊天气泡里使用）：减小段落间距，使用对话气泡兼容的颜色
   */
  compact?: boolean;
  /**
   * 反色模式（AI 在主色背景上时，比如用户消息）：因 AI 现在不在主色背景上，
   * 默认 false 即可。
   */
  inverted?: boolean;
};

/**
 * 把 AI 输出的 Markdown 渲染成富文本。
 *
 * 设计要点：
 * - 用 prose（tailwind typography）会引入 dark/inverted 的样式纠结，这里手写若干个简单 class，可控且足够
 * - 链接默认 target="_blank" rel="noopener noreferrer"
 * - 代码块用更深的背景色突出
 */
export function Markdown({ children, compact, inverted }: MarkdownProps) {
  const space = compact ? 'space-y-1.5' : 'space-y-3';
  const linkClass = inverted
    ? 'underline opacity-90 hover:opacity-100'
    : 'text-blue-600 underline hover:text-blue-700';
  const codeClass = inverted
    ? 'rounded bg-background/30 px-1 py-0.5 text-xs'
    : 'rounded bg-muted-foreground/10 px-1 py-0.5 text-xs';
  const preClass = inverted
    ? 'overflow-x-auto rounded-md bg-background/30 p-3 text-xs'
    : 'overflow-x-auto rounded-md bg-muted-foreground/10 p-3 text-xs';

  return (
    <div className={`text-sm leading-relaxed ${space}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="break-words">{children}</p>,
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold">{children}</h4>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="break-words">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {children}
            </a>
          ),
          code: (props) => {
            const { children, className } = props as {
              children?: React.ReactNode;
              className?: string;
            };
            const isInline = !className?.startsWith('language-');
            if (isInline) {
              return <code className={codeClass}>{children}</code>;
            }
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => <pre className={preClass}>{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-muted-foreground/40 pl-3 italic opacity-90">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-muted-foreground/20 bg-muted-foreground/5 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-muted-foreground/20 px-2 py-1">
              {children}
            </td>
          ),
          hr: () => <hr className="border-muted-foreground/20" />,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
