/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Docs: https://nextjs.org/docs/app/guides/instrumentation
 *
 * We only start node-cron under the Node.js runtime. The Edge runtime cannot
 * load node-cron (it relies on `setTimeout`/`setInterval` and host APIs that
 * aren't available there), so we guard the dynamic import on
 * `process.env.NEXT_RUNTIME === 'nodejs'`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCron } = await import('@/lib/cron');
    await startCron();
  }
}
