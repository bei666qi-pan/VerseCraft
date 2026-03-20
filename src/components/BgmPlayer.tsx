"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { BGM_TRACKS, DEFAULT_BGM, isValidBgmTrack } from "@/config/audio";
import { isMuted } from "@/lib/audioEngine";

const CROSSFADE_DURATION_MS = 2000;
const BASE_VOLUME = 0.4;

function getSrc(track: string): string {
  const path = BGM_TRACKS[track];
  return path ?? BGM_TRACKS[DEFAULT_BGM] ?? "";
}

export function BgmPlayer() {
  const currentBgm = useGameStore((s) => s.currentBgm ?? DEFAULT_BGM);
  const track = isValidBgmTrack(currentBgm) ? currentBgm : DEFAULT_BGM;
  const prevTrackRef = useRef<string>(track);
  const aRef = useRef<HTMLAudioElement | null>(null);
  const bRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef<"a" | "b">("a");
  const rafRef = useRef<number | null>(null);
  const [muted, setMuted] = useState(() => isMuted());
  const volume = useGameStore((s) => s.volume ?? 50);
  const targetVolume = (volume / 100) * BASE_VOLUME;

  useEffect(() => {
    const id = setInterval(() => setMuted(isMuted()), 500);
    return () => clearInterval(id);
  }, []);

  const stopCrossfade = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (track === prevTrackRef.current) return;
    prevTrackRef.current = track;

    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    const outgoing = activeRef.current === "a" ? a : b;
    const incoming = activeRef.current === "a" ? b : a;
    activeRef.current = activeRef.current === "a" ? "b" : "a";

    const startTime = performance.now();
    const src = getSrc(track);
    if (!src) return;

    incoming.src = src;
    incoming.volume = 0;
    incoming.loop = true;
    incoming.currentTime = 0;

    if (!muted) {
      void incoming.play().catch(() => {});
    }

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / CROSSFADE_DURATION_MS);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      if (muted) {
        outgoing.volume = 0;
        incoming.volume = 0;
      } else {
        outgoing.volume = Math.max(0, targetVolume * (1 - eased));
        incoming.volume = targetVolume * eased;
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
  }, [track, muted, targetVolume, stopCrossfade]);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    const active = activeRef.current === "a" ? a : b;
    const src = getSrc(prevTrackRef.current);

    if (muted) {
      a.volume = 0;
      b.volume = 0;
      a.pause();
      b.pause();
    } else if (src && active.paused) {
      active.src = src;
      active.loop = true;
      active.volume = targetVolume;
      void active.play().catch(() => {});
    }
  }, [muted, targetVolume]);

  useEffect(() => {
    if (muted) return;
    const active = activeRef.current === "a" ? aRef.current : bRef.current;
    if (active && !active.paused) {
      active.volume = targetVolume;
    }
  }, [muted, targetVolume]);

  const setRefA = useCallback((el: HTMLAudioElement | null) => {
    aRef.current = el;
  }, []);

  const setRefB = useCallback((el: HTMLAudioElement | null) => {
    bRef.current = el;
  }, []);

  useEffect(() => {
    return () => stopCrossfade();
  }, [stopCrossfade]);

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
    };
  }, [stopCrossfade]);

  return (
    <div className="sr-only" aria-hidden>
      <audio ref={setRefA} preload="metadata" />
      <audio ref={setRefB} preload="metadata" />
    </div>
  );
}
