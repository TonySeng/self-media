import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type FansTrendChartProps = {
  data: Array<{ date: string; fans: number }>;
};

export function FansTrendChart({ data }: FansTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        暂无粉丝数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
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
          formatter={(value) => [`${Number(value).toLocaleString()}`, '粉丝数']}
        />
        <Line
          type="monotone"
          dataKey="fans"
          stroke="#8884d8"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
