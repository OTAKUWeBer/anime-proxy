/**
 * ============================================================================
 * Anime Proxy - High Performance HLS / Video Stream CORS Proxy
 * Target Environment: Cloudflare Workers (Single-File Zero Dependency)
 * ============================================================================
 * 
 * QUICK CLOUDFLARE DASHBOARD SETUP:
 * 1. Log in to https://dash.cloudflare.com/
 * 2. Go to "Workers & Pages" > "Create application" > "Create Worker"
 * 3. Name your worker (e.g. `anime-proxy`) and click "Deploy"
 * 4. Click "Edit Code"
 * 5. Replace all contents in the editor with this entire file and click "Save and Deploy"
 * 6. Access your worker at: https://<worker-name>.<your-subdomain>.workers.dev
 * 
 * WRANGLER CLI SETUP:
 * 1. Run `npx wrangler deploy` in this project directory.
 * 
 * AVAILABLE JSON ENDPOINTS:
 * - GET /                  -> Home page (API status, endpoints directory, version)
 * - GET /guide (or /docs)  -> Full developer guide, code examples (JS/Python), integration tips
 * - GET /health (or /ping) -> Liveness and status probe
 * - GET /rules             -> Pre-configured CDN rules & referer overrides
 * - GET /encode?url=&ref=  -> Helper utility to generate base64 proxy links
 * - GET /p/:payload        -> URL-safe Base64 stream proxy (Primary)
 * - GET /proxy?url=&ref=   -> Query-parameter stream proxy
 * ============================================================================
 */

// Custom domain override if needed (empty = auto-detect incoming host)
let WORKER_BASE = '';

/* ─── Pre-configured CDN Header Rules ─────────────────────────────────────── */
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
  { test: h => h.endsWith('.animesrc.stream') || h === 'animesrc.stream',
    referer: 'https://animesrc.stream/', origin: 'https://animesrc.stream', secSite: 'same-origin' },
  { test: h => h.endsWith('.bunnycdn.ru') || h === 'bunnycdn.ru',
    referer: 'https://bunnycdn.ru/', origin: 'https://bunnycdn.ru', secSite: 'same-origin' },
];

/* ─── URL-Safe Base64 Helpers ────────────────────────────────────────────── */
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(b64u) {
  let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (b64.length % 4)) % 4;
  b64 += '='.repeat(padLength);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodePayload(url, referer) {
  return b64uEncode(url + '\0' + (referer || ''));
}

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

/* ─── Headers & CORS ─────────────────────────────────────────────────────── */
function browserHeaders(referer, origin, secSite) {
  const h = {
    'User-Agent':         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept':             '*/*',
    'Accept-Language':    'en-US,en;q=0.9',
    'Accept-Encoding':    'gzip, deflate, br, zstd',
    'Sec-Fetch-Dest':     'empty',
    'Sec-Fetch-Mode':     'cors',
    'Sec-Fetch-Site':     secSite || 'cross-site',
    'Sec-CH-UA':          '"Chromium";v="128", "Google Chrome";v="128", "Not;A=Brand";v="24"',
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

function corsHeaders(custom = {}) {
  return {
    'Access-Control-Allow-Origin':   '*',
    'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':  'Range, Content-Type, Authorization, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges, Date',
    'Accept-Ranges':                 'bytes',
    ...custom,
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...corsHeaders(extraHeaders),
    },
  });
}

function resolveUrl(rel, base) {
  if (/^https?:\/\//i.test(rel)) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
}

/* ─── M3U8 Manifest Rewriter ────────────────────────────────────────────── */
function rewriteM3u8(text, baseUrl, referer, workerBase) {
  const lines = text.split('\n');
  return lines.map(raw => {
    const line = raw.trim();
    if (!line) return raw;

    // Handle URI attributes in tags (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, etc.)
    if (line.startsWith('#') && line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        return `URI="${workerBase}/p/${encodePayload(abs, referer)}"`;
      });
    }

    // Media segments and sub-manifests
    if (!line.startsWith('#')) {
      const abs = resolveUrl(line, baseUrl);
      return `${workerBase}/p/${encodePayload(abs, referer)}`;
    }

    return raw;
  }).join('\n');
}

/* ─── Stream Proxying Logic ──────────────────────────────────────────────── */
async function proxyTarget(targetUrl, refParam, request) {
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') {
      throw new Error('Unsupported protocol');
    }
  } catch {
    return jsonResponse({
      error: 'Invalid target URL',
      message: 'The requested target URL must be a valid HTTP or HTTPS address.'
    }, 400);
  }

  const targetHost = parsedTarget.hostname.toLowerCase();
  const overrideReferer = refParam ? refParam.trim() : null;

  const rule = CDN_RULES.find(r => r.test(targetHost));
  let effectiveReferer, effectiveOrigin, effectiveSecSite;

  if (rule) {
    effectiveReferer = overrideReferer || rule.referer || `https://${targetHost}/`;
    effectiveOrigin  = rule.origin || (effectiveReferer ? new URL(effectiveReferer).origin : `https://${targetHost}`);
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
    // Auto fallback to target host origin
    effectiveReferer = `https://${targetHost}/`;
    effectiveOrigin  = `https://${targetHost}`;
    effectiveSecSite = 'cross-site';
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
    return jsonResponse({
      error: 'Upstream Fetch Failed',
      message: 'Could not connect to or receive data from the upstream media server.',
      target_url: targetUrl,
      detail: String(err)
    }, 502);
  }

  if (!upstreamResp.ok && upstreamResp.status !== 206) {
    return jsonResponse({
      error: 'Upstream Error',
      status: upstreamResp.status,
      status_text: upstreamResp.statusText,
      target_url: targetUrl
    }, upstreamResp.status >= 400 && upstreamResp.status < 600 ? upstreamResp.status : 502);
  }

  const contentType = (upstreamResp.headers.get('Content-Type') || '').toLowerCase();
  const isM3u8 = contentType.includes('mpegurl') ||
                 contentType.includes('x-mpegurl') ||
                 parsedTarget.pathname.toLowerCase().endsWith('.m3u8') ||
                 parsedTarget.pathname.toLowerCase().includes('.m3u8');

  if (request.method === 'HEAD') {
    const headHeaders = {
      'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/octet-stream',
      ...corsHeaders()
    };
    const cl = upstreamResp.headers.get('Content-Length');
    if (cl) headHeaders['Content-Length'] = cl;
    return new Response(null, { status: upstreamResp.status, headers: headHeaders });
  }

  if (isM3u8) {
    const text = await upstreamResp.text();
    const workerBase = WORKER_BASE || new URL(request.url).origin;
    const rewritten = rewriteM3u8(text, targetUrl, effectiveReferer, workerBase);
    return new Response(rewritten, {
      status: upstreamResp.status,
      headers: {
        'Content-Type':  'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders(),
      },
    });
  }

  // Stream binary media content (TS segments, MP4, AAC, images, keys)
  const passHeaders = {
    'Content-Type':  upstreamResp.headers.get('Content-Type') || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400, immutable',
    ...corsHeaders(),
  };
  const cl = upstreamResp.headers.get('Content-Length');
  if (cl) passHeaders['Content-Length'] = cl;
  const cr = upstreamResp.headers.get('Content-Range');
  if (cr) passHeaders['Content-Range'] = cr;

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    headers: passHeaders
  });
}

/* ─── JSON Route Handlers ─────────────────────────────────────────────────── */

function handleHome(reqUrl) {
  const origin = WORKER_BASE || reqUrl.origin;
  return jsonResponse({
    name: 'Anime Proxy API',
    description: 'High-performance HLS/m3u8 and video media stream CORS proxy worker.',
    version: '2.0.0',
    status: 'online',
    endpoints: {
      home: `${origin}/`,
      guide: `${origin}/guide`,
      health: `${origin}/health`,
      rules: `${origin}/rules`,
      encode_helper: `${origin}/encode?url={TARGET_URL}&ref={REFERER}`,
      proxy_base64: `${origin}/p/{ENCODED_PAYLOAD}`,
      proxy_query: `${origin}/proxy?url={TARGET_URL}&ref={OPTIONAL_REFERER}`
    },
    quick_start: {
      recommended_method: '/p/<base64url_payload>',
      encoding_format: 'base64url(URL + "\\0" + REFERER)',
      docs: `${origin}/guide`
    }
  });
}

function handleGuide(reqUrl) {
  const origin = WORKER_BASE || reqUrl.origin;
  return jsonResponse({
    title: 'Anime Proxy Developer Guide & Documentation',
    version: '2.0.0',
    overview: 'This proxy solves CORS, Referer, and Origin restrictions for streaming anime and video files across browsers and video players.',
    endpoints: [
      {
        path: '/p/:payload',
        method: 'GET | HEAD',
        description: 'Primary proxy endpoint. Proxies media streams and rewrites .m3u8 manifests so all sub-segments and keys route through this proxy.',
        parameters: {
          payload: 'URL-Safe Base64 encoded string of "TARGET_URL\\0REFERER" (or just "TARGET_URL")'
        },
        example: `${origin}/p/aHR0cHM6Ly9leGFtcGxlLmNvbS9zdHJlYW0ubTN1OA`
      },
      {
        path: '/proxy?url=:url&ref=:ref',
        method: 'GET | HEAD',
        description: 'Standard query parameter proxy endpoint.',
        parameters: {
          url: 'Fully-qualified target video or m3u8 URL (URL-encoded)',
          ref: 'Optional Referer header to send to upstream CDN (URL-encoded)'
        },
        example: `${origin}/proxy?url=https%3A%2F%2Fexample.com%2Fstream.m3u8&ref=https%3A%2F%2Fplayer.site%2F`
      },
      {
        path: '/encode?url=:url&ref=:ref',
        method: 'GET',
        description: 'Helper API that constructs the base64 URL payload and returns ready-to-use proxy links.',
        parameters: {
          url: 'Target URL to encode (required)',
          ref: 'Referer header to encode (optional)'
        },
        example: `${origin}/encode?url=https://example.com/stream.m3u8&ref=https://player.site/`
      },
      {
        path: '/health',
        method: 'GET',
        description: 'Liveness check and service status.',
        example: `${origin}/health`
      },
      {
        path: '/rules',
        method: 'GET',
        description: 'Lists all pre-configured CDN rules, domain matchers, and referer mappings.',
        example: `${origin}/rules`
      }
    ],
    encoding_guide: {
      concept: 'The proxy accepts a URL-safe Base64 payload containing the video URL and an optional Referer separated by a null byte (\\0).',
      javascript_snippet: `function getProxyUrl(targetUrl, referer = '') {
  const payload = btoa(unescape(encodeURIComponent(targetUrl + (referer ? '\\0' + referer : ''))))
    .replace(/\\+/g, '-')
    .replace(/\\//g, '_')
    .replace(/=+$/, '');
  return "${origin}/p/" + payload;
}`,
      python_snippet: `import base64

def get_proxy_url(target_url, referer=""):
    data = f"{target_url}\\0{referer}" if referer else target_url
    b64 = base64.urlsafe_b64encode(data.encode('utf-8')).decode('utf-8').rstrip('=')
    return f"${origin}/p/{b64}"`
    },
    player_integration: {
      hls_js: `const video = document.getElementById('video');
const proxyUrl = '${origin}/proxy?url=' + encodeURIComponent('https://example.com/playlist.m3u8');

if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(proxyUrl);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
}`,
      html5_native: `<video controls src="${origin}/proxy?url=https%3A%2F%2Fexample.com%2Fstream.m3u8"></video>`
    },
    status_codes: {
      "200": "Successful stream or manifest retrieval",
      "206": "Partial Content (for byte-range video seeking)",
      "400": "Invalid URL or malformed Base64 payload",
      "404": "Endpoint not found",
      "502": "Upstream CDN error or unreachable target"
    }
  });
}

function handleHealth() {
  return jsonResponse({
    status: 'ok',
    service: 'anime-proxy',
    uptime_check: true,
    timestamp: Date.now(),
    iso_date: new Date().toISOString()
  });
}

function handleRules() {
  return jsonResponse({
    total_rules: CDN_RULES.length,
    rules: CDN_RULES.map((rule, index) => ({
      index,
      referer: rule.referer || '(auto-host)',
      origin: rule.origin || '(auto-origin)',
      sec_fetch_site: rule.secSite || 'cross-site'
    }))
  });
}

function handleEncode(reqUrl) {
  const targetUrl = reqUrl.searchParams.get('url');
  const referer = reqUrl.searchParams.get('ref') || '';

  if (!targetUrl) {
    return jsonResponse({
      error: 'Missing URL parameter',
      message: 'Provide ?url=https://... to generate an encoded payload.'
    }, 400);
  }

  const origin = WORKER_BASE || reqUrl.origin;
  const payload = encodePayload(targetUrl, referer);
  const proxyUrl = `${origin}/p/${payload}`;
  const queryProxyUrl = `${origin}/proxy?url=${encodeURIComponent(targetUrl)}${referer ? `&ref=${encodeURIComponent(referer)}` : ''}`;

  return jsonResponse({
    target_url: targetUrl,
    referer: referer || null,
    encoded_payload: payload,
    proxy_url: proxyUrl,
    legacy_query_url: queryProxyUrl,
    test_curl: `curl -i "${proxyUrl}"`
  });
}

/* ─── Main Router ─────────────────────────────────────────────────────────── */
async function handleRequest(request) {
  const url = new URL(request.url);

  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Home endpoint (Raw JSON)
  if (url.pathname === '/' || url.pathname === '') {
    return handleHome(url);
  }

  // Guide / Docs endpoint (Raw JSON)
  if (url.pathname === '/guide' || url.pathname === '/docs' || url.pathname === '/help') {
    return handleGuide(url);
  }

  // Health check endpoint
  if (url.pathname === '/health' || url.pathname === '/ping') {
    return handleHealth();
  }

  // CDN Rules endpoint
  if (url.pathname === '/rules') {
    return handleRules();
  }

  // Encode Helper endpoint
  if (url.pathname === '/encode') {
    return handleEncode(url);
  }

  // Base64 Proxy: /p/<base64url>
  if (url.pathname.startsWith('/p/')) {
    const b64u = url.pathname.slice(3);
    if (!b64u) {
      return jsonResponse({ error: 'Missing base64 payload in path /p/<payload>' }, 400);
    }
    const decoded = decodePayload(b64u);
    if (!decoded || !decoded.url) {
      return jsonResponse({ error: 'Invalid or corrupted Base64 payload' }, 400);
    }
    return proxyTarget(decoded.url, decoded.ref, request);
  }

  // Query Param Proxy: /proxy?url=...&ref=...
  if (url.pathname === '/proxy') {
    const targetRaw = url.searchParams.get('url');
    if (!targetRaw) {
      return jsonResponse({
        error: 'Missing ?url= parameter',
        usage: `${(WORKER_BASE || url.origin)}/proxy?url=https://example.com/video.m3u8&ref=https://referer.com`
      }, 400);
    }
    let targetUrl;
    try {
      targetUrl = decodeURIComponent(targetRaw);
    } catch {
      return jsonResponse({ error: 'Malformed target URL encoding' }, 400);
    }
    const refParam = url.searchParams.get('ref');
    return proxyTarget(targetUrl, refParam, request);
  }

  return jsonResponse({
    error: 'Not Found',
    message: `The path '${url.pathname}' does not exist on this proxy server.`,
    available_endpoints: ['/', '/guide', '/health', '/rules', '/encode', '/p/:payload', '/proxy']
  }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
