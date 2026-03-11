// src/config/audio.ts
// BGM track mapping for DeepSeek-driven background music system.
// Paths reference public folder; Next.js serves from /.

import { resumeAudio } from "@/lib/audioEngine";

export const BGM_TRACKS: Record<string, string> = {
  bgm_1_calm: "/audio/bgm/bgm_1_calm.mp3",
  bgm_2_suspense: "/audio/bgm/bgm_2_suspense.mp3",
  bgm_3_encounter: "/audio/bgm/bgm_3_encounter.mp3",
  bgm_4_chase: "/audio/bgm/bgm_4_chase.mp3",
  bgm_5_darkmoon: "/audio/bgm/bgm_5_darkmoon.mp3",
  bgm_6_sanloss: "/audio/bgm/bgm_6_sanloss.mp3",
  bgm_7_safezone: "/audio/bgm/bgm_7_safezone.mp3",
  bgm_8_boss: "/audio/bgm/bgm_8_boss.mp3",
};

export const DEFAULT_BGM = "bgm_1_calm" as const;

export const VALID_BGM_KEYS = new Set<string>(Object.keys(BGM_TRACKS));

export function isValidBgmTrack(key: string): key is keyof typeof BGM_TRACKS {
  return VALID_BGM_KEYS.has(key);
}

/** Call from user-gesture handler (e.g. "继续冒险" / "新游戏" click) to unlock browser autoplay policy. */
export function unlockBgmOnUserGesture(): void {
  try {
    resumeAudio();
  } catch {
    // ignore
  }
  try {
    const a = new Audio();
    a.volume = 0;
    a.src = BGM_TRACKS["bgm_1_calm"]!;
    void a.play().then(() => {
      a.pause();
      a.currentTime = 0;
    }).catch(() => {});
  } catch {
    // ignore
  }
}
