// Next.js App Router API route: image resolver for placeholder slots.
// Instead of a grey box, this serves a real bedding photo from
// public/images/bedding so product cards, collections, and detail pages all
// show imagery.
//
//   /api/placeholder/:w/:h              -> a bedding image derived from the size
//   /api/placeholder/:w/:h?seed=PRODabc -> a stable image derived from the seed
//                                          (pass a product id for per-product variety)

const IMAGE_COUNT = 12; // public/images/bedding/bed-1.jpg .. bed-12.jpg

// Small deterministic string hash (djb2) so the same seed always maps to the
// same image (stable across renders / SSR + client).
function pickImage(seed) {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash * 33) ^ seed.charCodeAt(i)) >>> 0;
  }
  return (hash % IMAGE_COUNT) + 1;
}

export async function GET(req, context) {
  const { w, h } = await context.params;

  const parseDim = (v) => {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (!parseDim(w) || !parseDim(h)) {
    return new Response('Invalid dimensions. Use /api/placeholder/{width}/{height}', { status: 400 });
  }

  const url = new URL(req.url);
  const seed = url.searchParams.get('seed') || `${w}x${h}`;
  const idx = pickImage(String(seed));

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/images/bedding/bed-${idx}.jpg`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
