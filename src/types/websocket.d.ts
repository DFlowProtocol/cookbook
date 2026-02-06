declare class WebSocket {
  constructor(url: string, protocols?: string | string[]);
  onopen: ((event: { type: string }) => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer | Buffer }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
