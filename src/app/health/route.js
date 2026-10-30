// GET /health — liveness/readiness for the storefront container (the Next.js
// server is up) and the deployed commit, which the deploy workflow compares
// with the one it just rolled out. It does not call the backend: that has its
// own probe, and a backend outage shouldn't restart the storefront.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok', version: process.env.GIT_SHA || 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
