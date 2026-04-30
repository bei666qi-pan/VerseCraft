"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import {
  getBgmMeta,
  getBgmSrc,
  getDailyBgmTrackForLocation,
  resolveBgmTrackKey,
  type BgmTrackKey,
} from "@/config/audio";
import { isMuted } from "@/lib/audioEngine";

const CROSSFADE_DURATION_MS = 2000;
const BASE_VOLUME = 0.4;

function shouldLoop(track: BgmTrackKey): boolean {
  return getBgmMeta(track).playback === "loop";
}

export function BgmPlayer() {
  const rawCurrentBgm = useGameStore((s) => s.currentBgm);
  const track = resolveBgmTrackKey(rawCurrentBgm);
  const volume = useGameStore((s) => s.volume ?? 50);
  const setBgm = useGameStore((s) => s.setBgm);
  const [muted, setMuted] = useState(() => isMuted());

  const prevTrackRef = useRef<BgmTrackKey>(track);
  const hasLoadedTrackRef = useRef(false);
  const aRef = useRef<HTMLAudioElement | null>(null);
  const bRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef<"a" | "b">("a");
  const rafRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const mutedRef = useRef(muted);
  const targetVolumeRef = useRef((volume / 100) * BASE_VOLUME);

  const targetVolume = (volume / 100) * BASE_VOLUME;

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    targetVolumeRef.current = targetVolume;
  }, [targetVolume]);

  useEffect(() => {
    const id = window.setInterval(() => setMuted(isMuted()), 500);
    return () => window.clearInterval(id);
  }, []);

  const stopCrossfade = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current != null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const returnToAmbientIfCurrent = useCallback(
    (sourceTrack: BgmTrackKey) => {
      const state = useGameStore.getState();
      if (resolveBgmTrackKey(state.currentBgm) !== sourceTrack) return;
      setBgm(getDailyBgmTrackForLocation(state.playerLocation));
    },
    [setBgm]
  );

  const scheduleFallback = useCallback(
    (sourceTrack: BgmTrackKey) => {
      clearFallbackTimer();
      const fallbackAfterMs = getBgmMeta(sourceTrack).fallbackAfterMs;
      if (typeof fallbackAfterMs !== "number") return;
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        returnToAmbientIfCurrent(sourceTrack);
      }, fallbackAfterMs);
    },
    [clearFallbackTimer, returnToAmbientIfCurrent]
  );

  const handleEnded = useCallback(() => {
    const current = resolveBgmTrackKey(useGameStore.getState().currentBgm);
    const meta = getBgmMeta(current);
    if (meta.playback === "loop" || typeof meta.fallbackAfterMs === "number") return;
    if (current === "bgm_character_death") return;
    returnToAmbientIfCurrent(current);
  }, [returnToAmbientIfCurrent]);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    const src = getBgmSrc(track);
    if (!src) return;

    scheduleFallback(track);

    if (!hasLoadedTrackRef.current) {
      hasLoadedTrackRef.current = true;
      prevTrackRef.current = track;
      const active = activeRef.current === "a" ? a : b;
      active.src = src;
      active.loop = shouldLoop(track);
      active.currentTime = 0;
      active.volume = mutedRef.current ? 0 : targetVolumeRef.current;
      if (!mutedRef.current) {
        void active.play().catch(() => {});
      }
      return;
    }

    if (track === prevTrackRef.current) return;
    prevTrackRef.current = track;

    const outgoing = activeRef.current === "a" ? a : b;
    const incoming = activeRef.current === "a" ? b : a;
    activeRef.current = activeRef.current === "a" ? "b" : "a";

    const startTime = performance.now();
    incoming.src = src;
    incoming.loop = shouldLoop(track);
    incoming.volume = 0;
    incoming.currentTime = 0;

    if (!mutedRef.current) {
      void incoming.play().catch(() => {});
    }

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / CROSSFADE_DURATION_MS);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const nextVolume = targetVolumeRef.current;

      if (mutedRef.current) {
        outgoing.volume = 0;
        incoming.volume = 0;
      } else {
        outgoing.volume = Math.max(0, nextVolume * (1 - eased));
        incoming.volume = nextVolume * eased;
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        outgoing.pause();
        outgoing.currentTime = 0;
        rafRef.current = null;
      }
    };

    stopCrossfade();
    rafRef.current = requestAnimationFrame(tick);

    return () => stopCrossfade();
  }, [track, scheduleFallback, stopCrossfade]);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    const active = activeRef.current === "a" ? a : b;
    const activeTrack = prevTrackRef.current;

    if (muted) {
      a.volume = 0;
      b.volume = 0;
      a.pause();
      b.pause();
      return;
    }

    active.src = active.src || getBgmSrc(activeTrack);
    active.loop = shouldLoop(activeTrack);
    active.volume = targetVolume;
    if (active.paused) {
      void active.play().catch(() => {});
    }
  }, [muted, targetVolume]);

  const setRefA = useCallback((el: HTMLAudioElement | null) => {
    aRef.current = el;
  }, []);

  const setRefB = useCallback((el: HTMLAudioElement | null) => {
    bRef.current = el;
  }, []);

  useEffect(() => {
    return () => {
      const a = aRef.current;
      const b = bRef.current;
      if (a) {
        a.pause();
        a.src = "";
      }
      if (b) {
        b.pause();
        b.src = "";
      }
      stopCrossfade();
      clearFallbackTimer();
    };
  }, [clearFallbackTimer, stopCrossfade]);

  return (
    <div className="sr-only" aria-hidden>
      <audio ref={setRefA} preload="metadata" onEnded={handleEnded} />
      <audio ref={setRefB} preload="metadata" onEnded={handleEnded} />
    </div>
  );
}
