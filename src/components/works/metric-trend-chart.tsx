'use client';

import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

type Point = {
  snapshotAt: string;
  play: number;
  like: number;
  comment: number;
  share: number;
  collect: number;
};

export function MetricTrendChart({ data }: { data: Point[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.snapshotAt).toLocaleDateString(),
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="play" name="播放" stroke="#3b82f6" />
        <Line type="monotone" dataKey="like" name="点赞" stroke="#ef4444" />
        <Line type="monotone" dataKey="comment" name="评论" stroke="#10b981" />
      </LineChart>
    </ResponsiveContainer>
  );
}
