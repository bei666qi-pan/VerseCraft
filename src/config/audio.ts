// src/config/audio.ts
// BGM track registry. Paths point at hashed public assets so CDN caches can be long lived.

import { resumeAudio } from "@/lib/audioEngine";

export type BgmPlaybackKind = "loop" | "oneshot" | "transition";

export type BgmTrackMeta = {
  label: string;
  playback: BgmPlaybackKind;
  fallbackAfterMs?: number;
};

export const BGM_TRACKS = {
  bgm_b1_daily: "/audio/bgm/b1-daily-c76b18e0b8dc.mp3",
  bgm_b2_daily: "/audio/bgm/b2-daily-5da0d2897052.mp3",
  bgm_1f_daily: "/audio/bgm/1f-daily-fe303258b181.mp3",
  bgm_2f_daily: "/audio/bgm/2f-daily-34649dce0e7a.mp3",
  bgm_3f_daily: "/audio/bgm/3f-daily-bf5adef82194.mp3",
  bgm_4f_daily: "/audio/bgm/4f-daily-4f75f3f87ee7.mp3",
  bgm_5f_daily: "/audio/bgm/5f-daily-16c1cca508da.mp3",
  bgm_6f_daily: "/audio/bgm/6f-daily-7da1276092d0.mp3",
  bgm_7f_daily: "/audio/bgm/7f-daily-fcee74eed04f.mp3",
  bgm_darkmoon_anomaly: "/audio/bgm/darkmoon-anomaly-a37f0a418da7.mp3",
  bgm_endgame_high_pressure: "/audio/bgm/endgame-high-pressure-c75c969bc380.mp3",
  bgm_combat_encounter: "/audio/bgm/combat-encounter-fa993c9a967a.mp3",
  bgm_battle_resolved: "/audio/bgm/battle-resolved-57e4c36474bb.mp3",
  bgm_key_clue: "/audio/bgm/key-clue-f168f8cd65ad.mp3",
  bgm_character_death: "/audio/bgm/character-death-702d5dd4bee4.mp3",
  bgm_sanity_collapse: "/audio/bgm/sanity-collapse-e3652423a362.mp3",
} as const;

export type BgmTrackKey = keyof typeof BGM_TRACKS;

export const DEFAULT_BGM = "bgm_b1_daily" as const satisfies BgmTrackKey;

export const BGM_TRACK_META = {
  bgm_b1_daily: { label: "B1 daily", playback: "loop" },
  bgm_b2_daily: { label: "B2 daily", playback: "loop" },
  bgm_1f_daily: { label: "1F daily", playback: "loop" },
  bgm_2f_daily: { label: "2F daily", playback: "loop" },
  bgm_3f_daily: { label: "3F daily", playback: "loop" },
  bgm_4f_daily: { label: "4F daily", playback: "loop" },
  bgm_5f_daily: { label: "5F daily", playback: "loop" },
  bgm_6f_daily: { label: "6F daily", playback: "loop" },
  bgm_7f_daily: { label: "7F daily", playback: "loop" },
  bgm_darkmoon_anomaly: { label: "darkmoon anomaly", playback: "loop" },
  bgm_endgame_high_pressure: { label: "endgame high pressure", playback: "loop" },
  bgm_combat_encounter: { label: "combat encounter", playback: "loop" },
  bgm_battle_resolved: { label: "battle resolved", playback: "transition", fallbackAfterMs: 15_000 },
  bgm_key_clue: { label: "key clue", playback: "oneshot", fallbackAfterMs: 8_000 },
  bgm_character_death: { label: "character death", playback: "oneshot" },
  bgm_sanity_collapse: { label: "sanity collapse", playback: "loop" },
} as const satisfies Record<BgmTrackKey, BgmTrackMeta>;

export const LEGACY_BGM_TRACK_ALIASES = {
  bgm_1_calm: "bgm_b1_daily",
  bgm_2_suspense: "bgm_darkmoon_anomaly",
  bgm_3_encounter: "bgm_combat_encounter",
  bgm_4_chase: "bgm_combat_encounter",
  bgm_5_darkmoon: "bgm_darkmoon_anomaly",
  bgm_6_sanloss: "bgm_sanity_collapse",
  bgm_7_safezone: "bgm_b1_daily",
  bgm_8_boss: "bgm_endgame_high_pressure",
} as const satisfies Record<string, BgmTrackKey>;

export const FLOOR_DAILY_BGM: Record<string, BgmTrackKey> = {
  B2: "bgm_b2_daily",
  B1: "bgm_b1_daily",
  "1": "bgm_1f_daily",
  "2": "bgm_2f_daily",
  "3": "bgm_3f_daily",
  "4": "bgm_4f_daily",
  "5": "bgm_5f_daily",
  "6": "bgm_6f_daily",
  "7": "bgm_7f_daily",
};

export const VALID_BGM_KEYS = new Set<string>([
  ...Object.keys(BGM_TRACKS),
  ...Object.keys(LEGACY_BGM_TRACK_ALIASES),
]);

export function resolveBgmTrackKey(key: string | null | undefined): BgmTrackKey {
  if (key && Object.hasOwn(BGM_TRACKS, key)) return key as BgmTrackKey;
  if (key && Object.hasOwn(LEGACY_BGM_TRACK_ALIASES, key)) {
    return LEGACY_BGM_TRACK_ALIASES[key as keyof typeof LEGACY_BGM_TRACK_ALIASES];
  }
  return DEFAULT_BGM;
}

export function isValidBgmTrack(key: string): boolean {
  return VALID_BGM_KEYS.has(key);
}

export function getBgmSrc(track: string | null | undefined): string {
  return BGM_TRACKS[resolveBgmTrackKey(track)];
}

export function getBgmMeta(track: string | null | undefined): BgmTrackMeta {
  return BGM_TRACK_META[resolveBgmTrackKey(track)];
}

export function inferFloorIdFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  if (location.startsWith("B2_")) return "B2";
  if (location.startsWith("B1_")) return "B1";
  const match = location.match(/^(\d)F_/);
  return match?.[1] ?? null;
}

export function getDailyBgmTrackForLocation(location: string | null | undefined): BgmTrackKey {
  const floorId = inferFloorIdFromLocation(location);
  return (floorId ? FLOOR_DAILY_BGM[floorId] : null) ?? DEFAULT_BGM;
}

export function isDailyBgmTrack(track: string | null | undefined): boolean {
  const resolved = resolveBgmTrackKey(track);
  return Object.values(FLOOR_DAILY_BGM).includes(resolved);
}

/** Call from user-gesture handlers to unlock browser autoplay policy. */
export function unlockBgmOnUserGesture(): void {
  try {
    resumeAudio();
  } catch {
    // ignore
  }
  try {
    const a = new Audio();
    a.volume = 0;
    a.src = BGM_TRACKS[DEFAULT_BGM];
    void a
      .play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
      })
      .catch(() => {});
  } catch {
    // ignore
  }
}
