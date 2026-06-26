import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pathModule from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = pathModule.join(__dirname, 'telemetry.json');
const BACKUP_FILE = pathModule.join(__dirname, 'telemetry.backup.json');

// SECURITY: Require ADMIN_PASSWORD from environment variable - no hardcoded fallback
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('FATAL: ADMIN_PASSWORD environment variable is required.');
  process.exit(1);
}

// Input length caps for sanitization
const MAX_DISTINCT_ID_LENGTH = 128;
const MAX_STRING_FIELD_LENGTH = 256;
const MAX_EVENT_LENGTH = 128;

// Rate limiting configuration: 30 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitStore = new Map();

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }

  const timestamps = rateLimitStore.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitStore.set(ip, timestamps);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Limit: 30 per minute.' });
  }

  timestamps.push(now);
  next();
}

// Periodically clean up stale rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitStore.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, valid);
    }
  }
}, 5 * 60 * 1000);

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static landing page files
app.use(express.static(pathModule.join(__dirname, 'public')));

// Input sanitization helper: trim and cap length
function sanitizeString(value, maxLength = MAX_STRING_FIELD_LENGTH) {
  if (typeof value !== 'string') return 'unknown';
  return value.trim().slice(0, maxLength);
}

function initDatabase() {
  if (!fs.existsSync(DATA_FILE)) {
    const emptyData = { devices: {}, pings: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(emptyData, null, 2), 'utf8');
  }
}

function readData() {
  try {
    initDatabase();
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading telemetry data:', err);
    return { devices: {}, pings: [] };
  }
}

function writeData(data) {
  try {
    // Write backup first for data persistence
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2), 'utf8');
    // Then write the primary file
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing telemetry data:', err);
  }
}

// Simple cookie parser helper
function getAdminCookie(req) {
  const cookies = req.headers.cookie || '';
  const parsed = {};
  cookies.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length === 2) {
      parsed[parts[0].trim()] = parts[1].trim();
    }
  });
  return parsed['admin_session'];
}

// Authentication middleware
function requireAdmin(req, res, next) {
  const session = getAdminCookie(req);
  if (session === ADMIN_PASSWORD) {
    return next();
  }

  // Also check query param as fallback
  if (req.query.secret === ADMIN_PASSWORD) {
    return next();
  }

  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.redirect('/admin/login');
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Ingest telemetry ping (Public - no auth required, rate limited)
app.post('/api/telemetry/ping', rateLimiter, (req, res) => {
  const { event, properties } = req.body;

  if (!properties || !properties.distinct_id) {
    return res.status(400).json({ error: 'Missing distinct_id in properties' });
  }

  // Validate distinct_id: reject empty or whitespace-only values
  const distinctId = typeof properties.distinct_id === 'string' ? properties.distinct_id.trim() : '';
  if (!distinctId || distinctId.length === 0) {
    return res.status(400).json({ error: 'distinct_id cannot be empty or whitespace' });
  }

  // Sanitize all inputs with length caps
  const installId = sanitizeString(distinctId, MAX_DISTINCT_ID_LENGTH);
  const sanitizedEvent = event ? sanitizeString(event, MAX_EVENT_LENGTH) : 'ping';
  const platform = sanitizeString(properties.platform || 'unknown');
  const arch = sanitizeString(properties.arch || 'unknown');
  const appVersion = sanitizeString(properties.app_version || 'unknown');
  const osVersion = sanitizeString(properties.os_version || 'unknown');

  const data = readData();
  const now = new Date().toISOString();

  if (!data.devices[installId]) {
    data.devices[installId] = {
      installationId: installId,
      firstSeen: now,
      lastSeen: now,
      platform: platform,
      arch: arch,
      version: appVersion,
      osVersion: osVersion
    };
  } else {
    data.devices[installId].lastSeen = now;
    data.devices[installId].platform = platform;
    data.devices[installId].arch = arch;
    data.devices[installId].version = appVersion;
    data.devices[installId].osVersion = osVersion;
  }

  data.pings.push({
    installationId: installId,
    timestamp: now,
    platform: platform,
    version: appVersion
  });

  if (data.pings.length > 50000) {
    data.pings.shift();
  }

  writeData(data);
  console.log(`[Telemetry] Ping received: ${installId}`);
  res.json({ success: true });
});

// Admin Authentication Login Endpoint
app.get('/admin/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>StreamlineDL Analytics | Login</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet"/>
      <style>
        body {
          font-family: 'Outfit', sans-serif;
          background: radial-gradient(circle at top right, #111827, #030712);
        }
      </style>
    </head>
    <body class="min-h-screen flex items-center justify-center text-slate-100 p-6">
      <div class="w-full max-w-md bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-8 shadow-2xl">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">StreamlineDL</h2>
          <p class="text-slate-400 text-sm mt-2">Enter admin credentials to access telemetry</p>
        </div>
        
        <form method="POST" action="/admin/login" class="space-y-6">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Password</label>
            <input type="password" name="password" required placeholder="••••••••" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"/>
          </div>
          
          <button type="submit" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-colors">
            Access Dashboard
          </button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin_session', ADMIN_PASSWORD, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
    return res.redirect('/admin');
  }
  res.send(`
    <script>
      alert('Incorrect password!');
      window.location.href = '/admin/login';
    </script>
  `);
});

// Admin Dashboard Gate (Requires auth)
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(pathModule.join(__dirname, 'admin.html'));
});

// Admin Log Out
app.get('/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.redirect('/admin/login');
});

// Protected stats API
app.get('/api/telemetry/stats', requireAdmin, (req, res) => {
  const data = readData();
  const now = new Date();

  const devicesList = Object.values(data.devices);
  const totalInstalls = devicesList.length;

  const msInDay = 24 * 60 * 60 * 1000;
  const oneDayAgo = new Date(now.getTime() - msInDay);
  const sevenDaysAgo = new Date(now.getTime() - 7 * msInDay);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * msInDay);

  const activeDaily = new Set();
  const activeWeekly = new Set();
  const activeMonthly = new Set();

  data.pings.forEach(ping => {
    const pingTime = new Date(ping.timestamp);
    if (pingTime >= oneDayAgo) activeDaily.add(ping.installationId);
    if (pingTime >= sevenDaysAgo) activeWeekly.add(ping.installationId);
    if (pingTime >= thirtyDaysAgo) activeMonthly.add(ping.installationId);
  });

  const platformCounts = {};
  devicesList.forEach(dev => {
    const platform = dev.platform || 'unknown';
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });

  const versionCounts = {};
  devicesList.forEach(dev => {
    const version = dev.version || 'unknown';
    versionCounts[version] = (versionCounts[version] || 0) + 1;
  });

  const dailyTimeline = {};
  for (let i = 14; i >= 0; i--) {
    const d = new Date(now.getTime() - i * msInDay);
    const dateStr = d.toISOString().split('T')[0];
    dailyTimeline[dateStr] = new Set();
  }

  data.pings.forEach(ping => {
    const dateStr = ping.timestamp.split('T')[0];
    if (dailyTimeline[dateStr] !== undefined) {
      dailyTimeline[dateStr].add(ping.installationId);
    }
  });

  const timelineLabels = Object.keys(dailyTimeline);
  const timelineValues = timelineLabels.map(date => dailyTimeline[date].size);

  res.json({
    totalInstalls,
    activeUsers: {
      dau: activeDaily.size,
      wau: activeWeekly.size,
      mau: activeMonthly.size
    },
    platformCounts,
    versionCounts,
    timeline: {
      labels: timelineLabels,
      values: timelineValues
    },
    devices: devicesList.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
  });
});

app.listen(PORT, () => {
  console.log(`Telemetry Server running on http://localhost:${PORT}`);
});
