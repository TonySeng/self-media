# Plan 5: 仪表盘（Dashboard）

**创建日期**：2026-05-31  
**状态**：In Progress  
**依赖**：Plan 2 (Douyin Integration) ✅

---

## 目标

实现数据可视化总览页面，展示：
1. **粉丝趋势图**：近 30 天粉丝数变化
2. **作品汇总**：近 30 天作品数量、总播放、总互动
3. **Top 5 作品**：按播放量排序的热门作品
4. **账号概览**：账号基本信息、最近同步时间

---

## UI 设计

```
┌─────────────────────────────────────────────────────────────┐
│  数据总览                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 总作品数      │  │ 总播放量      │  │ 总互动数      │      │
│  │   48         │  │   12.5K      │  │   850        │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 粉丝趋势（近 30 天）                                     │ │
│  │                                                          │ │
│  │  [折线图]                                                │ │
│  │                                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 近 30 天作品表现                                         │ │
│  │                                                          │ │
│  │  [柱状图：播放、点赞、评论]                              │ │
│  │                                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Top 5 热门作品                                           │ │
│  │                                                          │ │
│  │  1. 作品标题 - 12.5K 播放                                │ │
│  │  2. 作品标题 - 10.2K 播放                                │ │
│  │  ...                                                     │ │
│  │                                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据需求

### 1. 统计卡片数据

```typescript
type DashboardStats = {
  totalWorks: number;           // 总作品数
  totalPlays: number;           // 总播放量
  totalEngagement: number;      // 总互动数（点赞+评论+分享+收藏）
  recentWorks: number;          // 近 30 天作品数
  avgPlay: number;              // 近 30 天平均播放
  avgEngagement: number;        // 近 30 天平均互动
};
```

### 2. 粉丝趋势数据

```typescript
type FansTrend = {
  date: string;                 // 日期
  fans: number;                 // 粉丝数
};
```

### 3. 作品表现数据

```typescript
type WorkPerformance = {
  date: string;                 // 日期
  play: number;                 // 播放量
  like: number;                 // 点赞数
  comment: number;              // 评论数
};
```

### 4. Top 作品数据

```typescript
type TopWork = {
  id: string;
  title: string;
  coverUrl: string | null;
  play: number;
  like: number;
  comment: number;
  publishedAt: string;
};
```

---

## API 设计

### `GET /api/dashboard`

**响应**：
```json
{
  "stats": {
    "totalWorks": 48,
    "totalPlays": 125000,
    "totalEngagement": 8500,
    "recentWorks": 12,
    "avgPlay": 2500,
    "avgEngagement": 180
  },
  "fansTrend": [
    { "date": "2026-05-01", "fans": 100 },
    { "date": "2026-05-02", "fans": 105 },
    ...
  ],
  "workPerformance": [
    { "date": "2026-05-01", "play": 1000, "like": 50, "comment": 10 },
    ...
  ],
  "topWorks": [
    {
      "id": "cm...",
      "title": "作品标题",
      "coverUrl": "https://...",
      "play": 12500,
      "like": 850,
      "comment": 120,
      "publishedAt": "2026-05-30T..."
    },
    ...
  ]
}
```

---

## 实现步骤

### Step 1: Dashboard 数据聚合逻辑
- [ ] `lib/dashboard/stats.ts`
  - [ ] `getDashboardStats()` - 统计卡片数据
  - [ ] `getFansTrend()` - 粉丝趋势（近 30 天）
  - [ ] `getWorkPerformance()` - 作品表现（近 30 天）
  - [ ] `getTopWorks()` - Top 5 作品

### Step 2: API Route
- [ ] `app/api/dashboard/route.ts` (GET)

### Step 3: UI 组件
- [ ] `app/(app)/dashboard/page.tsx` - 主页面
- [ ] `components/dashboard/stat-card.tsx` - 统计卡片
- [ ] `components/dashboard/fans-trend-chart.tsx` - 粉丝趋势图
- [ ] `components/dashboard/work-performance-chart.tsx` - 作品表现图
- [ ] `components/dashboard/top-works-list.tsx` - Top 作品列表

### Step 4: 图表库
- 使用 Recharts（已在 Plan 2 中使用）

### Step 5: 测试
- [ ] 查看统计数据
- [ ] 验证图表展示
- [ ] 测试无数据情况

---

## 数据聚合逻辑

### 1. 统计卡片

```typescript
export async function getDashboardStats(accountId?: string) {
  const where = accountId ? { platformAccountId: accountId } : {};
  const since = new Date();
  since.setDate(since.getDate() - 30);

  // 总作品数
  const totalWorks = await db.work.count({ where });

  // 近 30 天作品
  const recentWorks = await db.work.count({
    where: { ...where, publishedAt: { gte: since } },
  });

  // 获取所有作品的最新指标
  const works = await db.work.findMany({
    where,
    include: {
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
  });

  let totalPlays = 0;
  let totalEngagement = 0;
  let recentPlays = 0;
  let recentEngagement = 0;
  let recentCount = 0;

  for (const work of works) {
    const metric = work.metrics[0];
    if (metric) {
      const engagement = metric.like + metric.comment + metric.share + metric.collect;
      totalPlays += metric.play;
      totalEngagement += engagement;

      if (work.publishedAt >= since) {
        recentPlays += metric.play;
        recentEngagement += engagement;
        recentCount++;
      }
    }
  }

  return {
    totalWorks,
    totalPlays,
    totalEngagement,
    recentWorks,
    avgPlay: recentCount > 0 ? Math.round(recentPlays / recentCount) : 0,
    avgEngagement: recentCount > 0 ? Math.round(recentEngagement / recentCount) : 0,
  };
}
```

### 2. 粉丝趋势

```typescript
export async function getFansTrend(accountId?: string, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = accountId ? { platformAccountId: accountId } : {};

  const metrics = await db.accountMetric.findMany({
    where: {
      ...where,
      snapshotAt: { gte: since },
    },
    orderBy: { snapshotAt: 'asc' },
  });

  return metrics.map(m => ({
    date: m.snapshotAt.toISOString().split('T')[0],
    fans: m.totalFans,
  }));
}
```

### 3. 作品表现

```typescript
export async function getWorkPerformance(accountId?: string, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = accountId ? { platformAccountId: accountId } : {};

  const works = await db.work.findMany({
    where: {
      ...where,
      publishedAt: { gte: since },
    },
    include: {
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
    orderBy: { publishedAt: 'asc' },
  });

  // 按日期聚合
  const byDate = new Map<string, { play: number; like: number; comment: number }>();

  for (const work of works) {
    const date = work.publishedAt.toISOString().split('T')[0];
    const metric = work.metrics[0];

    if (metric) {
      const existing = byDate.get(date) || { play: 0, like: 0, comment: 0 };
      byDate.set(date, {
        play: existing.play + metric.play,
        like: existing.like + metric.like,
        comment: existing.comment + metric.comment,
      });
    }
  }

  return Array.from(byDate.entries()).map(([date, data]) => ({
    date,
    ...data,
  }));
}
```

### 4. Top 作品

```typescript
export async function getTopWorks(accountId?: string, limit: number = 5) {
  const where = accountId ? { platformAccountId: accountId } : {};

  const works = await db.work.findMany({
    where,
    include: {
      metrics: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
    take: 100,
  });

  return works
    .filter(w => w.metrics[0])
    .sort((a, b) => (b.metrics[0]?.play || 0) - (a.metrics[0]?.play || 0))
    .slice(0, limit)
    .map(w => ({
      id: w.id,
      title: w.title,
      coverUrl: w.coverUrl,
      play: w.metrics[0]!.play,
      like: w.metrics[0]!.like,
      comment: w.metrics[0]!.comment,
      publishedAt: w.publishedAt,
    }));
}
```

---

## 图表配置

### 粉丝趋势图（折线图）

```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={fansTrend}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Line type="monotone" dataKey="fans" stroke="#8884d8" />
  </LineChart>
</ResponsiveContainer>
```

### 作品表现图（柱状图）

```tsx
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={workPerformance}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Bar dataKey="play" fill="#8884d8" name="播放" />
    <Bar dataKey="like" fill="#82ca9d" name="点赞" />
    <Bar dataKey="comment" fill="#ffc658" name="评论" />
  </BarChart>
</ResponsiveContainer>
```

---

## 无数据处理

当没有数据时，显示友好提示：
- 统计卡片显示 0
- 图表显示"暂无数据，请先同步作品"
- Top 作品显示"暂无作品数据"

---

## 预估工作量

- Step 1: 2 小时（数据聚合逻辑）
- Step 2: 0.5 小时（API Route）
- Step 3: 3 小时（UI 组件 + 图表）
- Step 4-5: 0.5 小时（测试）

**总计**：约 6 小时（0.75 天）

---

## 后续优化（v0.2+）

- 日期范围选择器（7天/30天/90天）
- 账号切换（多账号对比）
- 数据导出（CSV/Excel）
- 实时刷新
- 更多维度的图表（完播率、分享率等）
