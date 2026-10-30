import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware guard for /dashboard routes.
 * - Redirects unauthorized users to login page.
 * - Checks for presence of admin_auth cookie.
 * - Token validation happens in API routes (Node.js runtime).
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
    // No cookie present, redirect to login
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Cookie exists - proceed to dashboard
  // Note: Token validation happens in API routes (Node.js runtime)
  // If token is invalid, API calls will return 401
  return NextResponse.next();
}

// Apply only to /dashboard routes
export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};