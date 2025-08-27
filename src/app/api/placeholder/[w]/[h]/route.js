// Next.js App Router API route: Dynamic placeholder image generator (SVG)
// Provides a lightweight placeholder at /api/placeholder/:w/:h
// Example: /api/placeholder/800/600 -> 4:3 grey box with centered dimensions text

/**
 * GET /api/placeholder/:w/:h
 * Generates an SVG placeholder image with the requested width and height.
 * - Validates and clamps dimensions to a safe maximum.
 * - Returns image/svg+xml content with cache headers.
 *
 * Security: Only numeric params are accepted; SVG is constructed without user-controlled markup.
 */
export async function GET(_req, context) {
  // Await dynamic params per Next.js guidance
  const { w, h } = await context.params;

  // Parse and validate dimensions
  const parseDim = (v) => {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const requestedWidth = parseDim(w);
  const requestedHeight = parseDim(h);

  if (!requestedWidth || !requestedHeight) {
    return new Response('Invalid dimensions. Use /api/placeholder/{width}/{height}', { status: 400 });
  }

  // Clamp to avoid excessive values
  const MAX_DIMENSION = 2000;
  const width = Math.min(requestedWidth, MAX_DIMENSION);
  const height = Math.min(requestedHeight, MAX_DIMENSION);

  // Colors and typography
  const bg = '#e5e7eb'; // gray-200
  const fg = '#9ca3af'; // gray-400
  const text = `${width}×${height}`;
  const fontSize = Math.max(10, Math.round(Math.min(width, height) / 5));

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<text x="50%" y="50%" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="${fontSize}" dominant-baseline="middle" text-anchor="middle" fill="${fg}">${text}</text>` +
    `</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Cache for a day; fine for fixed-dimension placeholders
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}