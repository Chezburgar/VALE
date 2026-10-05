// Where Vale is running. One build is served by the Vale LAN server, from a
// GitHub Pages subpath and from the desktop app's app:// protocol, so public
// files are always addressed relative to the page, never from the site root.

/** URL of a file in public/, relative to wherever Vale is served from. */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '');
}

export interface LanStatus {
  running: boolean;
  port: number;
  /** LAN IPv4 addresses friends can use to reach this PC. */
  addresses: string[];
  error?: string;
}

/** Bridge exposed by the desktop app's preload script (electron/preload.cjs). */
export interface ValeDesktop {
  version: string;
  platform: 'win32' | 'darwin' | 'linux' | string;
  lan: {
    start(): Promise<LanStatus>;
    stop(): Promise<LanStatus>;
    status(): Promise<LanStatus>;
  };
  openExternal(url: string): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
}

declare global {
  interface Window {
    valeDesktop?: ValeDesktop;
  }
}

export const desktop: ValeDesktop | null = window.valeDesktop ?? null;

export const DESKTOP_DOWNLOAD_URL = 'https://chezburgar.github.io/VALE/';
export const LAN_PORT = 8787;
