import Link from 'next/link';
import { Card } from '@/components/ui/card';

const SECTIONS = [
  {
    href: '/settings/platforms',
    title: '平台账号',
    description: '导入抖音 Cookie，管理已绑定的账号',
  },
  {
    href: '/settings/sync',
    title: '定时同步',
    description: '配置自动同步频率，手动触发全量同步',
  },
  {
    href: '/settings/llm',
    title: 'LLM Provider',
    description: '配置 OpenAI 兼容的大模型 Provider 与默认模型',
  },
  {
    href: '/settings/prompts',
    title: 'Prompt 模板',
    description: '编辑 AI 分析任务使用的提示词模板，可恢复默认',
  },
  {
    href: '/settings/storage',
    title: '存储设置',
    description: '选择本地存储或腾讯云 COS，管理素材文件存储方式',
  },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">设置</h1>
      <div className="grid gap-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="p-4 transition-colors hover:border-primary">
              <div className="font-medium">{s.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.description}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
