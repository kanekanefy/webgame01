export function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
