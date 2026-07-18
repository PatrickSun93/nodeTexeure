'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * The sign-in experience is consolidated onto /login (NextAuth's `pages.signIn`
 * target). This route now simply forwards to /login, preserving any query string
 * (e.g. ?redirect= or ?message=) so existing deep links keep working.
 */
function SignInRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/login${qs ? `?${qs}` : ''}`);
  }, [router, searchParams]);

  return null;
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInRedirect />
    </Suspense>
  );
}
