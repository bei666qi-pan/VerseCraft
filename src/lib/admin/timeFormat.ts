import { formatDurationSeconds } from "@/lib/time/durationUnits";

/** Card-style H:M from **seconds** (same unit contract as `formatDurationSeconds`). */
export function formatDurationHoursMinutes(totalSeconds: number): string {
  return formatDurationSeconds(totalSeconds, { style: "h_m" });
}
