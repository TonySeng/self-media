import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AICopyGenerator } from '@/components/materials/ai-copy-generator';

export default function AIGeneratePage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI 批量生成文案</h1>
          <p className="text-sm text-muted-foreground">
            按要求和对标参考一次产出多条文案，挑选后批量入库
          </p>
        </div>
        <Link href="/materials">
          <Button variant="ghost">← 返回素材库</Button>
        </Link>
      </div>
      <AICopyGenerator />
    </div>
  );
}
