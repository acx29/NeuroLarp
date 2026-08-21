//**
// lib/utils.ts
// Small shared helpers: relative time, topic hue rotation, oklch color
//**
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
}

export function noteCountLabel(n: number): string {
  return `${n} ${n === 1 ? "note" : "notes"}`;
}

/** Rotating hue for new topics per the handoff: oklch(0.62 0.13 H). */
export function nextHue(existingHues: number[]): number {
  const i = existingHues.length;
  return (250 + i * 47) % 360;
}

export function topicColor(hue: number): string {
  // Dynamic Programming's yellow band needs higher lightness (mock uses 0.7 at hue 80)
  const l = hue >= 60 && hue <= 100 ? 0.7 : 0.62;
  return `oklch(${l} 0.13 ${hue})`;
}
