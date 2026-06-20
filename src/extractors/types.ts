export interface ExtractedDownload {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  resumable: boolean;
}

export interface HostExtractor {
  canHandle(url: string): boolean;
  extract(url: string): Promise<ExtractedDownload[]>;
}
