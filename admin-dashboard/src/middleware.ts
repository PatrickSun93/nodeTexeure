import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware guard for /dashboard routes.
 * - Blocks unauthorized users BEFORE any dashboard UI renders.
 * - Validates presence of admin_auth cookie and confirms admin session with backend.
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
    const csrfCookie = req.cookies.get('csrf_token')?.value;
    const cookieHeader = `admin_auth=${adminAuth};${csrfCookie ? ` csrf_token=${csrfCookie};` : ''}`;

    const res = await fetch('http://localhost:6666/api/admin/users', {
      method: 'GET',
      // Forward cookies to backend for validation
      headers: {
        Cookie: cookieHeader,
        Accept: 'application/json',
      },
      // Avoid cached results
      cache: 'no-store',
    });

    if (res.status === 200) {
      // Authorized, proceed
      return NextResponse.next();
    }

    // Any non-200 status is treated as unauthorized
    return new Response('Unauthorized', { status: 401 });
  } catch {
    // On fetch errors or unexpected failures, fail closed
    return new Response('Unauthorized', { status: 401 });
  }
}

// Apply only to /dashboard routes
export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};