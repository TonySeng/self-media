import Link from 'next/link';
import { Card } from '@/components/ui/card';

type TopWork = {
  id: string;
  title: string;
  coverUrl: string | null;
  play: number;
  like: number;
  comment: number;
  publishedAt: Date;
};

type TopWorksListProps = {
  works: TopWork[];
};

export function TopWorksList({ works }: TopWorksListProps) {
  if (works.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        暂无作品数据，请先同步作品
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {works.map((work, index) => (
        <Link key={work.id} href={`/works/${work.id}`}>
          <Card className="flex items-center gap-4 p-3 transition-colors hover:border-primary">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {index + 1}
            </div>
            {work.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={work.coverUrl}
                alt=""
                className="h-16 w-28 rounded object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{work.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                播放 {work.play.toLocaleString()} · 点赞 {work.like.toLocaleString()} · 评论{' '}
                {work.comment.toLocaleString()}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
