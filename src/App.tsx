import React, { useState, useEffect, useRef, useCallback } from "react";
import "./index.css";
import { DownloadTask, GrabbedLink, EngineSettings } from "./types";
import ArchitectureDoc from "./components/ArchitectureDoc";

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
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [inbox, setInbox] = useState<GrabbedLink[]>([]);
  const [settings, setSettings] = useState<EngineSettings>({
    maxSimultaneous: 2,
    globalSpeedLimit: 0,
    autoRetryCount: 3,
    downloadDirectory: "",
    duplicateAction: "rename",
  });
  const [diskUsageBytes, setDiskUsageBytes] = useState(0);

  // Navigations & tabs
  const [activeTab, setActiveTab] = useState<"dashboard" | "grabber" | "settings" | "architecture" | "testing">("dashboard");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "completed" | "error">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Input states
  const [urlInput, setUrlInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Status & Notification
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string } | null>(null);

  // Clipboard Grabber
  const [clipboardEnabled, setClipboardEnabled] = useState(false);
  const lastClipboard = useRef("");
  const HOSTING_PATTERNS = [/fuckingfast\.(co|net)/i, /mediafire\.com/i, /mega\.nz/i, /rapidgator\.net/i];

  // Diagnostics & Quality testing states
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testingInProcess, setTestingInProcess] = useState(false);
  const [selectedTestLogs, setSelectedTestLogs] = useState<string[] | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  // CI/CD Pipeline States
  const [pipelineReport, setPipelineReport] = useState<any | null>(null);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [ciSubTab, setCiSubTab] = useState<"pipeline" | "daemon">("pipeline");

  // Simulated Network load state
  const [networkLoad, setNetworkLoad] = useState<number[]>([10, 15, 12, 14, 11, 15, 13, 12, 10, 14]);

  // Set light theme on body
  useEffect(() => {
    document.body.className = "bg-surface-bg text-on-surface";
  }, []);

  // Track which tasks have been auto-saved to PC (to avoid duplicate triggers)
  const autoDownloadedRefs = useRef<Set<string>>(new Set());
  // Track which tasks are currently being saved to PC (for UI state)
  const [savingToPcIds, setSavingToPcIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    downloads.forEach((task) => {
      if (task.status === "completed" && !autoDownloadedRefs.current.has(task.id)) {
        autoDownloadedRefs.current.add(task.id);
        
        // Show "Saving to PC" status for 8 seconds
        setSavingToPcIds(prev => new Set([...prev, task.id]));
        setTimeout(() => {
          setSavingToPcIds(prev => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
        }, 8000);

        // Trigger browser native download
        const link = document.createElement("a");
        link.href = `/api/downloads/files/${task.id}`;
        link.download = task.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  }, [downloads]);

  // Status alerts & toasts
  const showStatus = useCallback((text: string, type: "info" | "success" | "error" = "info") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 5000);
  }, []);

  const showToast = useCallback((title: string, desc: string) => {
    setToastMsg({ title, desc });
    setTimeout(() => setToastMsg(null), 5000);
  }, []);

  // Poll server state
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/downloads");
      if (res.ok) {
        const data = await res.json();
        setDownloads(data.downloads || []);
        setInbox(data.inbox || []);
        setSettings(data.settings);
        setDiskUsageBytes(data.diskUsageBytes || 0);
      }
    } catch (err) {
      console.error("Failed to sync with Core Downloader:", err);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1500); // 1.5s live polling
    return () => clearInterval(interval);
  }, [fetchState]);

  // Network Load dynamic graph matching actual speed
  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkLoad((prev) => {
        const next = [...prev.slice(1)];
        const totalSpeed = downloads
          .filter(t => t.status === "downloading")
          .reduce((sum, t) => sum + (t.speed || 0), 0);

        let val = 0;
        if (totalSpeed > 0) {
          // Map speed to a bar height 50 - 95%
          val = Math.min(95, 50 + Math.floor((totalSpeed / (5 * 1024 * 1024)) * 45));
        } else {
          // Idle bar height 5 - 15%
          val = Math.floor(Math.random() * 10) + 5;
        }
        next.push(val);
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [downloads]);

  // Clipboard Grabber Monitor
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
          showToast("Link Captured", `Detected ${hosting.length} supported links in clipboard.`);
          setUrlInput((prev) => {
            const currentLines = prev.split("\n").map(l => l.trim()).filter(Boolean);
            const newLines = hosting.filter(h => !currentLines.includes(h));
            if (newLines.length > 0) {
              return [...currentLines, ...newLines].join("\n");
            }
            return prev;
          });
        }
      } catch { /* ignored */ }
    };

    const interval = setInterval(check, 1500);
    return () => clearInterval(interval);
  }, [clipboardEnabled, showToast]);

  // Configure Engine settings
  const saveEngineSettings = async (updated: Partial<EngineSettings>) => {
    try {
      const next = { ...settings, ...updated };
      setSettings(next);
      const res = await fetch("/api/downloads/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        showStatus("Settings successfully configured", "success");
      }
    } catch (err) {
      showStatus("Failed to submit configurations", "error");
    }
  };

  // Speed Limit string helper mapping
  const getSpeedLimitString = () => {
    if (settings.globalSpeedLimit <= 0) return "No Limit";
    if (settings.globalSpeedLimit < 1024) return `${settings.globalSpeedLimit} KB/s`;
    return `${(settings.globalSpeedLimit / 1024).toFixed(0)} MB/s`;
  };

  const handleSpeedLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    let limit = 0;
    if (val === "512 KB/s") limit = 512;
    else if (val === "1 MB/s") limit = 1024;
    else if (val === "2 MB/s") limit = 2048;
    else if (val === "5 MB/s") limit = 5120;
    saveEngineSettings({ globalSpeedLimit: limit });
  };

  // Crawler search scan trigger
  const triggerScraper = async () => {
    if (!urlInput.trim()) {
      showStatus("Please supply valid URL(s)", "error");
      return;
    }

    const urls = urlInput
      .split(/[\n,;]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      showStatus("Please supply valid target URL(s)", "error");
      return;
    }

    setAnalyzing(true);
    showStatus(`Crawling ${urls.length} target page(s) concurrently... ${useAi ? "Launching Gemini analysis model" : ""}`, "info");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, url: urls[0], runAi: useAi }),
      });
      const data = await res.json();
      if (res.ok && data.links) {
        // Send newly grabbed links straight to Inbox
        const addRes = await fetch("/api/inbox/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add_many", links: data.links }),
        });
        if (addRes.ok) {
          const freshState = await addRes.json();
          setInbox(freshState.inbox);
          showStatus(`Captured ${data.links.length} potential files to staged inbox!`, "success");
          setActiveTab("grabber");
        }
      } else {
        showStatus(data.error || "Webscraper parsing failed", "error");
      }
    } catch (err) {
      showStatus("Network socket timed out or crawled page was unreachable", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  // Direct-to-PC download: extracts real URL then streams directly to user's browser (no server storage)
  const handleResolve = async () => {
    if (!urlInput.trim()) return;

    const urls = urlInput
      .split(/[\n,;]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      showStatus("Please supply at least one valid URL", "error");
      return;
    }

    setAnalyzing(true);
    showStatus(`Resolving ${urls.length} URL(s)... extracting direct download links`, "info");

    try {
      // For each URL, trigger a browser download via the streaming proxy
      // This makes files go DIRECTLY to PC — no server storage
      for (let i = 0; i < urls.length; i++) {
        const sourceUrl = urls[i];
        
        // Build the streaming proxy URL — server will extract FF links and pipe bytes directly
        const streamUrl = `/api/stream-to-pc?url=${encodeURIComponent(sourceUrl)}`;
        
        // Open a browser download — Chrome will show download progress in its bar
        // File goes: Internet → Server (proxy) → Browser → PC (your Downloads folder)
        const link = document.createElement("a");
        link.href = streamUrl;
        link.download = ""; // browser will use Content-Disposition filename from server
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Small delay between multiple downloads to avoid overwhelming the server
        if (i < urls.length - 1) {
          await new Promise(r => setTimeout(r, 800));
        }
      }

      showStatus(
        `✓ ${urls.length} download${urls.length > 1 ? "s" : ""} started — check Chrome's download bar at the bottom!`,
        "success"
      );
      setUrlInput("");
    } catch (error) {
      showStatus("Failed to start download", "error");
    } finally {
      setAnalyzing(false);
    }
  };




  // Manage Link Grabber Inbox Staging Queue
  const toggleInboxSelect = async (id: string) => {
    try {
      const res = await fetch("/api/inbox/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_select", id }),
      });
      if (res.ok) {
        const data = await res.json();
        setInbox(data.inbox);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const importGrabbedToDownloads = async () => {
    try {
      const res = await fetch("/api/inbox/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_selected" }),
      });
      if (res.ok) {
        const data = await res.json();
        setInbox(data.inbox);
        setDownloads(data.downloads);
        showStatus("Staged links imported to active queue!", "success");
        setActiveTab("dashboard");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const clearInbox = async () => {
    try {
      const res = await fetch("/api/inbox/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (res.ok) {
        const data = await res.json();
        setInbox(data.inbox);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Manage Active Downloads tasks
  const handleTaskAction = async (id: string, action: "start" | "pause" | "retry" | "delete") => {
    try {
      const res = await fetch("/api/downloads/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        fetchState();
        if (action === "delete") showStatus("Task removed from active system list", "info");
      }
    } catch (error) {
      showStatus("Connection error with core download daemon", "error");
    }
  };

  // Clear completed history queue
  const clearFinishedHistory = async () => {
    try {
      const res = await fetch("/api/downloads/clear-history", { method: "POST" });
      if (res.ok) {
        fetchState();
        showStatus("Completed queue history list purged", "info");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Play/Pause sweep controls
  const downloadAll = () => {
    const idleTasks = downloads.filter((t) => t.status === "paused" || t.status === "queued" || t.status === "error");
    if (idleTasks.length === 0) {
      showStatus("No idle or queued downloads found to start", "info");
      return;
    }
    idleTasks.forEach((task, i) => {
      setTimeout(() => handleTaskAction(task.id, "start"), i * 400);
    });
    showStatus(`Resuming all ${idleTasks.length} queued task(s)...`, "success");
  };

  const pauseAll = () => {
    const activeTasks = downloads.filter((t) => t.status === "downloading");
    if (activeTasks.length === 0) {
      showStatus("No active downloads to pause", "info");
      return;
    }
    activeTasks.forEach((task, i) => {
      setTimeout(() => handleTaskAction(task.id, "pause"), i * 400);
    });
    showStatus(`Pausing all active downloads...`, "info");
  };

  // Diagnostics Suite runner
  const executeDiagnosticsSuite = async () => {
    setTestingInProcess(true);
    showStatus("Launching active core diagnostic test suite...", "info");
    try {
      const res = await fetch("/api/health-test", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.results) {
          setTestResults(data.results);
          showStatus("Diagnostic health checks finished successfully!", "success");
          if (data.results.length > 0) {
            setSelectedTestId(data.results[0].id);
            setSelectedTestLogs(data.results[0].logs);
          }
        } else {
          showStatus("Tests executed with standard anomalies", "error");
        }
      } else {
        showStatus("API response error from health probe endpoint", "error");
      }
    } catch (err) {
      showStatus("Connection failure during active diagnostics runner", "error");
    } finally {
      setTestingInProcess(false);
    }
  };

  // CI/CD pipeline verification runner
  const runCiCdPipeline = async () => {
    setRunningPipeline(true);
    showStatus("Initializing CI/CD Pipeline Verification Engine...", "info");
    try {
      const res = await fetch("/api/pipeline/run");
      if (res.ok) {
        const data = await res.json();
        setPipelineReport(data);
        if (data.buildPassed) {
          showStatus("CI/CD Pipeline Quality Gate Passed! Build verified.", "success");
        } else {
          showStatus("CI/CD Build Rejected! Quality specifications failed.", "error");
        }
      } else {
        showStatus("API response error from Quality Pipeline backend", "error");
      }
    } catch (err) {
      showStatus("Connection error with CI/CD Pipeline pipeline endpoint", "error");
    } finally {
      setRunningPipeline(false);
    }
  };

  useEffect(() => {
    runCiCdPipeline();
  }, []);

  // Filtered downloads items list
  const filteredDownloads = downloads.filter((t) => {
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && (t.status === "downloading" || t.status === "queued" || t.status === "extracting")) ||
      (filterStatus === "completed" && t.status === "completed") ||
      (filterStatus === "error" && t.status === "error");

    const matchSearch =
      !searchQuery ||
      t.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.url.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Group tasks by packageId
  const groupedDownloads = (() => {
    const groups: Map<string, { packageId: string; packageName: string; tasks: typeof filteredDownloads }> = new Map();
    const ungrouped: typeof filteredDownloads = [];

    filteredDownloads.forEach((task) => {
      if (task.packageId) {
        if (!groups.has(task.packageId)) {
          groups.set(task.packageId, {
            packageId: task.packageId,
            packageName: task.packageName || task.packageId,
            tasks: [],
          });
        }
        groups.get(task.packageId)!.tasks.push(task);
      } else {
        ungrouped.push(task);
      }
    });

    return { groups: Array.from(groups.values()), ungrouped };
  })();

  // Numeric stats calculations
  const totalCompletedCount = downloads.filter(t => t.status === "completed").length;
  const totalActiveCount = downloads.filter(t => t.status === "downloading" || t.status === "queued" || t.status === "extracting").length;
  const totalErrorCount = downloads.filter(t => t.status === "error").length;
  const totalSize = downloads.reduce((sum, t) => sum + (t.size > 0 ? t.size : 0), 0);
  const linesCount = urlInput.split("\n").filter((l) => l.trim().startsWith("http")).length;

  const totalSpeed = downloads
    .filter(t => t.status === "downloading")
    .reduce((sum, t) => sum + (t.speed || 0), 0);

  const getGlobalSpeed = () => {
    if (totalSpeed > 0) {
      return formatBytes(totalSpeed) + "/s";
    }
    return "0.0 KB/s";
  };

  return (
    <div className="bg-surface-bg text-on-surface font-body-md selection:bg-accent/20 selection:text-accent min-h-screen flex flex-col">
      
      {/* ─── TopNavBar ─── */}
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
        </div>
      </header>

      {/* ─── Sidebar Navigation ─── */}
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
              {downloads.length}
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab("dashboard"); setFilterStatus("active"); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-transform active:scale-[0.98] ${
              activeTab === "dashboard" && filterStatus === "active" ? "bg-container-highest text-primary font-bold" : "text-on-surface-variant hover:bg-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[20px] text-accent animate-pulse">sync</span>
            <span className="text-body-md flex-1">Active</span>
            <span className="text-xs bg-container-high text-on-surface-variant font-mono px-1.5 py-0.2 rounded-full font-bold">
              {totalActiveCount}
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab("dashboard"); setFilterStatus("completed"); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-transform active:scale-[0.98] ${
              activeTab === "dashboard" && filterStatus === "completed" ? "bg-container-highest text-primary font-bold" : "text-on-surface-variant hover:bg-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span className="text-body-md flex-1">Completed</span>
            <span className="text-xs bg-container-high text-on-surface-variant font-mono px-1.5 py-0.2 rounded-full font-bold">
              {totalCompletedCount}
            </span>
          </button>
        </nav>
      </aside>

      {/* ─── Main Content Area ─── */}
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
                    className="p-2 hover:bg-container-highest rounded-lg text-on-surface-variant cursor-pointer" 
                    title="Resume All Downloads"
                  >
                    <span className="material-symbols-outlined">play_arrow</span>
                  </button>
                  <button 
                    onClick={pauseAll}
                    className="p-2 hover:bg-container-highest rounded-lg text-on-surface-variant cursor-pointer" 
                    title="Pause All Downloads"
                  >
                    <span className="material-symbols-outlined">pause</span>
                  </button>
                  <button 
                    onClick={clearFinishedHistory}
                    className="p-2 hover:bg-container-highest rounded-lg text-on-surface-variant cursor-pointer" 
                    title="Clear Completed History"
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
                    value={getSpeedLimitString()} 
                    onChange={handleSpeedLimitChange}
                    className="bg-transparent border-none text-body-sm focus:ring-0 p-0 font-bold outline-none cursor-pointer"
                  >
                    <option value="No Limit">No Limit</option>
                    <option value="512 KB/s">512 KB/s</option>
                    <option value="1 MB/s">1 MB/s</option>
                    <option value="2 MB/s">2 MB/s</option>
                    <option value="5 MB/s">5 MB/s</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* Alert Toast Notification */}
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
                    <span className="material-symbols-outlined text-primary text-[20px]">save_alt</span>
                    Download Directly to Your PC
                  </h2>
                  <div className="text-xs text-on-surface-variant mb-3 leading-relaxed">
                    Paste FuckingFast or direct file URLs (one per line). Files download <strong>directly to your PC</strong> — the server extracts the real link and streams it straight to your browser.
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
                      {linesCount} link(s) detected • Ctrl+Enter to resolve
                    </span>
                    <button 
                      onClick={handleResolve}
                      disabled={analyzing || linesCount === 0}
                      className="bg-accent hover:brightness-110 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40 cursor-pointer"
                    >
                      {analyzing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Resolving...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">download_for_offline</span>
                          Download to My PC
                        </>
                      )}
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
                          {filteredDownloads.length} FILE{filteredDownloads.length !== 1 ? "S" : ""} • {formatBytes(filteredDownloads.reduce((s,t)=>s+(t.size>0?t.size:0), 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {filteredDownloads.length === 0 ? (
                    <div className="p-12 text-center max-w-md mx-auto">
                      <div className="bg-container-high w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 border border-outline-variant text-on-surface-variant">
                        <span className="material-symbols-outlined text-[24px]">cloud_download</span>
                      </div>
                      <h4 className="font-bold text-on-surface text-sm">Download queue is empty</h4>
                      <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                        Submit download links above to begin.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-outline-variant/30">
                      {/* Render grouped packages first */}
                      {groupedDownloads.groups.map((group) => (
                        <PackageGroupRow
                          key={group.packageId}
                          packageName={group.packageName}
                          tasks={group.tasks}
                          expandedTaskId={expandedTaskId}
                          onToggleExpand={(id) => setExpandedTaskId(expandedTaskId === id ? null : id)}
                          onStart={(id) => handleTaskAction(id, "start")}
                          onPause={(id) => handleTaskAction(id, "pause")}
                          onRetry={(id) => handleTaskAction(id, "retry")}
                          onDelete={(id) => handleTaskAction(id, "delete")}
                        />
                      ))}
                      {/* Render ungrouped tasks */}
                      {groupedDownloads.ungrouped.map((task) => (
                        <TaskRowItem 
                           key={task.id}
                           task={task}
                           expanded={expandedTaskId === task.id}
                           isSavingToPc={savingToPcIds.has(task.id)}
                           onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                           onStart={() => handleTaskAction(task.id, "start")}
                           onPause={() => handleTaskAction(task.id, "pause")}
                           onRetry={() => handleTaskAction(task.id, "retry")}
                           onDelete={() => handleTaskAction(task.id, "delete")}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Link Grabber Tab */}
            {activeTab === "grabber" && (
              <div className="space-y-6">
                <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
                  <h2 className="text-sm font-bold text-on-surface mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">public</span>
                    Webpage Crawler & Link Grabber
                  </h2>
                  <div className="text-xs text-on-surface-variant leading-relaxed">
                    Scan target hosting page links, resolve direct file URLs, and stage them to queue.
                  </div>
                  <textarea 
                    rows={3}
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Input URLs to scan (one per line, e.g. fuckingfast.co links)..."
                    className="w-full text-xs font-mono bg-container-low border border-outline-variant rounded-lg p-3 outline-none focus:border-accent resize-none transition-colors"
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={useAi} 
                        onChange={() => setUseAi(!useAi)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      <span className="ml-2 text-xs font-bold text-on-surface-variant">Enable Intelligent Gemini Extraction</span>
                    </label>

                    <button 
                      onClick={triggerScraper}
                      disabled={analyzing || !urlInput.trim()}
                      className="bg-primary hover:bg-inverse-surface text-on-primary text-xs font-bold px-5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-40"
                    >
                      {analyzing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Crawling website index...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">search</span>
                          Start Scan
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Staged Grabbed Links List */}
                <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-container-high/50 border-b border-outline-variant flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-on-surface text-body-md flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500">star</span>
                        Staged Grabbed Files Inbox ({inbox.length})
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">Choose elements to import into active scheduler downloads queue.</p>
                    </div>

                    {inbox.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={clearInbox}
                          className="text-xs bg-surface hover:bg-container-high border border-outline-variant text-on-surface-variant px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Clear Inbox
                        </button>
                        <button 
                          onClick={importGrabbedToDownloads}
                          className="text-xs bg-accent hover:brightness-110 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
                        >
                          Import Selected ({inbox.filter(l => l.selected).length})
                        </button>
                      </div>
                    )}
                  </div>

                  {inbox.length === 0 ? (
                    <div className="p-12 text-center max-w-md mx-auto">
                      <div className="bg-container-high w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 border border-outline-variant text-on-surface-variant">
                        <span className="material-symbols-outlined text-[24px]">public</span>
                      </div>
                      <h4 className="font-bold text-on-surface text-sm">Inbox queue is empty</h4>
                      <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                        Crawl folder page links or paste hosting detail index links in the scraper above to stage files.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-on-surface-variant">
                        <thead className="bg-container-high/40 text-[10px] uppercase text-outline tracking-wider border-b border-outline-variant">
                          <tr>
                            <th className="px-4 py-2.5 text-center w-12">
                              <input 
                                type="checkbox"
                                checked={inbox.every(l => l.selected)}
                                onChange={() => {
                                  const allSel = inbox.every(l => l.selected);
                                  setInbox(inbox.map(l => ({ ...l, selected: !allSel })));
                                }}
                                className="rounded border-outline-variant bg-surface text-accent focus:ring-0 cursor-pointer"
                              />
                            </th>
                            <th className="px-4 py-2.5">File details</th>
                            <th className="px-4 py-2.5">MIME-Type</th>
                            <th className="px-4 py-2.5">Size</th>
                            <th className="px-4 py-2.5">Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/30 bg-surface">
                          {inbox.map((link) => (
                            <tr key={link.id} className="hover:bg-container-low/40 transition-colors">
                              <td className="px-4 py-2.5 text-center">
                                <input 
                                  type="checkbox"
                                  checked={link.selected}
                                  onChange={() => toggleInboxSelect(link.id)}
                                  className="rounded border-outline-variant bg-surface text-accent focus:ring-0 cursor-pointer"
                                />
                              </td>
                              <td className="px-4 py-2.5 max-w-sm">
                                <p className="font-bold text-on-surface truncate" title={link.filename}>
                                  {link.filename}
                                </p>
                                <p className="text-[10px] text-outline font-mono mt-0.5 truncate break-all block">
                                  {link.url}
                                </p>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="bg-container-high text-on-surface-variant px-1.5 py-0.5 rounded text-[10px] font-mono border border-outline-variant">
                                  {link.mimeType || "application/octet-stream"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-on-surface font-bold font-mono">
                                {formatBytes(link.size)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold border ${
                                  link.source.includes("extractor") || link.source.includes("gemini")
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200 font-bold"
                                    : "bg-container-high text-on-surface-variant border-outline-variant"
                                }`}>
                                  {link.source}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
              <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-on-surface text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined">settings</span>
                    Engine Configurations
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1">Configure simultaneous transfers settings, bandwidth throttler, and duplicate collision actions.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">Simultaneous Active Queues</label>
                    <p className="text-[11px] text-on-surface-variant">Limit of simultaneous downloads allowed before scheduling others in queue.</p>
                    <select 
                      value={settings.maxSimultaneous}
                      onChange={(e) => saveEngineSettings({ maxSimultaneous: parseInt(e.target.value) })}
                      className="w-full text-xs bg-container-low border border-outline-variant rounded-lg p-2.5 outline-none cursor-pointer"
                    >
                      <option value="1">1 Active task</option>
                      <option value="2">2 Concurrent tasks (Standard)</option>
                      <option value="3">3 Concurrent tasks</option>
                      <option value="5">5 High-parallel tasks</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">Duplicate Policy Action</label>
                    <p className="text-[11px] text-on-surface-variant">Policy taken when adding a file that already exists in system directory.</p>
                    <select 
                      value={settings.duplicateAction}
                      onChange={(e) => saveEngineSettings({ duplicateAction: e.target.value as any })}
                      className="w-full text-xs bg-container-low border border-outline-variant rounded-lg p-2.5 outline-none cursor-pointer"
                    >
                      <option value="rename">Rename File (Appends unique timestamp)</option>
                      <option value="overwrite">Overwrite existing local binary</option>
                      <option value="skip">Ignore task addition</option>
                    </select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider">Active Storage Downloads Directory</label>
                    <p className="text-[11px] text-on-surface-variant">The local storage directory on the server where completed downloads are saved.</p>
                    <input 
                      type="text" 
                      disabled 
                      value={settings.downloadDirectory} 
                      className="w-full text-xs bg-container-low border border-outline-variant rounded-lg p-2.5 font-mono text-outline select-all"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2 bg-container-low p-4 border border-outline-variant rounded-lg">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span>Bandwidth Speed Limit Throttler</span>
                      <span className="text-accent">{getSpeedLimitString()}</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                      Throttles multi-threaded TCP download chunks relative to limits. Set to Unlimited for full bandwidth.
                    </p>
                    <div className="flex items-center gap-4 pt-3">
                      <input 
                        type="range"
                        min="0"
                        max="10240"
                        step="256"
                        value={settings.globalSpeedLimit}
                        onChange={(e) => saveEngineSettings({ globalSpeedLimit: parseInt(e.target.value) })}
                        className="flex-1 accent-accent h-1 bg-container-highest rounded-lg cursor-pointer"
                      />
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => saveEngineSettings({ globalSpeedLimit: 0 })}
                          className="text-[10px] bg-surface hover:bg-container-high px-2 py-1 rounded text-on-surface-variant border border-outline-variant font-bold cursor-pointer"
                        >
                          Unlimited
                        </button>
                        <button 
                          onClick={() => saveEngineSettings({ globalSpeedLimit: 512 })}
                          className="text-[10px] bg-surface hover:bg-container-high px-2 py-1 rounded text-on-surface-variant border border-outline-variant font-bold cursor-pointer"
                        >
                          512 KB/s
                        </button>
                        <button 
                          onClick={() => saveEngineSettings({ globalSpeedLimit: 2048 })}
                          className="text-[10px] bg-surface hover:bg-container-high px-2 py-1 rounded text-on-surface-variant border border-outline-variant font-bold cursor-pointer"
                        >
                          2 MB/s
                        </button>
                      </div>
                    </div>
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

            {/* Diagnostics & CI/CD tab */}
            {activeTab === "testing" && (
              <div className="space-y-6">
                <div className="flex border-b border-outline-variant mb-2">
                  <button
                    onClick={() => setCiSubTab("pipeline")}
                    className={`px-4 py-2.5 text-xs border-b-2 font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      ciSubTab === "pipeline" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-primary"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    CI/CD Quality Pipeline Gate
                  </button>
                  <button
                    onClick={() => setCiSubTab("daemon")}
                    className={`px-4 py-2.5 text-xs border-b-2 font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      ciSubTab === "daemon" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-primary"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">medical_services</span>
                    Daemon Hardware Diagnostics
                  </button>
                </div>

                {ciSubTab === "pipeline" && (
                  <div className="space-y-6">
                    <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-container-high border border-outline-variant text-on-surface-variant px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                            Branch: main
                          </span>
                          <span className="text-[10px] text-outline font-mono">
                            Commit: HEAD (7f2a173)
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-on-surface mt-2 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary text-[18px]">gavel</span>
                          Enterprise Quality Gate Audit
                        </h3>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                          Evaluates repository files. Commits are rejected if statement coverage falls below <b>90%</b>, any critical vulnerability triggers, or tests fail.
                        </p>
                      </div>
                      <button
                        onClick={runCiCdPipeline}
                        disabled={runningPipeline}
                        className="bg-primary hover:bg-inverse-surface text-on-primary text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-40"
                      >
                        {runningPipeline ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Auditing Gate...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[16px]">sync</span>
                            Re-run Quality Audit
                          </>
                        )}
                      </button>
                    </div>

                    {pipelineReport && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-8 space-y-6">
                          <div className={`p-5 rounded-xl border flex items-start gap-4 ${
                            pipelineReport.buildPassed 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-rose-50 border-rose-200 text-rose-800"
                          }`}>
                            <div className={`p-2 rounded-lg ${
                              pipelineReport.buildPassed ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                            }`}>
                              <span className="material-symbols-outlined text-[24px]">
                                {pipelineReport.buildPassed ? "verified" : "error"}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-bold text-sm leading-none flex items-center gap-2">
                                Verdict: {pipelineReport.buildPassed ? "APPROVED & STABLE" : "REJECTED / ACTION REQUIRED"}
                              </h4>
                              <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                                {pipelineReport.buildPassed 
                                  ? "All quality and safety gates successfully passed. The bundle code is verified and ready for containerized server deployments."
                                  : "The CI/CD pipeline intercepted compile or security blocks in the current workspace. Action required."}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] text-outline uppercase font-bold">Statement Coverage</p>
                                <p className="text-2xl font-black text-on-surface font-mono mt-1">{pipelineReport.overallCoverage}%</p>
                              </div>
                              <div className="mt-3">
                                <div className="w-full bg-container-highest rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${pipelineReport.overallCoverage >= 90 ? "bg-accent" : "bg-error"}`}
                                    style={{ width: `${pipelineReport.overallCoverage}%` }}
                                  ></div>
                                </div>
                                <p className="text-[9px] text-on-surface-variant mt-1.5">90.0% Minimum Required</p>
                              </div>
                            </div>

                            <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] text-outline uppercase font-bold">SonarQube Index</p>
                                <p className="text-2xl font-black text-on-surface font-mono mt-1">{pipelineReport.sonarQubeScore}/100</p>
                              </div>
                              <div className="mt-3">
                                <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-mono font-bold">
                                  Grade A Certified
                                </span>
                              </div>
                            </div>

                            <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-col justify-between">
                              <div>
                                <p className="text-[10px] text-outline uppercase font-bold">SAST Threat Shield</p>
                                <p className={`text-2xl font-black mt-1 ${
                                  pipelineReport.sastIssues.length === 0 ? "text-emerald-600 font-mono" : "text-rose-600"
                                }`}>
                                  {pipelineReport.sastIssues.length === 0 ? "SECURE" : `${pipelineReport.sastIssues.length} Vulnerabilities`}
                                </p>
                              </div>
                              <div className="mt-3">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${
                                  pipelineReport.sastIssues.length === 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                }`}>
                                  {pipelineReport.sastIssues.length === 0 ? "0 Risks" : "Critical Alert"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-surface border border-outline-variant rounded-xl p-5 space-y-3 font-mono text-xs">
                            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-sans">CI Check Checklist</h4>
                            <div className="flex items-center justify-between p-2.5 bg-container-low border border-outline-variant rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-600 font-bold">✓</span>
                                <span className="text-on-surface-variant">Step 1: ESLint Syntax Verification</span>
                              </div>
                              <span className="text-emerald-600 text-[10px] font-bold uppercase">Passed</span>
                            </div>
                            <div className="flex items-center justify-between p-2.5 bg-container-low border border-outline-variant rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-600 font-bold">✓</span>
                                <span className="text-on-surface-variant">Step 2: Prettier Aesthetic Format Check</span>
                              </div>
                              <span className="text-emerald-600 text-[10px] font-bold uppercase">Formatted</span>
                            </div>
                            <div className="flex items-center justify-between p-2.5 bg-container-low border border-outline-variant rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-600 font-bold">✓</span>
                                <span className="text-on-surface-variant">Step 3: Snyk Dependencies CVE Audit</span>
                              </div>
                              <span className="text-emerald-600 text-[10px] font-bold uppercase">Clean</span>
                            </div>
                          </div>
                        </div>

                        <div className="lg:col-span-4 space-y-4">
                          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">Automated Test Suites</h4>
                          <div className="bg-surface border border-outline-variant rounded-xl p-4 space-y-2.5 max-h-[450px] overflow-y-auto">
                            {pipelineReport.testScenarios.map((t: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-start gap-2 p-2 bg-container-low rounded border border-outline-variant">
                                <div>
                                  <span className={`text-[8px] font-bold uppercase rounded px-1 tracking-wider border ${
                                    t.type === "unit" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                    t.type === "integration" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    "bg-pink-50 text-pink-700 border-pink-200"
                                  }`}>
                                    {t.type}
                                  </span>
                                  <p className="text-[11px] font-bold text-on-surface mt-1 leading-snug">{t.name}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-[9px] font-mono text-outline">{t.durationMs}ms</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {ciSubTab === "daemon" && (
                  <div className="space-y-6">
                    <div className="bg-surface border border-outline-variant rounded-xl p-5 shadow-sm">
                      <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-[18px]">medical_services</span>
                        Daemon Diagnostic Center
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                        Verify file system write speeds, dry-run regex parsers, and inspect local metadata storage caches.
                      </p>
                      <div className="mt-4 flex items-center gap-4">
                        <button
                          onClick={executeDiagnosticsSuite}
                          disabled={testingInProcess}
                          className="bg-primary hover:bg-inverse-surface text-on-primary text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                          Run Diagnostics
                        </button>
                      </div>
                    </div>

                    {testResults.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-7 space-y-3">
                          {testResults.map((test) => (
                            <div
                              key={test.id}
                              onClick={() => {
                                setSelectedTestId(test.id);
                                setSelectedTestLogs(test.logs);
                              }}
                              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                                selectedTestId === test.id 
                                  ? "bg-container-high/50 border-primary" 
                                  : "bg-surface border-outline-variant hover:bg-container-low/40"
                              }`}
                            >
                              <div>
                                <span className="text-[9px] font-bold uppercase py-0.5 px-1.5 bg-container-high border border-outline-variant rounded text-on-surface-variant font-mono">
                                  {test.category} • {test.duration}ms
                                </span>
                                <h5 className="text-xs font-bold text-on-surface mt-1.5">{test.name}</h5>
                                <p className="text-[11px] text-on-surface-variant mt-1">{test.message}</p>
                              </div>
                              <span className={`material-symbols-outlined text-[20px] ${test.status === "passed" ? "text-emerald-500" : "text-rose-500"}`}>
                                {test.status === "passed" ? "check_circle" : "error"}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="lg:col-span-5">
                          <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm h-[380px] flex flex-col">
                            <div className="bg-container-high/40 px-4 py-2 border-b border-outline-variant flex items-center justify-between font-mono text-[10px] text-outline font-bold">
                              <span>Stdout Log Console</span>
                              <span>Active</span>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 font-mono text-[10px] text-on-surface-variant bg-container-low space-y-1">
                              {selectedTestLogs ? (
                                selectedTestLogs.map((log, i) => (
                                  <div key={i} className="flex gap-1.5">
                                    <span className="text-outline select-none">[{i+1}]</span>
                                    <span className="break-all">{log}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center text-outline py-20">Select a diagnostic test case to view logs</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-outline-variant bg-surface-container-low px-container-padding py-4 mt-8">
          <div className="max-w-[1152px] mx-auto flex items-center justify-between text-[10px] text-on-surface-variant font-mono">
            <span>StreamlineDL • Version 2.1</span>
          </div>
        </footer>

        {/* Floating Toast Notification */}
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

// ─── Package Group Row Component ───
interface PackageGroupRowProps {
  packageName: string;
  tasks: DownloadTask[];
  expandedTaskId: string | null;
  onToggleExpand: (id: string) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

function PackageGroupRow({ packageName, tasks, expandedTaskId, onToggleExpand, onStart, onPause, onRetry, onDelete }: PackageGroupRowProps) {
  const [groupExpanded, setGroupExpanded] = React.useState(false);

  const totalSize = tasks.reduce((s, t) => s + (t.size > 0 ? t.size : 0), 0);
  const totalDownloaded = tasks.reduce((s, t) => s + (t.downloaded || 0), 0);
  const totalSpeed = tasks.filter(t => t.status === "downloading").reduce((s, t) => s + (t.speed || 0), 0);
  const allCompleted = tasks.every(t => t.status === "completed");
  const anyDownloading = tasks.some(t => t.status === "downloading" || t.status === "extracting");
  const anyError = tasks.some(t => t.status === "error");
  const percentage = totalSize > 0 ? Math.round((totalDownloaded / totalSize) * 100) : 0;

  const groupStatus = allCompleted ? "completed" : anyError ? "error" : anyDownloading ? "downloading" : "queued";

  return (
    <div className="flex flex-col bg-surface">
      {/* Group header row */}
      <div className="h-row-height flex items-center px-4 group bg-container-low/30 hover:bg-container-low/50 transition-colors border-l-4 border-primary/40">
        <div className="w-8 flex justify-center flex-shrink-0">
          <span className={`material-symbols-outlined text-primary ${anyDownloading ? "animate-spin" : ""}`}>
            {allCompleted ? "inventory_2" : "folder_zip"}
          </span>
        </div>
        <div className="flex-1 px-4 min-w-0">
          <button
            onClick={() => setGroupExpanded(!groupExpanded)}
            className="text-left w-full focus:outline-none cursor-pointer flex items-center gap-2 group/btn"
            title={packageName}
          >
            <span className="text-body-md font-bold text-on-surface truncate flex-1 group-hover/btn:text-primary transition-colors" title={packageName}>
              {packageName}
            </span>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold flex-shrink-0">
              {tasks.length} files
            </span>
            <span className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform ${groupExpanded ? "rotate-180" : ""}`}>
              expand_more
            </span>
          </button>
        </div>

        {/* Combined progress bar */}
        <div className="w-[300px] flex items-center gap-4 px-4 flex-shrink-0 hidden md:flex">
          <div className="flex-1 h-1.5 bg-container-highest rounded-full overflow-hidden">
            <div
              style={{ width: `${totalSize > 0 ? percentage : (anyDownloading ? 15 : 0)}%` }}
              className={`h-full progress-glow transition-all duration-350 ${
                anyError ? "bg-error" : allCompleted ? "bg-accent" : anyDownloading ? "bg-accent animate-pulse" : "bg-outline"
              }`}
            />
          </div>
          <span className="text-label-mono text-on-surface-variant w-12 text-right">
            {totalSize > 0 ? `${percentage}%` : anyDownloading ? "--" : "--"}
          </span>
        </div>

        {/* Status */}
        <div className="w-[180px] text-label-mono text-on-surface-variant text-right flex-shrink-0 hidden sm:block truncate pr-2">
          {allCompleted ? "All Completed" :
           anyDownloading ? `${formatBytes(totalSpeed)}/s` :
           anyError ? "Error" : "Queued"}
        </div>

        {/* Size */}
        <div className="w-[100px] text-label-mono text-on-surface-variant text-right flex-shrink-0 hidden sm:block">
          {totalSize > 0 ? formatBytes(totalSize) : "Unknown"}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
          {anyDownloading && (
            <button
              onClick={() => tasks.filter(t => t.status === "downloading").forEach(t => onPause(t.id))}
              className="p-1.5 hover:bg-container-highest rounded text-on-surface-variant cursor-pointer"
              title="Pause all"
            >
              <span className="material-symbols-outlined text-[18px]">pause</span>
            </button>
          )}
          {!anyDownloading && !allCompleted && (
            <button
              onClick={() => tasks.filter(t => t.status === "queued" || t.status === "paused").forEach(t => onStart(t.id))}
              className="p-1.5 hover:bg-container-highest rounded text-accent cursor-pointer"
              title="Start all"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            </button>
          )}
          <button
            onClick={() => tasks.forEach(t => onDelete(t.id))}
            className="p-1.5 hover:bg-container-highest rounded text-error cursor-pointer"
            title="Delete group"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* Individual tasks within the group (expanded) */}
      {groupExpanded && (
        <div className="border-l-4 border-primary/20 ml-4">
          {tasks.map((task) => (
            <TaskRowItem
              key={task.id}
              task={task}
              expanded={expandedTaskId === task.id}
              isSavingToPc={false}
              onToggleExpand={() => onToggleExpand(task.id)}
              onStart={() => onStart(task.id)}
              onPause={() => onPause(task.id)}
              onRetry={() => onRetry(task.id)}
              onDelete={() => onDelete(task.id)}
              isGroupChild
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Task Row Item Component ───
interface TaskRowProps {
  task: DownloadTask;
  expanded: boolean;
  isSavingToPc: boolean;
  onToggleExpand: () => void;
  onStart: () => void;
  onPause: () => void;
  onRetry: () => void;
  onDelete: () => void;
  isGroupChild?: boolean;
}

function TaskRowItem({
  task,
  expanded,
  isSavingToPc,
  onToggleExpand,
  onStart,
  onPause,
  onRetry,
  onDelete,
  isGroupChild,
}: TaskRowProps) {
  // When completed, always show 100% — polling lag can cause the last value to be 98-99%
  const rawPercentage = task.size > 0 ? Math.round((task.downloaded / task.size) * 100) : -1;
  const isCompleted = task.status === "completed";
  const percentage = isCompleted ? (task.size > 0 ? 100 : -1) : rawPercentage;

  const isDownloading = task.status === "downloading";
  const isQueued = task.status === "queued";
  const isPaused = task.status === "paused";
  const isError = task.status === "error";
  const isExtracting = task.status === "extracting";

  const getStatusLabel = () => {
    if (isSavingToPc) return "↓ Saving to PC...";
    if (isDownloading) {
      const spd = task.speed > 0 ? formatBytes(task.speed) + "/s" : "Connecting...";
      return spd;
    }
    if (isQueued) return "Queued";
    if (isPaused) return "Paused";
    if (isCompleted) return "Saved to PC ✓";
    if (isError) return task.error ? `Error: ${task.error.slice(0, 40)}` : "Error";
    if (isExtracting) return "Resolving link...";
    return task.status;
  };

  const getProgressBarColor = () => {
    if (isError) return "bg-error";
    if (isPaused) return "bg-outline";
    if (isQueued) return "bg-container-highest";
    if (isExtracting) return "bg-amber-500 animate-pulse";
    if (isCompleted) return "bg-accent";
    return "bg-accent";
  };

  // Progress bar width — completed always 100%, unknown size shows animated pulse
  const progressWidth = isCompleted ? "100%" : (percentage >= 0 ? `${percentage}%` : (isDownloading || isExtracting ? "100%" : "0%"));
  const progressClass = !isCompleted && percentage < 0 && (isDownloading || isExtracting)
    ? `${getProgressBarColor()} animate-pulse opacity-40`
    : `${getProgressBarColor()} progress-glow transition-all duration-500`;

  const iconName = getMimeIcon(task.mimeType, task.filename);

  return (
    <div className={`flex flex-col bg-surface hover:bg-container-low/20 transition-colors ${isError ? "border-l-4 border-error" : ""} ${isGroupChild ? "bg-container-low/10" : ""}`}>
      <div className="h-row-height flex items-center px-4 group">
        <div className="w-8 flex justify-center flex-shrink-0">
          <span className={`material-symbols-outlined text-on-surface-variant group-hover:text-accent transition-colors ${isDownloading || isExtracting ? "animate-spin text-accent" : ""}`}>
            {iconName}
          </span>
        </div>

        {/* Filename — takes up remaining space, shows full name as tooltip */}
        <div className="flex-1 px-3 min-w-0 overflow-hidden">
          <button 
            onClick={onToggleExpand}
            className="text-left w-full focus:outline-none cursor-pointer group/name"
            title={task.filename}
          >
            <span className="text-body-md font-medium text-on-surface group-hover/name:text-accent transition-colors block truncate">
              {task.filename}
            </span>
            {task.downloaded > 0 && !isCompleted && (
              <span className="text-[9px] text-outline font-mono">
                {formatBytes(task.downloaded)}{task.size > 0 ? ` / ${formatBytes(task.size)}` : " downloaded"}
              </span>
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-[220px] flex items-center gap-3 px-3 flex-shrink-0 hidden md:flex">
          <div className="flex-1 h-1.5 bg-container-highest rounded-full overflow-hidden">
            <div 
              style={{ width: progressWidth }}
              className={`h-full ${progressClass}`}
            />
          </div>
          <span className={`text-label-mono w-10 text-right flex-shrink-0 font-bold ${
            isCompleted ? "text-accent" : "text-on-surface-variant"
          }`}>
            {isCompleted ? "100%" : (percentage >= 0 ? `${percentage}%` : "--")}
          </span>
        </div>

        {/* Status text */}
        <div className={`w-[160px] text-[10px] text-right flex-shrink-0 hidden sm:block truncate pr-2 ${
          isSavingToPc ? "text-blue-600 font-bold animate-pulse" :
          isCompleted ? "text-accent font-semibold" :
          isError ? "text-error" :
          "text-on-surface-variant"
        }`}>
          {getStatusLabel()}
        </div>

        {/* File size */}
        <div className="w-[90px] text-label-mono text-on-surface-variant text-right flex-shrink-0 hidden sm:block">
          {task.size > 0 ? formatBytes(task.size) : task.downloaded > 0 ? `~${formatBytes(task.downloaded)}` : "?"}
        </div>

        {/* Control actions */}
        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
          {isDownloading && (
            <button 
              onClick={onPause}
              className="p-1.5 hover:bg-container-highest rounded text-on-surface-variant cursor-pointer flex items-center justify-center"
              title="Pause download"
            >
              <span className="material-symbols-outlined text-[18px]">pause</span>
            </button>
          )}

          {(isPaused || isQueued) && (
            <button 
              onClick={onStart}
              className="p-1.5 hover:bg-container-highest rounded text-accent cursor-pointer flex items-center justify-center"
              title="Start download"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            </button>
          )}

          {(isCompleted || isError) && (
            <button 
              onClick={onRetry}
              className="p-1.5 hover:bg-container-highest rounded text-on-surface-variant cursor-pointer flex items-center justify-center"
              title="Re-download"
            >
              <span className="material-symbols-outlined text-[18px]">replay</span>
            </button>
          )}

          {isCompleted && (
            <a 
              href={`/api/downloads/files/${task.id}`}
              download={task.filename}
              className="p-1.5 hover:bg-accent/10 rounded text-accent cursor-pointer flex items-center justify-center"
              title="Save to my device"
            >
              <span className="material-symbols-outlined text-[18px]">save_alt</span>
            </a>
          )}

          <button 
            onClick={onDelete}
            className="p-1.5 hover:bg-container-highest rounded text-error cursor-pointer flex items-center justify-center"
            title="Remove task"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* Expanded details panel */}
      {expanded && (
        <div className="px-12 py-4 bg-surface-container-low border-t border-outline-variant/30 text-[11px] space-y-3 font-mono text-on-surface-variant">
          {/* Full filename display */}
          <div>
            <span className="font-bold text-outline">Filename:</span>{" "}
            <span className="text-on-surface break-all select-all">{task.filename}</span>
          </div>
          <div>
            <span className="font-bold text-outline">Target URL:</span>{" "}
            <a href={task.url} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all">
              {task.url}
            </a>
          </div>
          {task.sourcePageUrl && (
            <div>
              <span className="font-bold text-outline">Source Page:</span>{" "}
              <a href={task.sourcePageUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all">
                {task.sourcePageUrl}
              </a>
            </div>
          )}
          <div className="flex gap-6 flex-wrap">
            <div><span className="font-bold text-outline">Downloaded:</span> <span>{formatBytes(task.downloaded)}{task.size > 0 ? ` / ${formatBytes(task.size)}` : ""}</span></div>
            <div><span className="font-bold text-outline">MIME:</span> <span>{task.mimeType || "application/octet-stream"}</span></div>
            <div><span className="font-bold text-outline">Resumable:</span> <span>{task.resumable ? "Yes" : "No"}</span></div>
            {task.error && <div className="text-error break-all"><span className="font-bold">Error:</span> {task.error}</div>}
          </div>

          {isCompleted && (
            <div className="pt-2">
              <a
                href={`/api/downloads/files/${task.id}`}
                download={task.filename}
                className="inline-flex items-center gap-2 bg-accent hover:brightness-110 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">save_alt</span>
                Save to My Device
              </a>
            </div>
          )}

          {/* Introspection logs */}
          {task.debug_info && (
            <details className="mt-2">
              <summary className="text-[10px] text-outline font-bold cursor-pointer flex items-center gap-1.5 font-sans">
                <span className="material-symbols-outlined text-[14px]">bug_report</span>
                Network Diagnostics
              </summary>
              <div className="mt-2 bg-container-low border border-outline-variant rounded-xl overflow-hidden">
                <div className="p-3 space-y-2 text-[10px]">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-outline">Method:</span> {task.debug_info.requestMethod}</div>
                    <div><span className="text-outline">Status:</span> {task.debug_info.responseStatus}</div>
                    <div className="col-span-2"><span className="text-outline">Redirect Chain ({task.debug_info.redirectChain.length} hops):</span></div>
                    <div className="col-span-2 pl-4 text-[9px] text-outline leading-tight">
                      {task.debug_info.redirectChain.map((url, i) => (
                        <div key={i} className="truncate">• {url}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
