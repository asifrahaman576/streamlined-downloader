import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { FuckingFastExtractor } from "./src/extractors/fuckingfast.js";
import { HostExtractor } from "./src/extractors/types.js";

const extractors: HostExtractor[] = [new FuckingFastExtractor()];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// ─── Session-Based Task Store ───────────────────────────────────────────────
// Each browser tab/user gets its own isolated session — no shared state.

export interface ResolvedTask {
  id: string;
  sessionId: string;
  sourceUrl: string;
  filename: string;
  size: number;
  mimeType: string;
  cdnUrl?: string;
  resumable: boolean;
  status: "resolving" | "ready" | "error";
  error?: string;
  addedAt: string;
}

const sessionStore = new Map<string, ResolvedTask[]>();
const sessionLastActivity = new Map<string, number>();
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// Clean up stale sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sid, lastActive] of sessionLastActivity.entries()) {
    if (now - lastActive > SESSION_TTL_MS) {
      sessionStore.delete(sid);
      sessionLastActivity.delete(sid);
      console.log(`[SESSION] Cleaned up expired session: ${sid.slice(0, 8)}...`);
    }
  }
}, 30 * 60 * 1000);

function touchSession(sessionId: string): ResolvedTask[] {
  sessionLastActivity.set(sessionId, Date.now());
  if (!sessionStore.has(sessionId)) sessionStore.set(sessionId, []);
  return sessionStore.get(sessionId)!;
}

// ─── SSRF Protection ─────────────────────────────────────────────────────────
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const h = parsed.hostname.toLowerCase();
    if (
      h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" ||
      h === "::1" || h === "[::1]" || h.startsWith("169.254.") ||
      h.startsWith("10.") || h.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── URL Resolver ─────────────────────────────────────────────────────────────
// Extracts the real direct CDN download URL from a hosting page.
async function resolveUrl(url: string): Promise<{
  filename: string;
  size: number;
  mimeType: string;
  cdnUrl: string;
  resumable: boolean;
}> {
  if (!isValidUrl(url)) throw new Error("Invalid or private URL");

  // Try registered extractors (FuckingFast, etc.)
  for (const extractor of extractors) {
    if (extractor.canHandle(url)) {
      console.log(`[RESOLVER] Using ${extractor.constructor.name} for: ${url}`);
      const extracted = await extractor.extract(url);
      if (extracted.length > 0) {
        const e = extracted[0];
        return { filename: e.filename, size: e.size, mimeType: e.mimeType, cdnUrl: e.url, resumable: e.resumable };
      }
      throw new Error("Extractor found no downloadable links");
    }
  }

  // Fallback: treat as direct file URL — check via HEAD
  const browserHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  let finalUrl = url;
  let filename = "download.file";
  let size = -1;
  let mimeType = "application/octet-stream";
  let resumable = false;

  try {
    const headRes = await fetch(url, {
      method: "HEAD",
      headers: browserHeaders,
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    finalUrl = headRes.url || url;
    mimeType = headRes.headers.get("content-type")?.split(";")[0] || mimeType;
    size = parseInt(headRes.headers.get("content-length") || "-1");
    resumable = headRes.headers.get("accept-ranges") === "bytes";

    const isPage = mimeType.includes("text/html");
    if (isPage) throw new Error("URL points to a web page, not a downloadable file. Paste a direct file URL or a supported hosting page link (e.g. fuckingfast.co).");

    const cDisp = headRes.headers.get("content-disposition") || "";
    const cdMatch = cDisp.match(/filename[^;=\n]*=\s*["']?([^"';\n]+)["']?/i);
    if (cdMatch) {
      filename = cdMatch[1].trim();
    } else {
      try { filename = path.basename(new URL(finalUrl).pathname) || filename; } catch {}
    }
  } catch (e: any) {
    if (e.message.includes("web page")) throw e;
    // If HEAD fails, just try to use the URL directly
    try { filename = path.basename(new URL(url).pathname) || filename; } catch {}
  }

  return { filename, size, mimeType, cdnUrl: finalUrl, resumable };
}

// ─── Express App ──────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Security headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });

  // ── GET /api/tasks — list session tasks ───────────────────────────────────
  app.get("/api/tasks", (req, res) => {
    const sessionId = req.query.session as string;
    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 8) {
      return res.status(400).json({ error: "Valid session ID required" });
    }
    const tasks = touchSession(sessionId);
    res.json({ tasks, activeSessions: sessionStore.size });
  });

  // ── POST /api/resolve — queue URLs for resolution ────────────────────────
  // Returns placeholder tasks immediately, resolves in background.
  app.post("/api/resolve", async (req, res) => {
    const { sessionId, urls, url } = req.body;

    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 8) {
      return res.status(400).json({ error: "Valid session ID required" });
    }

    const rawUrls: string[] = Array.isArray(urls)
      ? urls
      : typeof url === "string" && url.trim()
      ? [url.trim()]
      : [];

    const filtered = rawUrls
      .map((u) => String(u).trim())
      .filter((u) => u.length > 0);

    if (filtered.length === 0) {
      return res.status(400).json({ error: "No URLs provided" });
    }

    const tasks = touchSession(sessionId);

    // Create placeholder tasks synchronously
    const newTasks: ResolvedTask[] = filtered.map((sourceUrl) => ({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      sourceUrl,
      filename: "Resolving...",
      size: -1,
      mimeType: "application/octet-stream",
      resumable: false,
      status: "resolving" as const,
      addedAt: new Date().toISOString(),
    }));

    tasks.push(...newTasks);

    // Return placeholders immediately so UI updates right away
    res.json({ tasks: newTasks });

    // Resolve in background (parallel with stagger)
    for (let i = 0; i < newTasks.length; i++) {
      const task = newTasks[i];
      if (i > 0) await new Promise((r) => setTimeout(r, 300));
      resolveUrl(task.sourceUrl)
        .then((result) => {
          task.cdnUrl = result.cdnUrl;
          task.filename = result.filename;
          task.size = result.size;
          task.mimeType = result.mimeType;
          task.resumable = result.resumable;
          task.status = "ready";
          console.log(`[RESOLVER] ✓ Ready: ${task.filename} (${(result.size / 1024 / 1024).toFixed(1)} MB)`);
        })
        .catch((err: Error) => {
          task.status = "error";
          task.error = err.message;
          task.filename = task.sourceUrl;
          console.error(`[RESOLVER] ✗ Failed: ${task.sourceUrl} — ${err.message}`);
        });
    }
  });

  // ── GET /api/stream/:id — redirect browser to CDN URL ────────────────────
  // The browser follows the 302 and downloads DIRECTLY from CDN at full user speed.
  // Server uses ~0 bandwidth for the actual file transfer.
  app.get("/api/stream/:id", (req, res) => {
    const sessionId = req.query.session as string;
    if (!sessionId) return res.status(400).json({ error: "session required" });

    const tasks = touchSession(sessionId);
    const task = tasks.find((t) => t.id === req.params.id);

    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status === "resolving") return res.status(202).json({ error: "Still resolving, please wait..." });
    if (task.status === "error") return res.status(400).json({ error: task.error || "Resolution failed" });
    if (!task.cdnUrl) return res.status(400).json({ error: "No CDN URL available" });

    console.log(`[STREAM] Redirecting to CDN for: ${task.filename}`);
    // 302 redirect → browser downloads directly from CDN at full user speed
    res.redirect(302, task.cdnUrl);
  });

  // ── DELETE /api/tasks/:id — remove a task from session ───────────────────
  app.delete("/api/tasks/:id", (req, res) => {
    const sessionId = req.query.session as string;
    if (!sessionId) return res.status(400).json({ error: "session required" });

    const tasks = touchSession(sessionId);
    const idx = tasks.findIndex((t) => t.id === req.params.id);
    if (idx !== -1) tasks.splice(idx, 1);
    res.json({ success: true, tasks });
  });

  // ── POST /api/tasks/clear — clear all session tasks ──────────────────────
  app.post("/api/tasks/clear", (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "session required" });
    sessionStore.set(sessionId, []);
    sessionLastActivity.set(sessionId, Date.now());
    res.json({ success: true, tasks: [] });
  });

  // ── GET /api/health — health + stats ─────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    const totalTasks = [...sessionStore.values()].reduce((s, t) => s + t.length, 0);
    res.json({
      ok: true,
      activeSessions: sessionStore.size,
      totalTrackedTasks: totalTasks,
      uptime: Math.floor(process.uptime()),
    });
  });

  // ── Vite dev server or static production serve ────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[VITE] Dev server attached");
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath, { maxAge: "1h" }));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
    console.log("[STATIC] Serving production build from ./dist");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 StreamlineDL running at http://localhost:${PORT}`);
    console.log("   Architecture: link-resolver proxy (no disk writes, CDN-direct downloads)");
    console.log(`   Environment: ${process.env.NODE_ENV || "development"}\n`);
  });
}

startServer().catch(console.error);
