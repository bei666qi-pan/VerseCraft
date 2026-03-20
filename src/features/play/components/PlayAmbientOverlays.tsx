"use client";

import type { EchoTalent } from "@/store/useGameStore";
import { TALENT_EFFECT_STYLE } from "../playConstants";

/** Full-screen ambient layers (non-modal): moon, apocalypse, intrusion, sanity hit, talent vignette. */
export function PlayAmbientOverlays({
  showDarkMoonOverlay,
  showApocalypseOverlay,
  showIntrusionFlash,
  hitEffectActive,
  talentEffectType,
}: {
  showDarkMoonOverlay: boolean;
  showApocalypseOverlay: boolean;
  showIntrusionFlash: boolean;
  hitEffectActive: boolean;
  talentEffectType: EchoTalent | null;
}) {
  return (
    <>
      {showDarkMoonOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-700"
          aria-hidden
        >
          <p className="animate-pulse text-3xl font-bold tracking-widest text-red-600 md:text-5xl">
            暗月已至
          </p>
        </div>
      )}

      {showApocalypseOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-1000"
          aria-hidden
        >
          <p className="animate-pulse text-center text-xl font-bold tracking-widest text-white md:text-3xl">
            十日已至，一切终焉。
          </p>
        </div>
      )}

      {showIntrusionFlash && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] animate-pulse border-[6px] border-red-600/40 shadow-[inset_0_0_60px_rgba(220,38,38,0.15)]"
          aria-hidden
        />
      )}

      {hitEffectActive && (
        <div className="pointer-events-none fixed inset-0 z-[55]" aria-hidden>
          <div
            className="absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 35%, rgba(160,0,0,0.2) 65%, rgba(220,38,38,0.45) 100%)",
              boxShadow: "inset 0 0 100px 30px rgba(220,38,38,0.3)",
            }}
          />
        </div>
      )}

      {talentEffectType && (() => {
        const style = TALENT_EFFECT_STYLE[talentEffectType];
        if (!style) return null;
        return (
          <div className="pointer-events-none fixed inset-0 z-[54]" aria-hidden>
            <div
              className="absolute inset-0"
              style={{
                background: style.bg,
                animation: style.anim,
              }}
            />
          </div>
        );
      })()}
    </>
  );
}