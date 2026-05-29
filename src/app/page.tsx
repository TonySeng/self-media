import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';

export default async function Root() {
  const session = await getCurrentSession();
  redirect(session ? '/dashboard' : '/login');
}
