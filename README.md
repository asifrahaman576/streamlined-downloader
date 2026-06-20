# StreamlineDL — Link Resolver & CDN-Direct Download Manager

## How It Works

Users paste hosting links (FuckingFast, etc.), the server extracts the real CDN URL, and the browser downloads **directly from the CDN** at full user internet speed. No files are stored on the server.

```
User pastes URL → Server resolves CDN link (~2s) → Browser downloads directly from CDN
```

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Railway (Free)

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set environment variable: `NODE_ENV=production`
4. Deploy!

Railway auto-detects Node.js. Server needs minimal resources (just URL resolution).

## Deploy to Render (Free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Build command: `npm run build`
4. Start command: `npm start`
5. Environment: `NODE_ENV=production`

## Manual VPS Deploy

```bash
git clone <your-repo>
cd downloader
npm ci
npm run build
NODE_ENV=production npm start
```

Use nginx as reverse proxy on port 80/443 → 3000.