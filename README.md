# YumeZone HLS Proxy Worker

A lightweight, high-performance Cloudflare Worker designed to proxy HLS (m3u8) streams. It bypasses CORS restrictions and Referer requirements by impersonating a browser and rewriting manifest files on the fly.

## ✨ Features
- **Auto-Detection**: No need to hardcode your worker URL.
- **Base64 Routing**: Securely encodes target URLs and referers to prevent breakage.
- **HLS Manifest Rewriting**: Automatically rewrites segment URLs inside `.m3u8` files to route through the proxy.
- **Browser Impersonation**: Sends realistic headers to bypass basic anti-bot protections.
- **CORS Enabled**: Works out of the box with web players like Plyr, Video.js, and Hls.js.

## 🚀 Setup Instructions

> [!IMPORTANT]
> You must perform these steps yourself on your own Cloudflare account to host your own instance of the proxy.

### 1. Create a Cloudflare Account
1. Sign up for a free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Verify your email to activate your account.

### 2. Create an API Token (Optional)
> [!CAUTION]
> Never share your API token. This is a private key for your own account.

If you want to use automated tools (like Wrangler) or manage your worker from an external app, create a token on **your** account:
1. Go to **My Profile** > **API Tokens**.
2. Click **Create Token** > **Create Custom Token**.
3. Set the following permissions:
    - **Account** — **Account Settings** — **Read**
    - **User** — **Workers Script** — **Edit**
4. Click **Continue to summary** and **Create Token**.
5. Copy the token and keep it safe. **You do not need this if you are deploying manually via the website.**

### 3. Deploy the Worker
1. In the Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Create Worker**.
2. Give it a name (e.g., `hls-proxy`) and click **Deploy**.
3. Click **Edit Code**.
4. Delete the default code and paste the contents of `yume-proxy.js`.
5. Click **Save and Deploy**.

## 🛠️ Usage

Once deployed, your worker will be available at `https://your-worker.your-subdomain.workers.dev`.

### Method 1: Base64 (Recommended)
This is the most reliable way to proxy streams. The payload is `URL\0Referer` encoded in URL-safe Base64.
`https://your-worker.dev/p/<base64_payload>`

### Method 2: Legacy Query Parameters
`https://your-worker.dev/proxy?url=ENCODED_URL&ref=REFERER`

## ⚙️ Adding New Providers
If a video host requires a specific Referer or Origin, you can add a rule to the `CDN_RULES` array in `yume-proxy.js`:

```javascript
{ 
  test: h => h.endsWith('.newhost.com'),
  referer: 'https://allowed-site.com/',
  origin: 'https://allowed-site.com',
  secSite: 'cross-site' 
}
```

## 📄 License
Open-source software. Use responsibly.
