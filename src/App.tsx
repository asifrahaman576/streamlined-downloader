import React, { useState, useEffect, useRef, useCallback } from "react";
import "./index.css";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ResolvedTask {
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

// ─── Session ID Management ────────────────────────────────────────────────────
function getOrCreateSessionId(): string {
  const KEY = "streamlinedl_session_id";
  let id = localStorage.getItem(KEY);
  if (!id || id.length < 8) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SESSION_ID = getOrCreateSessionId();

function formatBytes(bytes: number): string {
  if (bytes < 0 || isNaN(bytes)) return "Unknown size";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getMimeIcon(mimeType: string, filename: string): string {
  const name = filename.toLowerCase();
  if (name.endsWith(".rar") || name.endsWith(".7z") || name.endsWith(".zip") || name.includes(".part")) return "folder_zip";
  if (mimeType.startsWith("video/") || name.endsWith(".mkv") || name.endsWith(".mp4")) return "movie";
  if (mimeType.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".flac")) return "music_note";
  if (mimeType.includes("iso") || name.endsWith(".iso")) return "disc_full";
  if (mimeType.includes("pdf") || name.endsWith(".pdf")) return "picture_as_pdf";
  if (name.endsWith(".exe") || name.endsWith(".msi") || name.endsWith(".apk")) return "install_desktop";
  return "download";
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState<ResolvedTask[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "ready" | "resolving" | "error">("all");
  const [clipboardEnabled, setClipboardEnabled] = useState(false);
  const [activeSessions, setActiveSessions] = useState(0);
  const lastClipboard = useRef("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const HOSTING_PATTERNS = [/fuckingfast\.(co|net)/i, /mediafire\.com/i, /mega\.nz/i, /rapidgator\.net/i];

  // ── Status toast ─────────────────────────────────────────────────────────
  const showStatus = useCallback((text: string, type: "info" | "success" | "error" = "info") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  }, []);

  // ── Poll server for task updates ──────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?session=${encodeURIComponent(SESSION_ID)}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setActiveSessions(data.activeSessions || 0);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchTasks();
    pollingRef.current = setInterval(fetchTasks, 1200);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchTasks]);

  // ── Clipboard monitor ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!clipboardEnabled) return;
    if (!navigator.clipboard?.readText) return;

    const check = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text === lastClipboard.current) return;
        lastClipboard.current = text;

        const lines = text.split(/[\n\s,]+/).filter((l) => l.startsWith("http"));
        const hosting = lines.filter((u) => HOSTING_PATTERNS.some((p) => p.test(u)));
        if (hosting.length > 0) {
          showStatus(`📋 ${hosting.length} hosting link(s) detected in clipboard — paste to add`, "info");
        }
      } catch { /* clipboard permission denied */ }
    };

    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [clipboardEnabled, showStatus]);

  // ── Resolve URLs ──────────────────────────────────────────────────────────
  const handleResolve = async () => {
    const lines = urlInput
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("http") || l.startsWith("https"));

    if (lines.length === 0) {
      showStatus("Please paste valid URLs (http/https)", "error");
      return;
    }

    setIsResolving(true);
    showStatus(`Resolving ${lines.length} link${lines.length > 1 ? "s" : ""}...`, "info");

    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION_ID, urls: lines }),
      });

      if (res.ok) {
        const data = await res.json();
        const count = data.tasks?.length || 0;
        showStatus(
          `✅ ${count} task${count > 1 ? "s" : ""} queued — resolving in background...`,
          "success"
        );
        setUrlInput("");
        fetchTasks();
      } else {
        const err = await res.json();
        showStatus(err.error || "Failed to resolve links", "error");
      }
    } catch (e: any) {
      showStatus(`Network error: ${e.message}`, "error");
    } finally {
      setIsResolving(false);
    }
  };

  // ── Trigger download ──────────────────────────────────────────────────────
  const startDownload = (task: ResolvedTask) => {
    if (task.status !== "ready" || !task.cdnUrl) {
      showStatus("URL not ready yet, please wait...", "info");
      return;
    }
    // Open the stream endpoint which 302 redirects to CDN
    // Browser saves the file at full user internet speed — no server relay
    const streamUrl = `/api/stream/${task.id}?session=${encodeURIComponent(SESSION_ID)}`;
    window.open(streamUrl, "_blank");
    showStatus(`⬇ Downloading ${task.filename}`, "success");
  };

  // ── Remove task ───────────────────────────────────────────────────────────
  const removeTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}?session=${encodeURIComponent(SESSION_ID)}`, {
        method: "DELETE",
      });
      fetchTasks();
    } catch { /* silent */ }
  };

  // ── Clear all tasks ───────────────────────────────────────────────────────
  const clearAll = async () => {
    try {
      await fetch("/api/tasks/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION_ID }),
      });
      setTasks([]);
      showStatus("Queue cleared", "info");
    } catch { /* silent */ }
  };

  // ── Download all ready ────────────────────────────────────────────────────
  const downloadAll = () => {
    const readyTasks = filteredTasks.filter((t) => t.status === "ready");
    if (readyTasks.length === 0) {
      showStatus("No ready downloads found", "info");
      return;
    }
    // Stagger downloads to avoid browser tab flood
    readyTasks.forEach((task, i) => {
      setTimeout(() => startDownload(task), i * 600);
    });
    showStatus(`⬇ Starting ${readyTasks.length} download${readyTasks.length > 1 ? "s" : ""}...`, "success");
  };

  // ── Filtered & computed ───────────────────────────────────────────────────
  const filteredTasks = tasks.filter((t) => {
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchSearch =
      !searchQuery ||
      t.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.sourceUrl.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const readyCount = tasks.filter((t) => t.status === "ready").length;
  const resolvingCount = tasks.filter((t) => t.status === "resolving").length;
  const errorCount = tasks.filter((t) => t.status === "error").length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-surface-bg text-on-surface font-body-md selection:bg-accent/20 selection:text-accent min-h-screen flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 w-full h-header-height flex items-center justify-between px-container-padding bg-surface-container-low border-b border-outline-variant z-50">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[28px]">download_for_offline</span>
          <div>
            <span className="font-headline-lg text-headline-lg font-bold text-primary tracking-tight">StreamlineDL</span>
            <span className="text-[10px] text-on-surface-variant ml-2 font-mono hidden md:inline">
              link resolver · CDN-direct downloads
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-[10px] text-on-surface-variant font-mono px-3 py-1.5 bg-container-low border border-outline-variant rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
            {activeSessions} active session{activeSessions !== 1 ? "s" : ""}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface border border-outline-variant rounded-lg pl-10 pr-4 py-1.5 text-body-sm w-52 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              placeholder="Search files..."
              type="text"
            />
          </div>
        </div>
      </header>

      {/* ── Status Toast ────────────────────────────────────────────────── */}
      {statusMsg && (
        <div className={`fixed top-16 right-6 py-3 px-5 rounded-xl text-xs font-bold flex items-center gap-2 z-[100] shadow-2xl border transition-all ${
          statusMsg.type === "success"
            ? "bg-accent text-white border-accent"
            : statusMsg.type === "error"
            ? "bg-error text-white border-error"
            : "bg-primary text-on-primary border-outline-variant"
        }`}>
          <span className="material-symbols-outlined text-[16px]">
            {statusMsg.type === "success" ? "check_circle" : statusMsg.type === "error" ? "error" : "info"}
          </span>
          {statusMsg.text}
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main className="pt-header-height min-h-screen flex flex-col">

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <section className="sticky top-header-height bg-surface/90 backdrop-blur-md z-30 px-container-padding py-3 border-b border-outline-variant">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {/* Status filter pills */}
              {(["all", "ready", "resolving", "error"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    filterStatus === s
                      ? "bg-primary text-on-primary"
                      : "bg-container-highest text-on-surface-variant hover:bg-container-high"
                  }`}
                >
                  {s === "all"
                    ? `All (${tasks.length})`
                    : s === "ready"
                    ? `✓ Ready (${readyCount})`
                    : s === "resolving"
                    ? `⟳ Resolving (${resolvingCount})`
                    : `✗ Error (${errorCount})`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setClipboardEnabled((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  clipboardEnabled
                    ? "bg-accent text-white"
                    : "bg-container-highest text-on-surface-variant hover:bg-container-high"
                }`}
                title="Monitor clipboard for hosting links"
              >
                <span className="material-symbols-outlined text-[16px]">content_paste</span>
                Clipboard
              </button>
              <button
                onClick={downloadAll}
                disabled={readyCount === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-accent text-white hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Download All ({readyCount})
              </button>
              {tasks.length > 0 && (
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-container-highest text-on-surface-variant hover:bg-error hover:text-white transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── URL Input Box ────────────────────────────────────────────── */}
        <div className="px-container-padding py-5 max-w-5xl mx-auto w-full">
          <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-bold text-on-surface">Add Download Links</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Paste FuckingFast, direct file URLs, or any supported hosting links — one per line.
                  Files download directly to <strong>your</strong> device at your full internet speed.
                </p>
              </div>
              <span className="text-[10px] text-on-surface-variant font-mono bg-container-low px-2 py-1 rounded border border-outline-variant hidden md:block">
                Session: {SESSION_ID.slice(0, 12)}...
              </span>
            </div>
            <textarea
              rows={3}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleResolve();
                }
              }}
              placeholder={"Paste URLs here (one per line):\nhttps://fuckingfast.co/g1pdp1kuolm5\nhttps://fuckingfast.co/another-link\n..."}
              className="w-full text-xs font-mono bg-container-low border border-outline-variant rounded-lg p-3 outline-none focus:border-primary resize-none transition-colors leading-relaxed"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-on-surface-variant">
                {urlInput.split("\n").filter((l) => l.trim().startsWith("http")).length} valid URL(s) detected
                <span className="ml-2 text-outline">· Ctrl+Enter to resolve</span>
              </span>
              <button
                onClick={handleResolve}
                disabled={isResolving || !urlInput.trim()}
                className="bg-primary text-on-primary px-5 py-2 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 cursor-pointer"
              >
                {isResolving ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
                    Resolving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                    Resolve & Queue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Task List ────────────────────────────────────────────────── */}
        <div className="px-container-padding pb-8 max-w-5xl mx-auto w-full flex-1">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="material-symbols-outlined text-[64px] text-outline mb-4">cloud_download</span>
              <h3 className="font-bold text-on-surface text-xl mb-2">
                {tasks.length === 0 ? "No downloads yet" : "No results match your filter"}
              </h3>
              <p className="text-on-surface-variant text-sm max-w-sm leading-relaxed">
                {tasks.length === 0
                  ? "Paste FuckingFast or direct download URLs above. Files will download straight to your device — no storage used on our server."
                  : "Try changing the filter or search query above."}
              </p>
              {tasks.length === 0 && (
                <div className="mt-6 grid grid-cols-3 gap-4 text-xs text-on-surface-variant max-w-sm">
                  <div className="bg-surface border border-outline-variant rounded-lg p-3 text-center">
                    <span className="material-symbols-outlined text-primary text-[24px] block mb-1">bolt</span>
                    <span className="font-bold block">Full Speed</span>
                    <span>Your internet speed, not ours</span>
                  </div>
                  <div className="bg-surface border border-outline-variant rounded-lg p-3 text-center">
                    <span className="material-symbols-outlined text-accent text-[24px] block mb-1">lock</span>
                    <span className="font-bold block">Private</span>
                    <span>Only you see your downloads</span>
                  </div>
                  <div className="bg-surface border border-outline-variant rounded-lg p-3 text-center">
                    <span className="material-symbols-outlined text-secondary text-[24px] block mb-1">savings</span>
                    <span className="font-bold block">Free</span>
                    <span>No server storage needed</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onDownload={() => startDownload(task)}
                  onRemove={() => removeTask(task.id)}
                  formatBytes={formatBytes}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── How It Works Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-outline-variant bg-surface-container-low px-container-padding py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 text-[10px] text-on-surface-variant font-mono">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent">check_circle</span>
              CDN-direct downloads (no relay)
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent">check_circle</span>
              Per-session isolation
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-accent">check_circle</span>
              No files stored on server
            </span>
          </div>
          <span>StreamlineDL · Link Resolver</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Task Row Component ───────────────────────────────────────────────────────
function TaskRow({
  task,
  onDownload,
  onRemove,
  formatBytes,
}: {
  task: ResolvedTask;
  onDownload: () => void;
  onRemove: () => void;
  formatBytes: (n: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isResolving = task.status === "resolving";
  const isError = task.status === "error";
  const isReady = task.status === "ready";

  const icon = isReady ? getMimeIcon(task.mimeType, task.filename) : isResolving ? "sync" : "error";

  return (
    <div className={`bg-surface border rounded-xl overflow-hidden transition-all ${
      isError ? "border-error/40" : isReady ? "border-outline-variant hover:border-primary/40" : "border-outline-variant"
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <span className={`material-symbols-outlined text-[22px] flex-shrink-0 ${
          isResolving ? "text-primary animate-spin" : isError ? "text-error" : "text-accent"
        }`}>
          {icon}
        </span>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-left w-full"
          >
            <span className={`text-body-md font-semibold text-on-surface block ${expanded ? "break-all" : "truncate"}`}>
              {isResolving ? (
                <span className="text-on-surface-variant font-normal text-sm">
                  Resolving: <span className="font-mono text-xs">{task.sourceUrl.slice(0, 60)}...</span>
                </span>
              ) : (
                task.filename
              )}
            </span>
          </button>
          <div className="flex items-center gap-3 mt-0.5">
            {isReady && (
              <span className="text-label-mono text-[10px] text-on-surface-variant font-mono">
                {formatBytes(task.size)}
              </span>
            )}
            {isReady && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-outline-variant bg-container-high text-on-surface-variant uppercase font-bold">
                {task.mimeType.split("/").pop()}
              </span>
            )}
            {isError && (
              <span className="text-[10px] text-error font-medium truncate">{task.error}</span>
            )}
            {isResolving && (
              <span className="text-[10px] text-on-surface-variant animate-pulse">Extracting CDN link...</span>
            )}
          </div>
        </div>

        {/* Status badge */}
        {isReady && (
          <span className="text-[9px] px-2 py-1 rounded-full bg-accent/10 text-accent font-bold border border-accent/20 flex-shrink-0">
            READY
          </span>
        )}
        {isResolving && (
          <span className="text-[9px] px-2 py-1 rounded-full bg-primary/10 text-primary font-bold border border-primary/20 animate-pulse flex-shrink-0">
            RESOLVING
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          {isReady && (
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
              title="Download to your device at full speed"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Download
            </button>
          )}
          <button
            onClick={onRemove}
            className="p-1.5 hover:bg-container-highest rounded-lg text-on-surface-variant hover:text-error transition-colors cursor-pointer"
            title="Remove from list"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* Expanded CDN URL (debug info) */}
      {expanded && isReady && task.cdnUrl && (
        <div className="px-4 pb-3 pt-0 border-t border-outline-variant/30 bg-container-low/40">
          <p className="text-[9px] font-mono text-on-surface-variant break-all leading-relaxed mt-2">
            <span className="text-outline font-bold mr-1">CDN URL:</span>
            {task.cdnUrl}
          </p>
          <p className="text-[9px] text-on-surface-variant mt-1">
            <span className="text-outline font-bold mr-1">Source:</span>
            {task.sourceUrl}
          </p>
          <p className="text-[9px] text-on-surface-variant mt-0.5">
            <span className="text-outline font-bold mr-1">Resumable:</span>
            {task.resumable ? "Yes" : "No"} ·
            <span className="text-outline font-bold mx-1">Size:</span>
            {formatBytes(task.size)}
          </p>
        </div>
      )}
    </div>
  );
}
