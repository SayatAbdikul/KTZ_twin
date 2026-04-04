export function ema(prev: number, next: number, alpha: number): number {
  return alpha * next + (1 - alpha) * prev
}
