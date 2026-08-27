export type BrowserEvent = {
  type: "navigated" | "title" | "loading" | "error";
  tabId: number;
  url?: string;
  title?: string;
  loading?: boolean;
  message?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
};

export type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

declare global {
  interface Window {
    aakil?: {
      showTab: (tabId: number, url: string, bounds?: BrowserBounds) => Promise<{ ok: boolean }>;
      hideTabs: () => Promise<{ ok: boolean }>;
      setBounds: (tabId: number, bounds: BrowserBounds) => Promise<{ ok: boolean }>;
      navigate: (tabId: number, url: string) => Promise<{ ok: boolean }>;
      goBack: (tabId: number) => Promise<{ ok: boolean }>;
      goForward: (tabId: number) => Promise<{ ok: boolean }>;
      reload: (tabId: number) => Promise<{ ok: boolean }>;
      closeTab: (tabId: number) => Promise<{ ok: boolean }>;
      openExternal: (url: string) => Promise<{ ok: boolean }>;
      onBrowserEvent: (callback: (event: BrowserEvent) => void) => () => void;
    };
  }
}

export {};
