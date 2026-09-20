# Anime Proxy

High-performance, zero-dependency Cloudflare Worker designed to proxy HLS (`.m3u8`), video streams, and media assets. It bypasses **CORS restrictions**, **Referer checks**, and **Origin validation** by emulating browser headers and dynamically rewriting M3U8 playlists on the fly.

Everything is packed into **a single self-contained file** (`worker.js`) for effortless deployment.

---

## Features

- **All-In-One Worker**: Zero external runtime dependencies. 100% self-contained single file.
- **Dynamic M3U8 Playlist Rewriter**: Rewrites master playlists, media playlists, TS segments, sub-streams, initialization segments (`#EXT-X-MAP`), and AES decryption keys (`#EXT-X-KEY`) so all traffic flows through the proxy.
- **Browser Header Emulation**: Automatically injects modern browser `User-Agent`, `Sec-Fetch-*`, `Referer`, and `Origin` headers.
- **Full CORS & Seeking Support**: Handles HTTP preflight (`OPTIONS`), `Range` requests, and `206 Partial Content` for smooth video scrubbing.
- **URL-Safe Base64 Routing**: Prevents broken query strings and nested URL encoding issues.
- **Raw JSON API**: Clean, unstyled JSON responses for root `/`, `/guide`, `/rules`, `/encode`, and `/health`.

---

## Quick Deployment

### Option A: Cloudflare Dashboard (Manual)
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and log in.
2. Navigate to **Workers & Pages** > **Create application** > **Create Worker**.
3. Name your worker (e.g. `anime-proxy`) and click **Deploy**.
4. Click **Edit Code**.
5. Replace the entire editor contents with the code inside [`worker.js`](./worker.js).
6. Click **Save and Deploy**.

### Option B: Wrangler CLI
1. Clone this repository:
   ```bash
   git clone https://github.com/OTAKUWeBer/anime-proxy.git
   cd anime-proxy
   ```
2. Deploy directly:
   ```bash
   npx wrangler deploy
   ```

---

## API Endpoints

All non-stream endpoints return raw JSON responses:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | API status, quick overview, and endpoint map. |
| `/guide` or `/docs` | `GET` | Comprehensive documentation, code examples (JS/Python), and integration guides. |
| `/health` or `/ping` | `GET` | Healthcheck and uptime probe. |
| `/rules` | `GET` | Lists all preconfigured CDN domain matchers and referer overrides. |
| `/encode?url=...&ref=...` | `GET` | Helper tool that generates ready-to-use Base64 payload URLs. |
| `/p/:payload` | `GET`, `HEAD` | **Primary proxy endpoint** using URL-safe Base64 (`url\0referer`). |
| `/proxy?url=...&ref=...` | `GET`, `HEAD` | Standard query-parameter proxy endpoint. |

---

## Usage Examples

### 1. Base64 URL Encoding (Recommended)
The payload is composed of `TARGET_URL` and optional `REFERER` separated by a null byte (`\0`), encoded as URL-safe Base64:

```
https://your-worker.workers.dev/p/<BASE64_URL_SAFE_PAYLOAD>
```

#### JavaScript / TypeScript Helper:
```javascript
function createProxyUrl(workerOrigin, videoUrl, referer = '') {
  const raw = referer ? `${videoUrl}\0${referer}` : videoUrl;
  const b64u = btoa(raw)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${workerOrigin}/p/${b64u}`;
}

const streamUrl = createProxyUrl(
  'https://anime-proxy.your-subdomain.workers.dev',
  'https://example-cdn.com/stream/index.m3u8',
  'https://animex.one/'
);
console.log(streamUrl);
```

#### Python Helper:
```python
import base64

def create_proxy_url(worker_origin, video_url, referer=""):
    payload = f"{video_url}\0{referer}" if referer else video_url
    b64u = base64.urlsafe_b64encode(payload.encode('utf-8')).decode('utf-8').rstrip('=')
    return f"{worker_origin}/p/{b64u}"
```

---

### 2. Query Parameter Format
You can also pass standard URL-encoded parameters:
```
https://your-worker.workers.dev/proxy?url=https%3A%2F%2Fexample.com%2Fstream.m3u8&ref=https%3A%2F%2Freferer.com%2F
```

---

### 3. Video Player Integration

#### Hls.js Example:
```html
<video id="player" controls width="800"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const video = document.getElementById('player');
  const streamUrl = 'https://anime-proxy.your-subdomain.workers.dev/proxy?url=' + 
                    encodeURIComponent('https://example-cdn.com/stream.m3u8');

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl;
  }
</script>
```

---

## Adding Custom CDN Rules

To add a new CDN with default headers, add an entry to the `CDN_RULES` array in [`worker.js`](./worker.js):

```javascript
{
  test: h => h.endsWith('.examplecdn.com') || h === 'examplecdn.com',
  referer: 'https://allowed-referer.com/',
  origin: 'https://allowed-referer.com',
  secSite: 'cross-site'
}
```

---

## License
MIT License. Free to use, modify, and distribute.
