import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { HostExtractor, ExtractedDownload } from "./types.js";

const execAsync = promisify(exec);

export class FuckingFastExtractor implements HostExtractor {
  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return /^(www\.)?fuckingfast\.(co|net)$/i.test(parsed.hostname) && !parsed.pathname.startsWith("/dl/");
    } catch (_) {
      return false;
    }
  }

  async extract(url: string): Promise<ExtractedDownload[]> {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 1];
    if (!id) {
      throw new Error("Invalid FuckingFast URL: Could not extract file ID");
    }

    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
    
    // Normalize target page URL to always be the standard detail page
    const pageUrl = `https://fuckingfast.co/${id}`;

    // Use a shared cookie jar file in the project directory to reuse Cloudflare clearance sessions
    const cookieFile = path.join(process.cwd(), "ff_cookies.txt");

    // Invoke curl to bypass Cloudflare with retries and cookie sharing
    const curlCmd = process.platform === "win32" ? "curl.exe" : "curl";
    
    // Add all standard browser headers to match browser TLS and header signature
    const cmd = `"${curlCmd}" -s -L --compressed ` +
      `-A "${userAgent}" ` +
      `-H "Accept: ${accept}" ` +
      `-H "Accept-Language: en-US,en;q=0.9" ` +
      `-H "Referer: https://fuckingfast.co/" ` +
      `-H "sec-ch-ua: \\"Not_A Brand\\";v=\\"8\\", \\"Chromium\\";v=\\"120\\", \\"Google Chrome\\";v=\\"120\\"" ` +
      `-H "sec-ch-ua-mobile: ?0" ` +
      `-H "sec-ch-ua-platform: \\"Windows\\"" ` +
      `-H "Sec-Fetch-Dest: document" ` +
      `-H "Sec-Fetch-Mode: navigate" ` +
      `-H "Sec-Fetch-Site: cross-site" ` +
      `-H "Sec-Fetch-User: ?1" ` +
      `-H "Upgrade-Insecure-Requests: 1" ` +
      `--cookie "${cookieFile}" --cookie-jar "${cookieFile}" "${pageUrl}"`;

    let stdout = "";
    let attempts = 0;
    const maxAttempts = 5;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        
        // If we failed on previous attempts, delete the cookies file to clear any bad state
        if (attempts > 1 && fs.existsSync(cookieFile)) {
          try { fs.unlinkSync(cookieFile); } catch (_) {}
        }

        const { stdout: curlOutput } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        stdout = curlOutput;

        // Check if we got the signed URL
        if (stdout.match(/window\.open\("(https:\/\/dl\.fuckingfast\.co\/dl\/[^"]+)"\)/)) {
          lastError = null;
          break;
        }

        if (stdout.includes("Just a moment")) {
          lastError = new Error("FuckingFast Page Cloudflare verification failed during extraction");
        } else {
          lastError = new Error("Could not locate signed download link in FuckingFast page HTML");
        }

        if (attempts < maxAttempts) {
          console.warn(`[EXTRACTOR] FuckingFast extraction attempt ${attempts} failed. Retrying in 2.5s...`);
          await new Promise((r) => setTimeout(r, 2500));
        }
      } catch (err: any) {
        lastError = err;
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const match = stdout.match(/window\.open\("(https:\/\/dl\.fuckingfast\.co\/dl\/[^"]+)"\)/);
    const signedUrl = match ? match[1] : "";

    // Try to parse the filename from title or HTML
    const titleMatch = stdout.match(/<title>([^<]+)<\/title>/);
    let filename = titleMatch ? titleMatch[1].trim() : `${id}.rar`;
    
    // Clean up filename from title
    filename = filename.replace(/["'\\/]/g, "_");

    // Try to parse the size
    let sizeBytes = -1;
    const sizeMatch = stdout.match(/Size:\s*([\d.]+)\s*([KMGT]B)/i);
    if (sizeMatch) {
      const value = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toUpperCase();
      if (unit === "KB") sizeBytes = Math.ceil(value * 1024);
      else if (unit === "MB") sizeBytes = Math.ceil(value * 1024 * 1024);
      else if (unit === "GB") sizeBytes = Math.ceil(value * 1024 * 1024 * 1024);
      else if (unit === "TB") sizeBytes = Math.ceil(value * 1024 * 1024 * 1024 * 1024);
    }

    return [{
      filename,
      url: signedUrl,
      size: sizeBytes,
      mimeType: "application/octet-stream",
      resumable: true
    }];
  }
}
