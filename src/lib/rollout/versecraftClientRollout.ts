/**
 * 浏览器端可读的灰度（需 `NEXT_PUBLIC_` 前缀注入构建）。
 * 与 `versecraftRolloutFlags.ts` 服务器开关语义对齐；未设时默认与主线路径一致（true）。
 */

function readPublicBoolean(envName: string, defaultTrue: boolean): boolean {
  if (typeof process === "undefined") return defaultTrue;
  const v = process.env[envName];
  if (v === undefined) return defaultTrue;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "off") return false;
  return true;
}

function readPublicBooleanFirst(envNames: readonly string[], defaultTrue: boolean): boolean {
  if (typeof process === "undefined") return defaultTrue;
  for (const n of envNames) {
    const v = process.env[n];
    if (v === undefined) continue;
    const s = String(v).trim().toLowerCase();
    if (s === "false" || s === "0" || s === "off") return false;
    return true;
  }
  return defaultTrue;
}

/** 与 VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V3 对齐；客户端用 NEXT_PUBLIC_ 镜像（兼容旧 V2 名） */
export function getClientTaskVisibilityPolicyV3Enabled(): boolean {
  return readPublicBooleanFirst(
    ["NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V3", "NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2"],
    true
  );
}

export function getClientOptionsAutoRegenOnEmptyEnabled(): boolean {
  return readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_AUTO_REGEN_ON_EMPTY", true);
}

export function getClientOptionsOnlyRegenPathV2Enabled(): boolean {
  return readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_ONLY_REGEN_PATH_V2", true);
}

export function getClientSettingsTaskRemovalEnabled(): boolean {
  return readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_SETTINGS_TASK_REMOVAL", true);
}

export function getClientPlayerFacingTaskCopyV2Enabled(): boolean {
  return readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_PLAYER_FACING_TASK_COPY_V2", true);
}

/** Phase6: show low-disruption continue button on narrative-only turns */
export function getClientContinueButtonEnabled(): boolean {
  return readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_CONTINUE_BUTTON", true);
}

/** 隐藏战力系统 V1（客户端：codex 展示等；默认关闭） */
export function getClientHiddenCombatV1Enabled(): boolean {
  return readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_HIDDEN_COMBAT_V1", false);
}

export function getVerseCraftClientRolloutFlags(): {
  enableWeaponLifecycleV1: boolean;
  enableWeaponizationPreview: boolean;
} {
  return {
    enableWeaponLifecycleV1: readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_WEAPON_LIFECYCLE_V1", true),
    enableWeaponizationPreview: readPublicBoolean("NEXT_PUBLIC_VERSECRAFT_ENABLE_WEAPONIZATION_PREVIEW", true),
  };
}
