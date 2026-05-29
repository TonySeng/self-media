import { Sidebar } from '@/components/layout/sidebar';
import { CookieExpiredBanner } from '@/components/platforms/cookie-expired-banner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <CookieExpiredBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
