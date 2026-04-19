'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { LoginScreen } from '@/components/login-screen';
import { LicenseScreen } from '@/components/license-screen';
import { Workspace } from '@/components/workspace';

type IntroSettings = {
  skipIntroPermanently: boolean;
};

export default function Home() {
  const { isLoggedIn, isLicensed, loadWorkspaceData, checkLicenseValid } = useWorkspaceStore();
  const [mounted, setMounted] = useState(false);
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [introSettings, setIntroSettings] = useState<IntroSettings>({ skipIntroPermanently: false });
  const [introVisible, setIntroVisible] = useState(true);
  const [introVideoSources, setIntroVideoSources] = useState<string[]>(['/intro.mp4']);
  const [introVideoSourceIndex, setIntroVideoSourceIndex] = useState(0);
  const introVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // On mount, verify license hasn't been revoked
  useEffect(() => {
    if (!mounted) return;
    void checkLicenseValid().finally(() => setLicenseChecked(true));
  }, [mounted, checkLicenseValid]);

  useEffect(() => {
    if (!mounted) return;
    const electronApi = window.electron;
    const fallbackSource = '/intro.mp4';

    let isDisposed = false;

    const applyVideoSources = (dataUrlSource: string, ipcSource: string) => {
      const candidateSources = [dataUrlSource, ipcSource, fallbackSource]
        .filter((source): source is string => typeof source === 'string' && source.trim().length > 0)
        .filter((source, index, list) => list.indexOf(source) === index);

      if (isDisposed) return;
      setIntroVideoSources(candidateSources.length > 0 ? candidateSources : [fallbackSource]);
      setIntroVideoSourceIndex(0);
    };

    void Promise.all([
      typeof electronApi?.getIntroVideoDataUrl === 'function'
        ? electronApi.getIntroVideoDataUrl().catch(() => '')
        : Promise.resolve(''),
      typeof electronApi?.getIntroVideoUrl === 'function'
        ? electronApi.getIntroVideoUrl().catch(() => '')
        : Promise.resolve(''),
    ]).then(([dataUrl, videoUrl]) => {
      applyVideoSources(dataUrl, videoUrl);
    }).catch(() => {
      applyVideoSources('', '');
    });

    let unsubscribe: (() => void) | undefined;

    if (typeof electronApi?.getIntroSettings === 'function') {
      void electronApi.getIntroSettings().then((settings) => {
        const nextSettings = {
          skipIntroPermanently: Boolean(settings?.skipIntroPermanently),
        };
        setIntroSettings(nextSettings);
        setIntroVisible(!nextSettings.skipIntroPermanently);
      }).catch(() => {
        setIntroSettings({ skipIntroPermanently: false });
      });
    }

    if (typeof electronApi.onIntroSettingsChanged === 'function') {
      const dispose = electronApi.onIntroSettingsChanged((settings) => {
        const nextSettings = {
          skipIntroPermanently: Boolean(settings?.skipIntroPermanently),
        };
        setIntroSettings(nextSettings);
        if (nextSettings.skipIntroPermanently) {
          setIntroVisible(false);
        }
      });
      if (typeof dispose === 'function') unsubscribe = dispose;
    }

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, [mounted]);

  const currentIntroVideoSource = introVideoSources[introVideoSourceIndex] ?? '';

  useEffect(() => {
    if (!mounted || !introVisible || introSettings.skipIntroPermanently) return;
    const introVideo = introVideoRef.current;
    if (!introVideo) return;

    const playPromise = introVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Autoplay policy or source readiness issues are handled by user gesture/fallbacks.
      });
    }
  }, [mounted, introVisible, introSettings.skipIntroPermanently, currentIntroVideoSource]);

  useEffect(() => {
    if (!mounted || introVisible || !isLoggedIn || !licenseChecked) return;
    void loadWorkspaceData();
  }, [mounted, introVisible, isLoggedIn, licenseChecked, loadWorkspaceData]);

  // Main process'e hangi ekranda olduğumuzu bildir:
  // Workspace açıkken true (sebep dialogu göster), lisans/login ekranında false (direkt kapat)
  useEffect(() => {
    if (!mounted) return;
    const electronApi = (window as Window & {
      electron?: { setNeedsCloseReason?: (value: boolean) => void };
    }).electron;
    const inWorkspace = isLicensed && isLoggedIn;
    electronApi?.setNeedsCloseReason?.(inWorkspace);
  }, [mounted, isLicensed, isLoggedIn]);

  if (!mounted) {
    return null;
  }

  let content: JSX.Element | null = null;

  if (licenseChecked) {
    if (!isLicensed) {
      content = <LicenseScreen />;
    } else if (!isLoggedIn) {
      content = <LoginScreen />;
    } else {
      content = <Workspace />;
    }
  }

  return (
    <div className="relative min-h-screen bg-black">
      {!introVisible && content}

      {introVisible && !introSettings.skipIntroPermanently && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-end bg-black">
          <video
            ref={introVideoRef}
            key={currentIntroVideoSource || 'intro-video-fallback'}
            className="absolute inset-0 h-full w-full object-cover"
            src={currentIntroVideoSource}
            autoPlay
            muted
            playsInline
            onEnded={() => setIntroVisible(false)}
            onError={() => {
              setIntroVideoSourceIndex((currentIndex) => {
                const nextIndex = currentIndex + 1;
                if (nextIndex >= introVideoSources.length) {
                  setIntroVisible(false);
                  return currentIndex;
                }
                return nextIndex;
              });
            }}
          />

          <button
            type="button"
            onClick={() => setIntroVisible(false)}
            className="relative z-[10000] m-6 rounded-md border border-white/30 bg-black/45 px-4 py-2 text-sm font-medium text-white transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            İntroyu atla
          </button>
        </div>
      )}
    </div>
  );
}
