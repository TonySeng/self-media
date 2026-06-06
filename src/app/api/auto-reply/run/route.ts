import { NextResponse } from 'next/server';
import { runAutoReplyForAllAccounts } from '@/lib/cron';

export async function POST(): Promise<NextResponse> {
  try {
    const result = await runAutoReplyForAllAccounts();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'execution_failed', message: String(error) },
      { status: 500 }
    );
  }
}
