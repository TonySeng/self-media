import { describe, it, expect } from 'vitest';
import { parseGeneratedCopies } from '@/lib/ai-tasks/parse-generated-copies';

describe('parseGeneratedCopies', () => {
  it('parses standard 3-card output (not streaming)', () => {
    const text = '## 标题A\n\n正文A 第一行\n正文A 第二行\n\n---\n\n## 标题B\n\n正文B\n\n---\n\n## 标题C\n\n正文C';
    const cards = parseGeneratedCopies(text, false);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toEqual({ title: '标题A', content: '正文A 第一行\n正文A 第二行', done: true });
    expect(cards[1]).toEqual({ title: '标题B', content: '正文B', done: true });
    expect(cards[2]).toEqual({ title: '标题C', content: '正文C', done: true });
  });

  it('marks last card as not done when streaming', () => {
    const text = '## 标题A\n\n正文A\n\n---\n\n## 标题B\n\n正文B 还在写';
    const cards = parseGeneratedCopies(text, true);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.done).toBe(true);
    expect(cards[1]!.done).toBe(false);
  });

  it('falls back to single card when no separator', () => {
    const text = '## 标题\n\n正文，模型没分隔';
    const cards = parseGeneratedCopies(text, false);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ title: '标题', content: '正文，模型没分隔', done: true });
  });

  it('falls back to empty title when missing ##', () => {
    const text = '没有标题的正文\n\n---\n\n## 有标题\n\n正文B';
    const cards = parseGeneratedCopies(text, false);
    expect(cards[0]).toEqual({ title: '', content: '没有标题的正文', done: true });
    expect(cards[1]).toEqual({ title: '有标题', content: '正文B', done: true });
  });

  it('preserves emoji and hashtags in content', () => {
    const text = '## 钩子\n\n第一句 🔥\n#话题1 #话题2\n\n---\n\n## 钩子2\n\n正文 😂';
    const cards = parseGeneratedCopies(text, false);
    expect(cards[0]!.content).toBe('第一句 🔥\n#话题1 #话题2');
    expect(cards[1]!.content).toBe('正文 😂');
  });

  it('handles blank input', () => {
    expect(parseGeneratedCopies('', false)).toEqual([{ title: '', content: '', done: true }]);
    expect(parseGeneratedCopies('', true)).toEqual([{ title: '', content: '', done: false }]);
  });

  it('tolerates extra blank lines around separator', () => {
    const text = '## A\n\n正文A\n\n\n---\n\n\n## B\n\n正文B';
    const cards = parseGeneratedCopies(text, false);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.content).toBe('正文A');
    expect(cards[1]!.content).toBe('正文B');
  });
});
