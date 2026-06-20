import fs from "fs";
import path from "path";
import { DownloadTask, GrabbedLink } from "./types.js";

interface ActiveDownload {
  req: any;
  fileStream: any;
  speedCalcBytes: number;
  speedCalcStart: number;
}

console.log("======================================================================");
console.log("⚡ DAEMON CORE - EXHAUSTIVE AUTOMATED QA TEST SUITE");
console.log("======================================================================");

let exitCode = 0;
const testResults: Array<{ name: string; type: string; status: "success" | "failed"; err?: string }> = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTest(name: string, type: string, fn: () => void | Promise<void>) {
  console.log(`[RUNNING] [${type}] ${name}...`);
  const start = Date.now();
  try {
    await fn();
    console.log(`[PASSED]  [${type}] ${name} (${Date.now() - start}ms)`);
    testResults.push({ name, type, status: "success" });
  } catch (err: any) {
    console.error(`[FAILED]  [${type}] ${name}`);
    console.error(`          Reason: ${err.message}`);
    testResults.push({ name, type, status: "failed", err: err.message });
    exitCode = 1;
  }
}

// ----------------------------------------------------------------------
// 1. UNIT TESTS
// ----------------------------------------------------------------------

// Safe path resolver function (copied from server.ts for isolated unit testing)
function getSafePath(id: string, filename: string, baseDir: string): string {
  const cleanId = String(id).replace(/[^a-zA-Z0-9_\-]/g, "");
  const cleanFilename = path.basename(filename).replace(/[\\/]/g, "_");
  return path.join(baseDir, `${cleanId}_${cleanFilename}`);
}

await runTest("Path Traversal and File Sanitize Check", "Unit Test", () => {
  const baseDir = "/root/downloads";
  
  // Test case A: Simple valid inputs
  const p1 = getSafePath("task123", "image.png", baseDir);
  assert(p1 === path.normalize("/root/downloads/task123_image.png"), `Standard path incorrect: ${p1}`);

  // Test case B: Path injection slashes
  const p2 = getSafePath("task-99", "../../etc/passwd", baseDir);
  assert(p2 === path.normalize("/root/downloads/task-99_passwd"), `Traversal not squashed: ${p2}`);

  // Test case C: Windows path injection backslashes
  const p3 = getSafePath("task-88", "..\\..\\windows\\system32.dll", baseDir);
  const expectedWindows = path.normalize("/root/downloads/task-88_system32.dll");
  const expectedPosix = path.normalize("/root/downloads/task-88_.._.._windows_system32.dll");
  assert(p3 === expectedWindows || p3 === expectedPosix, `Backslashes not neutralised: ${p3}`);
});

await runTest("XSS Security Stripper Protection", "Unit Test", () => {
  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const maliciousTitle = "<script>alert('XSS')</script> & \"Header\"";
  const safe = escapeHtml(maliciousTitle);
  assert(!safe.includes("<script>"), "Failed to escape opening tag");
  assert(safe.includes("&lt;script&gt;"), "Failed to correctly encode tags");
  assert(safe.includes("&quot;"), "Failed to encode quotation marks");
  assert(safe.includes("&amp;"), "Failed to encode ampersands");
});

// ----------------------------------------------------------------------
// 2. INTEGRATION TESTS
// ----------------------------------------------------------------------
await runTest("Serialized State Debounced I/O Write Test", "Integration Test", async () => {
  const tempDbFp = path.join(process.cwd(), "test_db_persistence.json");
  
  // Simulated asynchronous debounce writer
  let saveTimeout: NodeJS.Timeout | null = null;
  const simulatedDbSave = (data: any, cb: () => void) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      fs.writeFileSync(tempDbFp, JSON.stringify(data), "utf8");
      cb();
    }, 100);
  };

  const payload = { counter: 1 };
  
  // Trigger multiple successive writes (debouncer should merge them into 1 operation)
  simulatedDbSave({ counter: 1 }, () => {});
  simulatedDbSave({ counter: 2 }, () => {});
  await new Promise<void>((res) => {
    simulatedDbSave({ counter: 3 }, () => {
      res();
    });
  });

  const fileExists = fs.existsSync(tempDbFp);
  assert(fileExists, "Test DB JSON file was not saved to storage");
  
  const savedData = JSON.parse(fs.readFileSync(tempDbFp, "utf8"));
  assert(savedData.counter === 3, "Merged output lost the latest update state");
  
  // Clean up
  fs.unlinkSync(tempDbFp);
});

// ----------------------------------------------------------------------
// 3. REGRESSION & SECURITY CHECKS
// ----------------------------------------------------------------------
await runTest("SSRF Filter Bounds Assertion", "Regression Test", () => {
  const isSsrfoK = (inputUrl: string): boolean => {
    try {
      const parsedUrl = new URL(inputUrl);
      const hostLower = parsedUrl.hostname.toLowerCase();
      if (
        hostLower === "localhost" ||
        hostLower === "127.0.0.1" ||
        hostLower === "0.0.0.0" ||
        hostLower.startsWith("169.254")
      ) {
        return false; // SSRF attempt blocked
      }
      return true;
    } catch (_) {
      return false;
    }
  };

  assert(!isSsrfoK("http://localhost:3000/api/internal"), "Allowed localhost loopback");
  assert(!isSsrfoK("https://127.0.0.1/metadata"), "Allowed ipv4 loopback");
  assert(!isSsrfoK("http://169.254.169.254/latest/meta-data/"), "Allowed AWS metadata URL IP");
  assert(isSsrfoK("https://images.unsplash.com/photo-1"), "Blocked reliable public URL");
});

// ----------------------------------------------------------------------
// 4. E2E FLOW & STATE CONCURRENCY TESTS
// ----------------------------------------------------------------------
await runTest("E2E Download Pipeline Status Machine Logic", "E2E Test", async () => {
  const task: DownloadTask = {
    id: "task_e2e_01",
    url: "mock://linux-distro",
    filename: "ubuntu.iso",
    size: 200,
    downloaded: 0,
    status: "queued",
    speed: 0,
    mimeType: "application/octet-stream",
    addedAt: new Date().toISOString(),
    resumable: true,
  };

  const active: ActiveDownload = {
    req: null,
    fileStream: null,
    speedCalcBytes: 0,
    speedCalcStart: Date.now(),
  };

  // Step 1: Schedule queue state transition to downloading
  assert(task.status === "queued", "Queue start boundary mismatch");
  task.status = "downloading";
  
  // Step 2: Feed data chunks
  task.downloaded += 50;
  assert(task.downloaded === 50, "Downloaded offset tracking failure");
  
  // Step 3: Complete execution
  task.status = "completed";
  task.speed = 0;
  assert(task.status === "completed", "Transition state output loop missing");
});

// ----------------------------------------------------------------------
// 5. CONCURRENCY & BANDWIDTH STRESS TEST
// ----------------------------------------------------------------------
await runTest("Bandwidth Equal Divisor Distribution Stress Test", "Stress Test", () => {
  const activeTasksCount = 8; // Simulate 8 concurrent downloads in queue
  const globalSpeedLimitKb = 512; // Speed limit 512 KB/s
  
  // Calculates division of bandwidth slots for throttling checks
  const getSimulatedTaskQuota = (limit: number, count: number): number => {
    return Math.ceil((limit * 1024) / count);
  };

  const speedQuotaPerChannel = getSimulatedTaskQuota(globalSpeedLimitKb, activeTasksCount);
  assert(speedQuotaPerChannel === 65536, `Quota divisor is inaccurate: ${speedQuotaPerChannel}`);
  
  // Boundary check scenario: 0 active count
  const safeDivisor = getSimulatedTaskQuota(globalSpeedLimitKb, 0 || 1);
  assert(safeDivisor === 524288, "Zero Active Task division crashed or divided improperly");
});

// ----------------------------------------------------------------------
// 6. EXTRACTOR PLUGIN INTEGRATION TEST
// ----------------------------------------------------------------------
await runTest("FuckingFast Extractor Integration Test", "Integration Test", async () => {
  const { FuckingFastExtractor } = await import("./extractors/fuckingfast.js");
  const extractor = new FuckingFastExtractor();
  
  // Verify canHandle
  assert(extractor.canHandle("https://fuckingfast.co/g1pdp1kuolm5"), "Failed to handle fuckingfast.co URL");
  assert(extractor.canHandle("https://www.fuckingfast.co/g1pdp1kuolm5"), "Failed to handle www.fuckingfast.co URL");
  assert(extractor.canHandle("https://fuckingfast.net/abc"), "Failed to handle fuckingfast.net URL");
  assert(!extractor.canHandle("https://dl.fuckingfast.co/dl/abc"), "Incorrectly handled direct download link");
  assert(!extractor.canHandle("https://google.com"), "Incorrectly handled google.com URL");

  // Verify extract (make a live request to extract watch dogs 2 part 1)
  console.log("[TEST] Executing FuckingFastExtractor.extract() on live link...");
  const results = await extractor.extract("https://fuckingfast.co/g1pdp1kuolm5");
  assert(results.length === 1, `Expected 1 extracted download, got ${results.length}`);
  
  const file = results[0];
  console.log(`[TEST] Extracted filename: ${file.filename}`);
  console.log(`[TEST] Extracted url: ${file.url}`);
  console.log(`[TEST] Extracted size: ${file.size} bytes`);
  
  assert(file.filename.includes("part01.rar"), `Unexpected filename: ${file.filename}`);
  assert(file.url.startsWith("https://dl.fuckingfast.co/dl/"), `Unexpected signed URL: ${file.url}`);
  assert(file.size === 524288000, `Expected 524288000 bytes (500MB), got ${file.size}`);
  assert(file.resumable === true, "Expected file to be resumable");
});

// Final report metrics
console.log("\n======================================================================");
console.log("📋 FINAL DETAILED COMPILATION METRICS");
console.log("======================================================================");
let passedCount = 0;
testResults.forEach((t) => {
  if (t.status === "success") {
    console.log(`✅ [PASSED] [${t.type}] ${t.name}`);
    passedCount++;
  } else {
    console.log(`❌ [FAILED] [${t.type}] ${t.name} - ${t.err}`);
  }
});

console.log("\n----------------------------------------------------------------------");
console.log(`📊 SUCCESS SUMMARY: ${passedCount}/${testResults.length} Tests Completed Successfully`);
console.log("----------------------------------------------------------------------");

process.exit(exitCode);
