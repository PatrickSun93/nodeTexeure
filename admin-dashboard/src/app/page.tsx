import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// '/' has no UI of its own: send signed-in staff to the dashboard and everyone
// else to the login page. Auth is detected the same way as src/middleware.ts —
// by the presence of the HttpOnly admin_auth cookie. The token itself is
// validated by the API; a stale cookie lands on /dashboard, whose auth guard
// then sends the user to /login (not back here, so there is no redirect loop).
export default async function Home() {
  const store = await cookies();
  redirect(store.get('admin_auth')?.value ? '/dashboard' : '/login');
}
