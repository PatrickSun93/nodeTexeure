import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware guard for /dashboard routes.
 * - Blocks unauthorized users BEFORE any dashboard UI renders.
 * - Validates presence of admin_auth cookie by confirming with backend.
 * - Returns 401 "Unauthorized" plain text on failure.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /dashboard and its subpaths
  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  // Check auth cookie
  const adminAuth = req.cookies.get('admin_auth')?.value;
  if (!adminAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Validate cookie against backend (no CSRF required for GET)
  try {
    // Build cookie header: admin_auth alone is sufficient for GET to admin endpoints
    const cookieHeader = `admin_auth=${adminAuth}`;

    const res = await fetch('http://127.0.0.1:6666/api/admin/users', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.status === 200) {
      // Authorized, proceed
      return NextResponse.next();
    }

    console.error(`Middleware auth failed: Status ${res.status}`);
    // Any non-200 status is treated as unauthorized
    return new Response('Unauthorized', { status: 401 });
  } catch (err) {
    console.error('Middleware fetch error:', err);
    // On fetch errors or unexpected failures, fail closed
    return new Response('Unauthorized', { status: 401 });
  }
}

// Apply only to /dashboard routes
export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};