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
// drone 是否处于「激活」状态（仅 /play 恐怖氛围期间为 true）。
// 用它把低频 drone 严格限制在 /play，避免其作为全局单例泄漏到首页/序章。
let droneActive = false;

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
  // 不在此处启动低频 drone —— drone 只属于 /play 恐怖氛围，由 startAmbientDrone()
  // 显式启停。首页/序章调用 resumeAudio() 仅用于解锁自动播放策略，绝不能连带触发
  // 那个 55Hz 的「耳鸣心跳」嗡鸣（此前正是它泄漏到首页，表现为难听的低沉声）。
  if (droneActive) {
    // 已处于 /play 激活态时（例如取消静音重新 resume），恢复 drone 增益
    startAmbientDrone();
  }
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

function ensureDroneNodes(): void {
  if (droneStarted) return;
  const c = getCtx();

  droneFilter = c.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 800;
  droneFilter.Q.value = 1;

  droneGain = c.createGain();
  droneGain.gain.value = 0; // 起始静音，由 startAmbientDrone() 淡入

  droneOsc = c.createOscillator();
  droneOsc.type = "sine";
  droneOsc.frequency.value = 55;

  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(getMaster());
  droneOsc.start();
  droneStarted = true;
}

/**
 * 启动 /play 恐怖氛围低频 drone（幂等）。**仅应在 /play 内调用。**
 * 首页/序章不调用它，因此不会再出现泄漏到首页的低沉嗡鸣。静音时只创建节点、
 * 保持静默，待取消静音后由 updateSanityFilter 恢复增益。
 */
export function startAmbientDrone(): void {
  ensureDroneNodes();
  droneActive = true;
  if (!muted && droneGain) {
    droneGain.gain.setTargetAtTime(0.12, getCtx().currentTime, 0.6);
  }
}

/** 离开 /play 时淡出 drone，避免其作为全局单例继续在首页/序章作响。 */
export function stopAmbientDrone(): void {
  droneActive = false;
  if (droneGain) {
    droneGain.gain.setTargetAtTime(0, getCtx().currentTime, 0.4);
  }
}

// --------------- Sanity-reactive filter ---------------

export function updateSanityFilter(sanity: number): void {
  if (!droneActive || !droneFilter || !droneGain || !droneOsc) return;
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
  if (!droneActive || !droneOsc) return;
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
