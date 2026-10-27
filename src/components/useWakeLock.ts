import { useEffect } from 'react';

type WakeLockSentinelLike = { release(): Promise<void> };

/**
 * Keeps the screen awake while mounted (camera sessions: the phone lies untouched on the floor
 * for minutes). Re-acquired when the tab becomes visible again; silently unsupported elsewhere.
 */
export function useWakeLock() {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let active = true;
    const acquire = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      // Browsers release the lock when the tab hides; drop our handle before asking again so
      // every acquired sentinel is also the one we release.
      const old = sentinel;
      sentinel = null;
      await old?.release().catch(() => {});
      if (!active) return;
      try {
        sentinel = await wakeLock.request('screen');
      } catch {
        sentinel = null; // low battery, or not allowed: the OS decides
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, []);
}
