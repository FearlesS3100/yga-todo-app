export {};

declare global {
  interface Window {
    electron?: {
      platform: string;
      showNotification: (payload: { title: string; body?: string; todoId?: string }) => void;
      openExternal?: (url: string) => void;
      downloadFile?: (url: string, fileName: string) => Promise<{ success: boolean; reason?: string }>;
      onBeforeQuit?: (callback: () => void) => void;
      onCloseRequested?: (callback: () => void) => (() => void) | void;
      confirmQuit?: () => void;
      setNeedsCloseReason?: (value: boolean) => void;
      getAppVersion?: () => Promise<string>;
      getHostname?: () => Promise<string>;
      getSystemInfo?: () => Promise<unknown>;
      onNotificationClick?: (callback: (payload: { todoId?: string }) => void) => (() => void) | void;
      getIntroSettings?: () => Promise<{ skipIntroPermanently?: boolean }>;
      getIntroVideoUrl?: () => Promise<string>;
      getIntroVideoDataUrl?: () => Promise<string>;
      onIntroSettingsChanged?: (
        callback: (settings: { skipIntroPermanently?: boolean }) => void
      ) => (() => void) | void;
    };
  }
}
