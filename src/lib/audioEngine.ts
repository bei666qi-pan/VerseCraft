// src/lib/audioEngine.ts
// Web Audio API singleton engine for VerseCraft dynamic horror soundscapes.
// Runs outside React render cycle to avoid concurrent-mode memory leaks.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let droneOsc: OscillatorNode | null = null;
let droneGain: GainNode | null = null;
let droneFilter: BiquadFilterNode | null = null;
let muted = false;
let droneStarted = false;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

/** Must be called from a user-gesture handler (click) to satisfy autoplay policy. */
export function resumeAudio(): void {
  const c = getCtx();
  if (c.state === "suspended") {
    void c.resume();
  }
  muted = false;
  startDrone();
}

export function toggleMute(): boolean {
  if (muted) {
    resumeAudio();
    return false;
  }
  muted = true;
  if (droneGain) {
    droneGain.gain.setTargetAtTime(0, getCtx().currentTime, 0.3);
  }
  return true;
}

export function isMuted(): boolean {
  return muted;
}

/** Set master volume 0–100. Applied when not muted. */
export function setMasterVolume(percent: number): void {
  const p = Math.max(0, Math.min(100, percent));
  const gain = getMaster();
  gain.gain.setTargetAtTime((p / 100) * 0.5, getCtx().currentTime, 0.05);
}

// --------------- Persistent low-frequency drone (heartbeat / tinnitus) ---------------

function startDrone(): void {
  if (droneStarted || muted) return;
  const c = getCtx();

  droneFilter = c.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 800;
  droneFilter.Q.value = 1;

  droneGain = c.createGain();
  droneGain.gain.value = 0.12;

  droneOsc = c.createOscillator();
  droneOsc.type = "sine";
  droneOsc.frequency.value = 55;

  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(getMaster());
  droneOsc.start();
  droneStarted = true;
}

// --------------- Sanity-reactive filter ---------------

export function updateSanityFilter(sanity: number): void {
  if (!droneFilter || !droneGain || !droneOsc) return;
  const c = getCtx();
  const t = c.currentTime;

  if (sanity < 20) {
    const ratio = Math.max(0, sanity) / 20;
    droneFilter.frequency.setTargetAtTime(200 + ratio * 600, t, 0.5);
    droneFilter.Q.setTargetAtTime(8 - ratio * 6, t, 0.5);
    droneGain.gain.setTargetAtTime(0.25 + (1 - ratio) * 0.15, t, 0.5);
    droneOsc.frequency.setTargetAtTime(40 + ratio * 15, t, 0.8);
  } else {
    droneFilter.frequency.setTargetAtTime(800, t, 0.5);
    droneFilter.Q.setTargetAtTime(1, t, 0.5);
    droneGain.gain.setTargetAtTime(0.12, t, 0.5);
    droneOsc.frequency.setTargetAtTime(55, t, 0.8);
  }
}

// --------------- Dark-moon pitch shift ---------------

export function setDarkMoonMode(active: boolean): void {
  if (!droneOsc) return;
  const c = getCtx();
  const t = c.currentTime;
  if (active) {
    droneOsc.frequency.setTargetAtTime(35, t, 1.5);
    if (droneGain) droneGain.gain.setTargetAtTime(0.2, t, 1.0);
  } else {
    droneOsc.frequency.setTargetAtTime(55, t, 1.5);
    if (droneGain) droneGain.gain.setTargetAtTime(0.12, t, 1.0);
  }
}

// --------------- UI micro-sounds ---------------

export function playUIHover(): void {
  if (muted) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 3200;
  g.gain.value = 0.04;
  g.gain.setTargetAtTime(0, c.currentTime, 0.03);
  osc.connect(g);
  g.connect(getMaster());
  osc.start();
  osc.stop(c.currentTime + 0.06);
}

export function playUIClick(): void {
  if (muted) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "triangle";
  osc.frequency.value = 1800;
  g.gain.value = 0.08;
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
  osc.connect(g);
  g.connect(getMaster());
  osc.start();
  osc.stop(c.currentTime + 0.12);
}
