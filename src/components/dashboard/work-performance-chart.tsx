import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type WorkPerformanceChartProps = {
  data: Array<{ date: string; play: number; like: number; comment: number }>;
};

export function WorkPerformanceChart({ data }: WorkPerformanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        暂无作品数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => {
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          labelFormatter={(value) => `日期: ${value}`}
          formatter={(value) => Number(value).toLocaleString()}
        />
        <Legend />
        <Bar dataKey="play" fill="#8884d8" name="播放" />
        <Bar dataKey="like" fill="#82ca9d" name="点赞" />
        <Bar dataKey="comment" fill="#ffc658" name="评论" />
      </BarChart>
    </ResponsiveContainer>
  );
}
