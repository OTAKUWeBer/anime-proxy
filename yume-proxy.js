/**
 * INSTRUCTIONS:
 * 1. Create a Cloudflare account at https://dash.cloudflare.com/sign-up
 * 2. Create a new Worker (Workers & Pages > Create application > Create Worker).
 * 3. Copy this entire code and paste it into the Worker editor.
 * 4. Save and Deploy.
 * 5. Use your Worker URL (e.g., https://your-worker.your-subdomain.workers.dev) in your application.
 */

// If you want to hardcode a custom domain, set it here. 
// Otherwise, it auto-detects the URL it's running on.
let WORKER_BASE = ''; 

/* ─── CDN rule table ─────────────────────────────────────────────────────── */
const CDN_RULES = [
  { test: h => h.endsWith('.otakuu.se') || h === 'otakuu.se',
    referer: 'https://animex.one/', origin: 'https://animex.one', secSite: 'cross-site' },
  { test: h => h === 'vibeplayer.site' || h.endsWith('.vibeplayer.site'),
    referer: 'https://vibeplayer.site/', origin: 'https://vibeplayer.site', secSite: 'same-origin' },
  { test: h => h.endsWith('.mofl.pro') || h === 'mofl.pro',
    referer: 'https://kem.clvd.xyz/', origin: 'https://kem.clvd.xyz', secSite: 'cross-site' },
  { test: h => h.endsWith('.vidhosters.com') || h === 'vidhosters.com',
    referer: 'https://kem.clvd.xyz/', origin: 'https://kem.clvd.xyz', secSite: 'cross-site' },
  { test: h => h.endsWith('.burntburst45.store') || h === 'burntburst45.store',
    referer: null, origin: 'https://play2.echovideo.ru', secSite: 'cross-site' },
  { test: h => h.endsWith('.streamzone1.site') || h === 'streamzone1.site',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.zencloudz.cc') || h === 'zencloudz.cc',
    referer: 'https://aniwave.at/', origin: 'https://aniwave.at', secSite: 'cross-site' },
  { test: h => h.endsWith('.cinewave2.site') || h === 'cinewave2.site',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.watching.onl') || h === 'watching.onl',
    referer: 'https://vidwish.live/', origin: 'https://vidwish.live', secSite: 'cross-site' },
  { test: h => h.endsWith('.krussdomi.com') || h === 'krussdomi.com',
    referer: 'https://krussdomi.com/', origin: 'https://krussdomi.com', secSite: 'same-origin' },
  { test: h => h.endsWith('.owocdn.top') || h === 'owocdn.top',
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  { test: h => h.endsWith('.anime-dunya.com') || h === 'anime-dunya.com',
    referer: 'https://anime-dunya.com/', origin: 'https://anime-dunya.com', secSite: 'same-origin' },
  { test: h => h.startsWith('rrr.'),
    referer: 'https://megaup.nl/', origin: 'https://megaup.nl', secSite: 'cross-site' },
  { test: h => h === 'megaup.nl' || h.endsWith('.megaup.nl') || h === 'hub26link.site' || h.endsWith('.hub26link.site'),
    referer: 'https://megaup.nl/', origin: 'https://megaup.nl', secSite: 'cross-site' },
  { test: h => h.endsWith('.mewstream.buzz') || h === 'mewstream.buzz',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.vid-cdn.xyz') || h === 'vid-cdn.xyz',
    referer: 'https://anizone.to/', origin: 'https://anizone.to', secSite: 'cross-site' },
];

/**
 * TIP FOR USERS:
 * You can add more hosts to CDN_RULES above to support more websites.
 * 'test'    : A function that returns true if the host matches.
 * 'referer' : The Referer header required by the video provider.
 * 'origin'  : The Origin header required by the video provider.
 * 'secSite' : The Sec-Fetch-Site header (usually 'cross-site').
 */

/* ─── Base64url helpers ──────────────────────────────────────────────────── */
function b64uEncode(str) {
  // TextEncoder → Uint8Array → binary string → btoa → url-safe
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ─── Encode payload: "url\0referer" → base64url ─────────────────────────── */
function encodePayload(url, referer) {
  return b64uEncode(url + '\0' + (referer || ''));
}

/* ─── Decode payload: base64url → { url, ref } ───────────────────────────── */
function decodePayload(b64u) {
  try {
    const plain = b64uDecode(b64u);
    const idx = plain.indexOf('\0');
    if (idx === -1) return { url: plain, ref: null };
    return { url: plain.slice(0, idx), ref: plain.slice(idx + 1) || null };
  } catch {
    return null;
  }
}

/* ─── Browser impersonation headers ─────────────────────────────────────── */
function browserHeaders(referer, origin, secSite) {
  const h = {
    'User-Agent':         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':             '*/*',
    'Accept-Language':    'en-US,en;q=0.9',
    'Accept-Encoding':    'gzip, deflate, br',
    'Sec-Fetch-Dest':     'empty',
    'Sec-Fetch-Mode':     'cors',
    'Sec-Fetch-Site':     secSite || 'cross-site',
    'Sec-CH-UA':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-CH-UA-Mobile':   '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Connection':         'keep-alive',
    'Cache-Control':      'no-cache',
    'Pragma':             'no-cache',
  };
  if (referer) h['Referer'] = referer;
  if (origin)  h['Origin']  = origin;
  return h;
}

/* ─── CORS headers ───────────────────────────────────────────────────────── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':   '*',
    'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':  'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
    'Accept-Ranges':                 'bytes',
  };
}

/* ─── Resolve relative URL against base ─────────────────────────────────── */
function resolveUrl(rel, base) {
  if (/^https?:\/\//i.test(rel)) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
}

/* ─── Rewrite M3U8: all segment/key URIs → /p/<base64url> ───────────────── */
function rewriteM3u8(text, baseUrl, referer, workerBase) {
  const lines = text.split('\n');
  return lines.map(raw => {
    const line = raw.trim();

    // URI="..." attributes inside tags
    if (line.startsWith('#') && line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        return `URI="${workerBase}/p/${encodePayload(abs, referer)}"`;
      });
    }

    // Non-comment, non-empty → segment or child playlist
    if (line && !line.startsWith('#')) {
      const abs = resolveUrl(line, baseUrl);
      return `${workerBase}/p/${encodePayload(abs, referer)}`;
    }

    return raw;
  }).join('\n');
}

/* ─── Core proxy logic ───────────────────────────────────────────────────── */
async function proxyTarget(targetUrl, refParam, request) {
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== 'https:') throw new Error('https only');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid target URL — must be https' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const targetHost = parsedTarget.hostname.toLowerCase();
  const overrideReferer = refParam || null;

  const rule = CDN_RULES.find(r => r.test(targetHost));
  let effectiveReferer, effectiveOrigin, effectiveSecSite;

  if (rule) {
    effectiveReferer = overrideReferer || rule.referer || `https://${targetHost}/`;
    effectiveOrigin  = rule.origin || `https://${targetHost}`;
    effectiveSecSite = rule.secSite || 'cross-site';
  } else if (overrideReferer) {
    try {
      const refUrl = new URL(overrideReferer);
      effectiveReferer = overrideReferer;
      effectiveOrigin  = refUrl.origin;
      effectiveSecSite = 'cross-site';
    } catch {
      effectiveReferer = overrideReferer;
      effectiveOrigin  = `https://${targetHost}`;
      effectiveSecSite = 'cross-site';
    }
  } else {
    return new Response(
      JSON.stringify({ error: `Host not in CDN_RULES and no referer provided: ${targetHost}` }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  const headers = browserHeaders(effectiveReferer, effectiveOrigin, effectiveSecSite);
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) headers['Range'] = rangeHeader;

  let upstreamResp;
  try {
    upstreamResp = await fetch(targetUrl, {
      method:   request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  if (!upstreamResp.ok && upstreamResp.status !== 206) {
    return new Response(
      JSON.stringify({ error: 'Upstream error', status: upstreamResp.status }),
      { status: upstreamResp.status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  const contentType = (upstreamResp.headers.get('Content-Type') || '').toLowerCase();
  const isM3u8 = contentType.includes('mpegurl') || contentType.includes('x-mpegurl')
               || targetUrl.split('?')[0].endsWith('.m3u8');

  if (request.method === 'HEAD') {
    const h = { 'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/octet-stream', ...corsHeaders() };
    const cl = upstreamResp.headers.get('Content-Length');
    if (cl) h['Content-Length'] = cl;
    return new Response(null, { status: upstreamResp.status, headers: h });
  }

  if (isM3u8) {
    const text = await upstreamResp.text();
    const workerBase = WORKER_BASE || new URL(request.url).origin;
    const rewritten = rewriteM3u8(text, targetUrl, effectiveReferer, workerBase);
    return new Response(rewritten, {
      status: upstreamResp.status,
      headers: {
        'Content-Type':  'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        ...corsHeaders(),
      },
    });
  }

  // Binary / TS segment: stream as-is
  const passHeaders = {
    'Content-Type':  upstreamResp.headers.get('Content-Type') || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400, immutable',
    ...corsHeaders(),
  };
  const cl = upstreamResp.headers.get('Content-Length');
  if (cl) passHeaders['Content-Length'] = cl;
  const cr = upstreamResp.headers.get('Content-Range');
  if (cr) passHeaders['Content-Range'] = cr;

  return new Response(upstreamResp.body, { status: upstreamResp.status, headers: passHeaders });
}

/* ─── Main handler ───────────────────────────────────────────────────────── */
async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ ok: true, worker: 'yumezone-b64', ts: Date.now() }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  // ── Primary: /p/<base64url> ───────────────────────────────────────────────
  if (url.pathname.startsWith('/p/')) {
    const b64u = url.pathname.slice(3);
    const decoded = decodePayload(b64u);
    if (!decoded) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    return proxyTarget(decoded.url, decoded.ref, request);
  }

  // ── Legacy: /proxy?url=...&ref=... ────────────────────────────────────────
  if (url.pathname === '/proxy') {
    const targetRaw = url.searchParams.get('url');
    if (!targetRaw) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    let targetUrl;
    try { targetUrl = decodeURIComponent(targetRaw); } catch {
      return new Response(JSON.stringify({ error: 'Bad URL encoding' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    const refParam = url.searchParams.get('ref');
    return proxyTarget(targetUrl, refParam, request);
  }

  return new Response('Not found', { status: 404, headers: corsHeaders() });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
