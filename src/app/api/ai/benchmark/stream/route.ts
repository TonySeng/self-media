import { z } from 'zod';
import {
  streamBenchmark,
  streamBenchmarkByAccounts,
} from '@/lib/ai-tasks/benchmark';
import { createSSEResponse } from '@/lib/sse';

const RequestSchema = z
  .object({
    accountId: z.string().min(1),
    ownTopN: z.number().int().min(1).max(20).optional(),
    benchmarkIds: z.array(z.string()).min(1).max(10).optional(),
    benchmarkAccountIds: z.array(z.string()).min(1).max(5).optional(),
  })
  .refine(
    (d) =>
      (d.benchmarkIds && d.benchmarkIds.length > 0) ||
      (d.benchmarkAccountIds && d.benchmarkAccountIds.length > 0),
    {
      message: 'Either benchmarkIds or benchmarkAccountIds is required',
    },
  );

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const ownTopN = parsed.data.ownTopN ?? 5;

  if (
    parsed.data.benchmarkAccountIds &&
    parsed.data.benchmarkAccountIds.length > 0
  ) {
    return createSSEResponse(
      streamBenchmarkByAccounts(
        parsed.data.benchmarkAccountIds,
        parsed.data.accountId,
        ownTopN,
      ),
    );
  }

  return createSSEResponse(
    streamBenchmark(
      parsed.data.benchmarkIds!,
      parsed.data.accountId,
      ownTopN,
    ),
  );
}
