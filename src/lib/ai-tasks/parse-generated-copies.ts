export type GeneratedCopyCard = {
  title: string;
  content: string;
  done: boolean;
};

export function parseGeneratedCopies(
  text: string,
  streaming: boolean,
): GeneratedCopyCard[] {
  const parts = text.split(/\n+---\n+/);
  return parts.map((part, i) => {
    const trimmed = part.trim();
    const m = trimmed.match(/^##\s+(.+?)\n+([\s\S]*)$/);
    const title = m?.[1]?.trim() ?? '';
    const content = (m?.[2] ?? trimmed).trim();
    const isLast = i === parts.length - 1;
    const done = !streaming || !isLast;
    return { title, content, done };
  });
}
