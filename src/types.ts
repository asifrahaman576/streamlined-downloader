export interface DownloadDebugInfo {
  requestUrl: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  redirectChain: string[];
  cookiesSent?: string;
  cookiesReceived?: string[];
  timestamp: string;
}

export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  size: number; // total size in bytes (-1 if unknown)
  downloaded: number; // bytes downloaded so far
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'error' | 'extracting';
  speed: number; // bytes per second
  error?: string;
  mimeType: string;
  addedAt: string;
  completedAt?: string;
  resumable: boolean;
  debug_info?: DownloadDebugInfo;

  // JDownloader-style additions
  speedLimit?: number;        // per-task KB/s limit (0 = use global, undefined = use global)
  priority?: number;          // higher = picked sooner by scheduler (default: 0)
  extractionState?: 'pending' | 'extracting' | 'ready' | 'failed'; // extraction pipeline state
  sourcePageUrl?: string;     // original hosting page URL (for re-extraction on resume)
  connections?: number;       // number of parallel chunk connections (default: 1)
  packageName?: string;       // name of the grouped package (e.g. for multi-part files)
  packageId?: string;         // unique ID for grouping tasks together
}

export interface GrabbedLink {
  id: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  resumable: boolean;
  selected: boolean;
  source: string; // e.g. 'direct', 'link-crawler', 'gemini-analyzer', 'fuckingfast-extractor'
  sourcePageUrl?: string;
  packageName?: string;
}

export interface EngineSettings {
  maxSimultaneous: number;
  globalSpeedLimit: number; // in KB/s, 0 for unlimited
  autoRetryCount: number;
  downloadDirectory: string;
  duplicateAction: 'rename' | 'overwrite' | 'skip';
  stopAfterCurrent?: boolean;
  clipboardMonitorEnabled?: boolean;
  autoExtractArchives?: boolean;
}

export interface WebpageAnalysisResult {
  title: string;
  url: string;
  links: GrabbedLink[];
  summary: string; // Brief visual summary of the analyzed webpage
}

// Batch extraction status for the /api/queue/batch endpoint
export interface BatchExtractionStatus {
  inputUrl: string;
  state: 'pending' | 'extracting' | 'queued' | 'failed';
  taskIds: string[];
  error?: string;
  filesFound: number;
}
