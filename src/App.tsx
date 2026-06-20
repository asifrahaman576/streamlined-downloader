import React, { useState, useEffect, useRef, useCallback } from "react";
import "./index.css";
import ArchitectureDoc from "./components/ArchitectureDoc";

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

const SESSION_ID = getOrCreateSessionId();

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  return "description";
}

// ─── Main App Component ───────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState<ResolvedTask[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "ready" | "resolving" | "error">("all");
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "architecture">("dashboard");
  const [clipboardEnabled, setClipboardEnabled] = useState(false);
  const [activeSessions, setActiveSessions] = useState(0);
  const [speedLimit, setSpeedLimit] = useState("No Limit");
  const [networkLoad, setNetworkLoad] = useState<number[]>([30, 45, 35, 60, 50, 75, 90, 80, 65, 85]);
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string } | null>(null);
  
  const lastClipboard = useRef("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const HOSTING_PATTERNS = [/fuckingfast\.(co|net)/i, /mediafire\.com/i, /mega\.nz/i, /rapidgator\.net/i];

  // ─── Status alerts ────────────────────────────────────────────────────────
  const showStatus = useCallback((text: string, type: "info" | "success" | "error" = "info") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  }, []);

  const showToast = useCallback((title: string, desc: string) => {
    setToastMsg({ title, desc });
    setTimeout(() => setToastMsg(null), 5000);
  }, []);

  // ─── Poll server for task updates ──────────────────────────────────────────
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
    pollingRef.current = setInterval(fetchTasks, 1500);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchTasks]);

  // ─── Network Load graph simulation ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkLoad((prev) => {
        const next = [...prev.slice(1)];
        const isCurrentlyResolving = tasks.some((t) => t.status === "resolving");
        const val = isCurrentlyResolving
          ? Math.floor(Math.random() * 40) + 60 // 60 - 100% active load
          : Math.floor(Math.random() * 15) + 10; // 10 - 25% idle load
        next.push(val);
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [tasks]);

  // ─── Clipboard monitor ─────────────────────────────────────────────────────
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
          showToast("Link Captured", `Detected ${hosting.length} support links in clipboard.`);
          setUrlInput((prev) => {
            const currentLines = prev.split("\n").map(l => l.trim()).filter(Boolean);
            const newLines = hosting.filter(h => !currentLines.includes(h));
            if (newLines.length > 0) {
              return [...currentLines, ...newLines].join("\n");
            }
            return prev;
          });
        }
      } catch { /* clipboard permission denied */ }
    };

    const interval = setInterval(check, 1500);
    return () => clearInterval(interval);
  }, [clipboardEnabled, showToast]);

  // ─── Resolve URLs ──────────────────────────────────────────────────────────
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

      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* non-JSON response */ }

      if (res.ok) {
        const count = data.tasks?.length || 0;
        showStatus(
          `✅ ${count} task${count > 1 ? "s" : ""} queued — resolving in background...`,
          "success"
        );
        setUrlInput("");
        fetchTasks();
      } else {
        showStatus(data.error || `Server error (${res.status}) — try restarting the server`, "error");
      }
    } catch (e: any) {
      showStatus(`Could not reach server — is it running?`, "error");
    } finally {
      setIsResolving(false);
    }
  };

  // ─── Trigger download ──────────────────────────────────────────────────────
  const startDownload = (task: ResolvedTask) => {
    if (task.status !== "ready" || !task.cdnUrl) {
      showStatus("URL not ready yet, please wait...", "info");
      return;
    }
    const streamUrl = `/api/stream/${task.id}?session=${encodeURIComponent(SESSION_ID)}`;
    window.open(streamUrl, "_blank");
    showStatus(`⬇ Downloading ${task.filename}`, "success");
    showToast("Download Started", `Browser initiated transfer for ${task.filename}`);
  };

  // ─── Remove task ───────────────────────────────────────────────────────────
  const removeTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}?session=${encodeURIComponent(SESSION_ID)}`, {
        method: "DELETE",
      });
      fetchTasks();
      showStatus("Task removed", "info");
    } catch { /* silent */ }
  };

  // ─── Clear all tasks ───────────────────────────────────────────────────────
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

  // ─── Download all ready ────────────────────────────────────────────────────
  const downloadAll = () => {
    const readyTasks = filteredTasks.filter((t) => t.status === "ready");
    if (readyTasks.length === 0) {
      showStatus("No ready downloads found", "info");
      return;
    }
    readyTasks.forEach((task, i) => {
      setTimeout(() => startDownload(task), i * 600);
    });
    showStatus(`⬇ Starting ${readyTasks.length} download${readyTasks.length > 1 ? "s" : ""}...`, "success");
  };

  const handleSpeedLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const limit = e.target.value;
    setSpeedLimit(limit);
    showStatus(`Speed limit set to ${limit}`, "success");
  };

  // ─── Filtered & computed ───────────────────────────────────────────────────
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
  const totalSize = tasks.reduce((sum, t) => sum + (t.size > 0 ? t.size : 0), 0);
  const linesCount = urlInput.split("\n").filter((l) => l.trim().startsWith("http")).length;

  const getGlobalSpeed = () => {
    const isCurrentlyResolving = tasks.some((t) => t.status === "resolving");
    if (isCurrentlyResolving) {
      return `${(8.5 + Math.random() * 6.3).toFixed(1)} MB/s`;
    }
    return "0.0 KB/s";
  };

  return (
    <div className="bg-surface-bg text-on-surface font-body-md selection:bg-accent/20 selection:text-accent min-h-screen flex flex-col">
      
      {/* ── TopNavBar ── */}
      <header className="fixed top-0 left-0 w-full h-header-height flex justify-between items-center px-container-padding bg-surface-container-low border-b border-outline-variant z-50">
        <div className="flex items-center gap-group-gap">
          <span className="font-headline-lg text-headline-lg font-bold text-primary tracking-tight">StreamlineDL</span>
          <div className="hidden md:flex items-center ml-8 gap-4 h-full">
            <button 
              onClick={() => { setActiveTab("dashboard"); setFilterStatus("all"); }}
              className={`h-full px-4 border-b-2 font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === "dashboard" && filterStatus === "all" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-primary"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              Downloads
            </button>
            <button 
              onClick={() => { setActiveTab("dashboard"); setFilterStatus("ready"); }}
              className={`h-full px-4 border-b-2 font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === "dashboard" && filterStatus === "ready" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-primary"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">history</span>
              Completed
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">search</span>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface border border-outline-variant rounded-lg pl-10 pr-4 py-1.5 text-body-sm w-64 focus:outline-none focus:border-accent transition-all" 
              placeholder="Search files..." 
            />
          </div>
          <button 
            onClick={() => setActiveTab("settings")}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${activeTab === "settings" ? "bg-container-highest text-primary" : "text-on-surface-variant hover:bg-container-highest"}`}
            title="Settings"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <button 
            onClick={() => setActiveTab("architecture")}
            className={`p-2 rounded-lg transition-colors cursor-pointer relative ${activeTab === "architecture" ? "bg-container-highest text-primary" : "text-on-surface-variant hover:bg-container-highest"}`}
            title="System Topology"
          >
            <span className="material-symbols-outlined">dns</span>
          </button>
        </div>
      </header>

      {/* ── Sidebar Navigation ── */}
      <aside className="fixed left-0 top-header-height h-[calc(100vh-header-height)] w-sidebar-width bg-surface-container-low border-r border-outline-variant flex flex-col py-group-gap z-40">
        <div className="px-4 mb-4">
          <span className="text-on-surface font-headline-md text-headline-md font-semibold">Library</span>
          <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-bold">Local Storage</p>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          <button 
            onClick={() => { setActiveTab("dashboard"); setFilterStatus("all"); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-transform active:scale-[0.98] ${
              activeTab === "dashboard" && filterStatus === "all" ? "bg-container-highest text-primary font-bold" : "text-on-surface-variant hover:bg-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            <span className="text-body-md flex-1">All Downloads</span>
            <span className="text-xs bg-container-high text-on-surface-variant font-mono px-1.5 py-0.2 rounded-full font-bold">
              {tasks.length}
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab("dashboard"); setFilterStatus("resolving"); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-transform active:scale-[0.98] ${
              activeTab === "dashboard" && filterStatus === "resolving" ? "bg-container-highest text-primary font-bold" : "text-on-surface-variant hover:bg-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[20px] text-accent animate-pulse">sync</span>
            <span className="text-body-md flex-1">Active</span>
            <span className="text-xs bg-container-high text-on-surface-variant font-mono px-1.5 py-0.2 rounded-full font-bold">
              {resolvingCount}
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab("dashboard"); setFilterStatus("ready"); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-transform active:scale-[0.98] ${
              activeTab === "dashboard" && filterStatus === "ready" ? "bg-container-highest text-primary font-bold" : "text-on-surface-variant hover:bg-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span className="text-body-md flex-1">Completed</span>
            <span className="text-xs bg-container-high text-on-surface-variant font-mono px-1.5 py-0.2 rounded-full font-bold">
              {readyCount}
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab("dashboard"); setFilterStatus("error"); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-transform active:scale-[0.98] ${
              activeTab === "dashboard" && filterStatus === "error" ? "bg-container-highest text-primary font-bold" : "text-on-surface-variant hover:bg-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span className="text-body-md flex-1">Errors</span>
            <span className="text-xs bg-container-high text-on-surface-variant font-mono px-1.5 py-0.2 rounded-full font-bold">
              {errorCount}
            </span>
          </button>
        </nav>
        <div className="px-2 pt-4 border-t border-outline-variant mt-4 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-mono px-3 py-1.5 bg-container-low border border-outline-variant rounded-full mx-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
            {activeSessions} active session{activeSessions !== 1 ? "s" : ""}
          </div>
          <button 
            onClick={() => showStatus(`Session ID: ${SESSION_ID}`, "info")}
            className="w-full flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-container-high rounded-lg text-left cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">help</span>
            <span className="text-body-md">Help & Info</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="ml-sidebar-width pt-header-height min-h-screen bg-surface-bg flex flex-col justify-between">
        
        <div className="flex-1 flex flex-col">
          
          {/* Global Toolbar */}
          {activeTab === "dashboard" && (
            <section className="sticky top-header-height bg-surface/80 backdrop-blur-md z-30 px-container-padding py-4 border-b border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setClipboardEnabled(!clipboardEnabled)}
                  className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:brightness-110 transition-all shadow-sm cursor-pointer ${
                    clipboardEnabled ? "bg-accent text-white" : "bg-container-highest text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">content_paste</span>
                  Clipboard Grabber
                </button>
                <div className="h-8 w-px bg-outline-variant"></div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={downloadAll}
                    disabled={readyCount === 0}
                    className="p-2 hover:bg-container-highest rounded-lg text-on-surface-variant cursor-pointer disabled:opacity-40" 
                    title="Start All Ready"
                  >
                    <span className="material-symbols-outlined">play_arrow</span>
                  </button>
                  <button 
                    onClick={() => showStatus("Downloads are direct-to-browser. Pause them in your browser download tab.", "info")}
                    className="p-2 hover:bg-container-highest rounded-lg text-on-surface-variant cursor-pointer" 
                    title="Pause All (Info)"
                  >
                    <span className="material-symbols-outlined">pause</span>
                  </button>
                  <button 
                    onClick={clearAll}
                    className="p-2 hover:bg-container-highest rounded-lg text-on-surface-variant cursor-pointer" 
                    title="Clear All Queue"
                  >
                    <span className="material-symbols-outlined">delete_sweep</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="text-label-mono-xs text-on-surface-variant uppercase">Global Speed</span>
                  <span className="text-body-md font-bold text-accent">{getGlobalSpeed()}</span>
                </div>
                <div className="flex items-center gap-3 bg-container-high px-3 py-1.5 rounded-lg border border-outline-variant">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">speed</span>
                  <select 
                    value={speedLimit} 
                    onChange={handleSpeedLimitChange}
                    className="bg-transparent border-none text-body-sm focus:ring-0 p-0 font-bold outline-none cursor-pointer"
                  >
                    <option>No Limit</option>
                    <option>1 MB/s</option>
                    <option>5 MB/s</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* Alert Toast Notification (Status bar) */}
          {statusMsg && (
            <div className={`p-4 text-center text-xs font-semibold flex items-center justify-center gap-2 transition-all border-b ${
              statusMsg.type === "success" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                : statusMsg.type === "error" 
                ? "bg-rose-50 text-rose-800 border-rose-200" 
                : "bg-indigo-50 text-indigo-800 border-indigo-200"
            }`}>
              <span className="material-symbols-outlined text-[16px]">
                {statusMsg.type === "success" ? "check_circle" : statusMsg.type === "error" ? "error" : "info"}
              </span>
              {statusMsg.text}
            </div>
          )}

          {/* Content Canvas */}
          <div className="p-container-padding max-w-[1152px] mx-auto w-full flex flex-col gap-group-gap flex-1">
            
            {/* Dashboard active Tab */}
            {activeTab === "dashboard" && (
              <>
                {/* Link input area */}
                <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-sm">
                  <h2 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">bolt</span>
                    Resolve & Queue Links
                  </h2>
                  <div className="text-xs text-on-surface-variant mb-3 leading-relaxed">
                    Paste FuckingFast or direct file URLs (one per line). Files resolve automatically and download directly to <strong>your device</strong> at full internet speed.
                  </div>
                  <textarea 
                    rows={3}
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://fuckingfast.co/..."
                    className="w-full text-xs font-mono bg-container-low border border-outline-variant rounded-lg p-3 outline-none focus:border-accent resize-none transition-colors"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      {linesCount} link(s) detected · Ctrl+Enter to resolve
                    </span>
                    <button 
                      onClick={handleResolve}
                      disabled={isResolving || linesCount === 0}
                      className="bg-primary hover:bg-inverse-surface text-on-primary text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">{isResolving ? "sync" : "add"}</span>
                      {isResolving ? "Resolving..." : "Resolve & Queue"}
                    </button>
                  </div>
                </div>

                {/* Queue Card */}
                <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 h-header-height border-b border-outline-variant bg-container-high/50">
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-primary">folder_zip</span>
                      <div>
                        <span className="text-body-md font-bold">Downloads Queue</span>
                        <span className="text-label-mono-xs text-on-surface-variant ml-2 uppercase">
                          {filteredTasks.length} FILE{filteredTasks.length !== 1 ? "S" : ""} • {formatBytes(totalSize)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {filteredTasks.length === 0 ? (
                    <div className="p-12 text-center max-w-md mx-auto">
                      <div className="bg-container-high w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 border border-outline-variant text-on-surface-variant">
                        <span className="material-symbols-outlined text-[24px]">cloud_download</span>
                      </div>
                      <h4 className="font-bold text-on-surface text-sm">Download queue file list is empty</h4>
                      <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                        Submit download links in the box above or enable the <b>Clipboard Grabber</b> to auto-capture supporting files.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-outline-variant/30">
                      {filteredTasks.map((task) => (
                        <TaskRowItem 
                          key={task.id}
                          task={task}
                          onDownload={() => startDownload(task)}
                          onRemove={() => removeTask(task.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Dashboard Stats Bento */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-group-gap mt-auto">
                  <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between h-32 hover:border-accent transition-colors cursor-pointer">
                    <div className="flex justify-between items-start">
                      <span className="text-on-surface-variant text-label-mono uppercase">System Storage</span>
                      <span className="material-symbols-outlined text-primary">hard_drive</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-body-md font-bold mb-2">
                        <span>245.8 GB</span>
                        <span className="text-on-surface-variant text-body-sm font-normal">of 1 TB</span>
                      </div>
                      <div className="h-1.5 w-full bg-container-highest rounded-full overflow-hidden">
                        <div className="h-full bg-accent w-[24%]"></div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between h-32 hover:border-accent transition-colors cursor-pointer">
                    <div className="flex justify-between items-start">
                      <span className="text-on-surface-variant text-label-mono uppercase">Network Load</span>
                      <span className="material-symbols-outlined text-primary">lan</span>
                    </div>
                    <div>
                      <div className="h-12 w-full flex items-end gap-1 mb-1">
                        {networkLoad.map((val, idx) => (
                          <div 
                            key={idx}
                            style={{ height: `${val}%` }}
                            className="flex-1 bg-accent/30 hover:bg-accent/80 transition-all rounded-t-sm"
                          ></div>
                        ))}
                      </div>
                      <span className="text-label-mono-xs text-on-surface-variant">LAST 60 SECONDS</span>
                    </div>
                  </div>

                  <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between h-32 hover:border-accent transition-colors cursor-pointer">
                    <div className="flex justify-between items-start">
                      <span className="text-on-surface-variant text-label-mono uppercase">Daily Traffic</span>
                      <span className="material-symbols-outlined text-primary">history</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[32px] font-bold text-on-surface">
                        {(12.5 + totalSize / 1024 / 1024 / 1024).toFixed(1)}
                      </span>
                      <span className="text-on-surface-variant text-body-md font-medium">GB downloaded today</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
              <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-on-surface text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined">settings</span>
                    Engine Configurations
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1">Configure client-side speed preferences, clipboard monitoring, and direct CDN routing defaults.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">Clipboard Monitoring</label>
                    <p className="text-[11px] text-on-surface-variant">Auto-grab compatible URLs from your local system clipboard when copying.</p>
                    <button 
                      onClick={() => setClipboardEnabled(!clipboardEnabled)}
                      className={`w-full py-2 px-3 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        clipboardEnabled ? "bg-accent/10 border-accent text-accent animate-pulse" : "bg-container-high border-outline-variant text-on-surface-variant"
                      }`}
                    >
                      {clipboardEnabled ? "Enabled (Auto Grab)" : "Disabled (Manual Paste)"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">Speed limit throttler</label>
                    <p className="text-[11px] text-on-surface-variant font-mono">Set limit parameters for browser direct downloads simulation.</p>
                    <select 
                      value={speedLimit} 
                      onChange={handleSpeedLimitChange}
                      className="w-full text-xs bg-container-low border border-outline-variant rounded-lg p-2 outline-none cursor-pointer"
                    >
                      <option>No Limit</option>
                      <option>1 MB/s</option>
                      <option>5 MB/s</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">Preferred CDN routing mode</label>
                    <input 
                      type="text" 
                      disabled 
                      value="CDN-Direct redirect (zero server relay bandwidth)" 
                      className="w-full text-xs bg-container-low border border-outline-variant rounded-lg p-2 font-mono text-on-surface-variant"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Architecture Tab */}
            {activeTab === "architecture" && (
              <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm">
                <ArchitectureDoc />
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-outline-variant bg-surface-container-low px-container-padding py-4">
          <div className="max-w-[1152px] mx-auto flex flex-wrap items-center justify-between gap-3 text-[10px] text-on-surface-variant font-mono">
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
            <span>StreamlineDL · Version 2.0</span>
          </div>
        </footer>

        {/* Dynamic Mockup Toast Notification */}
        {toastMsg && (
          <div className="fixed bottom-6 right-6 flex items-center gap-4 bg-surface rounded-xl border border-outline-variant p-4 shadow-2xl z-[60] transition-all duration-300">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <span className="material-symbols-outlined">auto_fix_high</span>
            </div>
            <div>
              <p className="text-body-md font-bold text-on-surface">{toastMsg.title}</p>
              <p className="text-body-sm text-on-surface-variant">{toastMsg.desc}</p>
            </div>
            <button className="ml-4 p-2 hover:bg-container-highest rounded-lg text-on-surface-variant cursor-pointer" onClick={() => setToastMsg(null)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        )}

      </main>
      
    </div>
  );
}

// ─── Task Row Item Component ──────────────────────────────────────────────────
function TaskRowItem({
  task,
  onDownload,
  onRemove,
}: {
  task: ResolvedTask;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isResolving = task.status === "resolving";
  const isError = task.status === "error";
  const isReady = task.status === "ready";

  const iconName = isReady ? getMimeIcon(task.mimeType, task.filename) : isResolving ? "sync" : "error";
  const percentage = isReady ? 100 : isResolving ? 25 : 0;
  
  return (
    <div className={`flex flex-col bg-surface hover:bg-container-low/20 transition-colors ${isError ? "border-l-4 border-error" : ""}`}>
      <div className="h-row-height flex items-center px-4 group">
        <div className="w-8 flex justify-center flex-shrink-0">
          <span className={`material-symbols-outlined text-on-surface-variant group-hover:text-accent transition-colors ${isResolving ? "animate-spin text-accent" : ""}`}>
            {iconName}
          </span>
        </div>
        <div className="flex-1 px-4 truncate min-w-0">
          <button 
            onClick={() => !isResolving && setExpanded(!expanded)}
            className="text-left w-full text-body-md font-medium text-on-surface focus:outline-none cursor-pointer truncate"
          >
            {isResolving ? (
              <span className="text-on-surface-variant font-normal">
                Resolving: <span className="font-mono text-xs">{task.sourceUrl}</span>
              </span>
            ) : (
              task.filename
            )}
          </button>
        </div>
        <div className="w-[300px] flex items-center gap-4 px-4 flex-shrink-0 hidden md:flex">
          <div className="flex-1 h-1 bg-container-highest rounded-full overflow-hidden">
            <div 
              style={{ width: `${percentage}%` }}
              className={`h-full progress-glow transition-all duration-550 ${isError ? "bg-error" : isResolving ? "bg-primary animate-pulse" : "bg-accent"}`}
            ></div>
          </div>
          <span className="text-label-mono text-on-surface-variant w-12 text-right">
            {isReady ? "100%" : isResolving ? "Resolving" : "Error"}
          </span>
        </div>
        <div className="w-[100px] text-label-mono text-on-surface-variant text-right flex-shrink-0 hidden sm:block">
          {isReady ? "Ready" : isResolving ? "Extracting..." : "Error"}
        </div>
        <div className="w-[100px] text-label-mono text-on-surface-variant text-right flex-shrink-0 hidden sm:block">
          {isReady ? formatBytes(task.size) : "--"}
        </div>
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {isReady && (
            <button 
              onClick={onDownload}
              className="p-1.5 hover:bg-container-highest rounded text-accent cursor-pointer flex items-center justify-center"
              title="Download file directly"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
            </button>
          )}
          <button 
            onClick={onRemove}
            className="p-1.5 hover:bg-container-highest rounded text-error cursor-pointer flex items-center justify-center"
            title="Remove task"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {expanded && isReady && (
        <div className="px-12 py-3 bg-surface-container-low border-t border-outline-variant/30 text-[11px] space-y-1.5 font-mono text-on-surface-variant">
          <div><span className="font-bold text-outline">CDN Direct URL:</span> <a href={task.cdnUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all">{task.cdnUrl}</a></div>
          <div><span className="font-bold text-outline">Source URL:</span> <span className="break-all">{task.sourceUrl}</span></div>
          <div><span className="font-bold text-outline">MIME Type:</span> <span>{task.mimeType}</span></div>
          <div><span className="font-bold text-outline">Resumable:</span> <span>{task.resumable ? "Yes" : "No"}</span></div>
        </div>
      )}
    </div>
  );
}
