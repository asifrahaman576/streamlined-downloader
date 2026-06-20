import React from "react";
import { Cpu, ShieldCheck, Database, Layers, Network, Zap, Play, Terminal } from "lucide-react";

export default function ArchitectureDoc() {
  return (
    <div className="space-y-8 text-slate-800">
      {/* Introduction Card */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-xl p-6 shadow-md border border-slate-800">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layers className="text-blue-400 w-6 h-6" /> Production-Grade Architecture Recommendation
        </h2>
        <p className="mt-2 text-slate-300 leading-relaxed text-sm">
          While this dashboard runs a fully functional TypeScript/Express engine for local sandbox demonstration, the optimal production-grade architecture for a cross-platform system (Windows, Linux, macOS, Android, Web) is detailed below.
        </p>
      </div>

      {/* Grid of Why This Stack */}
      <div>
        <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4 flex items-center gap-2 text-slate-900">
          <Cpu className="w-5 h-5 text-indigo-600" /> Technology Stack Rationales
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase">Frontend</span>
            <h4 className="font-bold text-slate-950 mt-2">Flutter (Dart)</h4>
            <ul className="mt-2 text-xs text-slate-600 space-y-2 list-disc pl-4 leading-normal">
              <li><strong>Zero-Cost Cross-Platform:</strong> Single source builds high-perf native interfaces for Windows (Win32), macOS (Cocoa), Linux (GTK), Android (NDK/Java), and Web canvas.</li>
              <li><strong>Exceptional Performance:</strong> Skia/Impeller graphics engine renders UI frames natively at 60/120 FPS skipping WebView translation layers.</li>
              <li><strong>Native Integrations:</strong> Mature channel bindings to hook system download directory storage and desktop tray menus.</li>
            </ul>
          </div>

          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase">Daemon Core / Backend</span>
            <h4 className="font-bold text-slate-950 mt-2">Rust (tokio / reqwest)</h4>
            <ul className="mt-2 text-xs text-slate-600 space-y-2 list-disc pl-4 leading-normal">
              <li><strong>No Runtime Overhead:</strong> Extremely small micro-agent footprints suited for continuous background services on user servers and Android background tasks.</li>
              <li><strong>Fearless Concurrency:</strong> Multi-threading guarantees safe thread-sharing of connection range chunk workers, avoiding memory corruption or data races.</li>
              <li><strong>Network Efficacy:</strong> Hyper/Reqwest supports high-throughput connection multiplexing, HTTP/2, socks5 tunneling, and custom TCP socket binding.</li>
            </ul>
          </div>

          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase">Database</span>
            <h4 className="font-bold text-slate-950 mt-2">SQLite (via SQLCipher)</h4>
            <ul className="mt-2 text-xs text-slate-600 space-y-2 list-disc pl-4 leading-normal">
              <li><strong>Zero Administration:</strong> Embedded database creates a single durable file, avoiding background database connection ports or user credential configuration.</li>
              <li><strong>ACID Guarantees:</strong> Transactions protect queued tasks and active progress logs from unexpected app crashes or server restart interruptions.</li>
              <li><strong>Low Latency:</strong> Near-instant memory footprint and local disk reads/writes fit perfectly in background client daemons.</li>
            </ul>
          </div>

          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <span className="bg-rose-50 text-rose-700 text-xs font-semibold px-2.5 py-1 rounded-full uppercase">Crawler & Link Grabber</span>
            <h4 className="font-bold text-slate-950 mt-2">Playwright / AI Resolvers</h4>
            <ul className="mt-2 text-xs text-slate-600 space-y-2 list-disc pl-4 leading-normal">
              <li><strong>Headless DOM Execution:</strong> Executes Javascript single-page apps (SPA) to reveal download selectors behind clicks, cookies, or cloud protection walls.</li>
              <li><strong>Anti-Bot Evasion:</strong> Uses play-stealth signatures to authenticate against link hosters safely.</li>
              <li><strong>AI-Driven Parsing:</strong> Feeds DOM metadata into LLM models to dynamically identify download assets amidst convoluted multi-page download redirects.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Code Structure and Schemas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3 flex items-center gap-2 text-slate-900">
            <Layers className="w-5 h-5 text-indigo-600" /> Modular Directory Layout
          </h3>
          <div className="bg-slate-950 text-slate-300 font-mono text-xs p-5 rounded-lg shadow-inner overflow-x-auto leading-relaxed">
            <p className="text-emerald-400"># Cross-Platform Rust Core & Flutter UI Struct</p>
            <p>core-daemon/              <span className="text-slate-500"># System Daemon (Rust Toolchain)</span></p>
            <p> ├── Cargo.toml</p>
            <p> ├── src/</p>
            <p> │    ├── main.rs            <span className="text-slate-500"># Rust Service Core Entry</span></p>
            <p> │    ├── engine/            <span className="text-slate-500"># Download Queue Scheduler + Range worker</span></p>
            <p> │    ├── analyzer/          <span className="text-slate-500"># Web Scraper + JS redirect dynamic resolver</span></p>
            <p> │    ├── crawlers/          <span className="text-slate-500"># Extensible Host Plugins (Mega, YouTube)</span></p>
            <p> │    ├── storage/           <span className="text-slate-500"># Database models & SQLite schemas</span></p>
            <p> │    └── api/               <span className="text-slate-500"># JSON-RPC / IPC local binding web server</span></p>
            <p>client-interface/           <span className="text-slate-500"># User App Client (Flutter Suite)</span></p>
            <p> ├── pubspec.yaml</p>
            <p> ├── lib/</p>
            <p> │    ├── main.dart          <span className="text-slate-500"># Application Bootstrap</span></p>
            <p> │    ├── views/             <span className="text-slate-500"># Dashboard, LinkGrabber, Settings UI templates</span></p>
            <p> │    ├── core_service/      <span className="text-slate-500"># Dart FFI or IPC API Socket link to daemon</span></p>
            <p> │    └── provider/          <span className="text-slate-500"># App State Managers & Throttle limits mapping</span></p>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3 flex items-center gap-2 text-slate-900">
            <Database className="w-5 h-5 text-indigo-600" /> Database Schema (SQLite)
          </h3>
          <div className="bg-slate-950 text-slate-300 font-mono text-xs p-5 rounded-lg shadow-inner overflow-x-auto leading-relaxed">
            <p className="text-indigo-400">-- 1. Main Download Queue Records</p>
            <p className="text-emerald-500">CREATE TABLE</p> <span className="text-blue-300">downloads</span> (
            <p className="pl-4">id TEXT PRIMARY KEY,</p>
            <p className="pl-4">url TEXT NOT NULL,</p>
            <p className="pl-4">filename TEXT NOT NULL,</p>
            <p className="pl-4">total_size INTEGER NOT NULL DEFAULT -1,</p>
            <p className="pl-4">downloaded_size INTEGER NOT NULL DEFAULT 0,</p>
            <p className="pl-4">status TEXT CHECK(status IN ('queued', 'downloading', 'paused', 'completed', 'error')),</p>
            <p className="pl-4">resumable INTEGER DEFAULT 1,</p>
            <p className="pl-4">mime_type TEXT,</p>
            <p className="pl-4">error_message TEXT,</p>
            <p className="pl-4">added_at DATETIME DEFAULT CURRENT_TIMESTAMP,</p>
            <p className="pl-4">completed_at DATETIME</p>
            <p>);</p>
            
            <p className="text-indigo-400 mt-2">-- 2. Scraped Crawler Links Staging</p>
            <p className="text-emerald-500">CREATE TABLE</p> <span className="text-blue-300">grabbed_links</span> (
            <p className="pl-4">id TEXT PRIMARY KEY,</p>
            <p className="pl-4">source_url TEXT NOT NULL,</p>
            <p className="pl-4">file_url TEXT NOT NULL,</p>
            <p className="pl-4">filename TEXT NOT NULL,</p>
            <p className="pl-4">size INTEGER DEFAULT -1,</p>
            <p className="pl-4">mime_type TEXT,</p>
            <p className="pl-4">selected INTEGER DEFAULT 1</p>
            <p>);</p>
          </div>
        </div>
      </div>

      {/* Production REST/RPC API Contracts */}
      <div>
        <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3 flex items-center gap-2 text-slate-900">
          <Network className="w-5 h-5 text-indigo-600" /> RPC / Core REST Communications Protocol
        </h3>
        <p className="text-xs text-slate-600 mb-4 leading-normal">
          The Flutter client and the background Daemon establish a lightweight JSON-RPC loop over local websockets or loopback sockets, avoiding HTTP processing overhead.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg text-xs">
            <span className="bg-slate-200 font-mono text-slate-800 px-1.5 py-0.5 rounded uppercase font-bold">POST /action</span>
            <p className="mt-2 font-semibold">Queue Actions</p>
            <p className="text-slate-500 mt-1 mt-1 leading-normal">Start, Stop, Prioritize, or Schedule files.</p>
            <pre className="bg-slate-900 text-slate-300 p-2 rounded mt-2 font-mono text-[9px] overflow-x-auto">
{JSON.stringify({ id: "t_10x", action: "resume" }, null, 2)}
            </pre>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg text-xs">
            <span className="bg-slate-200 font-mono text-slate-800 px-1.5 py-0.5 rounded uppercase font-bold">POST /crawler</span>
            <p className="mt-2 font-semibold">Web scraper coordinate trigger</p>
            <p className="text-slate-500 mt-1 leading-normal">Toggles headless Chrome scan on the provided URL.</p>
            <pre className="bg-slate-900 text-slate-300 p-2 rounded mt-2 font-mono text-[9px] overflow-x-auto">
{JSON.stringify({ url: "https://site.com/dl", headless: true }, null, 2)}
            </pre>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg text-xs">
            <span className="bg-slate-200 font-mono text-slate-800 px-1.5 py-0.5 rounded uppercase font-bold">POST /settings</span>
            <p className="mt-2 font-semibold font-bold">Limit settings</p>
            <p className="text-slate-500 mt-1 leading-normal">Adjust network throttle pipelines natively.</p>
            <pre className="bg-slate-900 text-slate-300 p-2 rounded mt-2 font-mono text-[9px] overflow-x-auto">
{JSON.stringify({ simultaneous: 3, speedLimitKB: 50 }, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Step by Step Roadmap */}
      <div>
        <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4 flex items-center gap-2 text-slate-900">
          <Zap className="w-5 h-5 text-indigo-600" /> Step-by-Step Production Roadmap
        </h3>
        <div className="space-y-4 text-xs">
          <div className="flex items-start gap-3">
            <div className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">1</div>
            <div>
              <h4 className="font-bold text-slate-950 text-sm">Phase 1: Local Rust CLI Core Daemon & SQLite (Month 1)</h4>
              <p className="text-slate-600 leading-normal mt-1">
                Construct the native console application. Implement SQLite tables, download chunk range downloaders using tokio threads, and support simple resume and pause. Build local CLI commands to add downloads directly.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">2</div>
            <div>
              <h4 className="font-bold text-slate-950 text-sm">Phase 2: Scraper Engines & Plugin Architecture (Month 2)</h4>
              <p className="text-slate-600 leading-normal mt-1">
                Design a generic Trait dynamic dispatch system in Rust allowing custom Javascript modules or Rust plugins to analyze URLs. Incorporate Playwright bindings for headless crawling to capture JS encrypted links.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">3</div>
            <div>
              <h4 className="font-bold text-slate-950 text-sm">Phase 3: Native Desktop & Mobile Client Interfaces (Month 3)</h4>
              <p className="text-slate-600 leading-normal mt-1">
                Develop the cross-platform Dart app core in Flutter. Bind Flutter states to the Rust IPC socket connection. Build the responsive sidebars, system tray notification bindings, and customizable speed sliders.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">4</div>
            <div>
              <h4 className="font-bold text-slate-950 text-sm">Phase 4: Integrations & Extensions (Month 4)</h4>
              <p className="text-slate-600 leading-normal mt-1">
                Roll out standard browser extensions for Chrome/Firefox/Safari. Use native messaging protocols or local port webhooks to redirect the active active tab coordinates straight to the desktop client.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Optimizations Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
        <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-lg">
          <h4 className="font-bold text-emerald-950 flex items-center gap-2 text-sm mb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600" /> Security Standard Protocols
          </h4>
          <ul className="text-xs text-emerald-900 space-y-2 list-disc pl-4 leading-normal">
            <li><strong>SHA-256 Hash Auditing:</strong> Automatically triggers file verification checks immediately on completion to guarantee payload integrity.</li>
            <li><strong>Path Traversal Protection:</strong> Sanitizes and filters filename characters strictly, preventing overwrite of system directories (e.g., matching files starting with `../`).</li>
            <li><strong>Sandbox Isolation:</strong> Standardizes native OS permissions to securely isolate the core daemon inside targeted user directories.</li>
          </ul>
        </div>

        <div className="p-5 bg-blue-50/50 border border-blue-200 rounded-lg">
          <h4 className="font-bold text-blue-950 flex items-center gap-2 text-sm mb-3">
            <Zap className="w-5 h-5 text-blue-600" /> High Performance Optimizations
          </h4>
          <ul className="text-xs text-blue-900 space-y-2 list-disc pl-4 leading-normal">
            <li><strong>TCP Multi-segmentation:</strong> Divides a single file download into up to 10 concurrent chunks using range requests, speeding up downloads from server-throttled sites.</li>
            <li><strong>Zero-Copy Disk Writes:</strong> Intercepts TCP sockets, writing payload buffers straight into system cache structures to maximize HDD/SSD throughput.</li>
            <li><strong>Backpressure Throttling:</strong> Dynamically adjusts buffer buffers in active sockets relative to running hardware configurations.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
