/** Dev-only logging — silent in release bundles. */
export function dlog(...args: unknown[]): void {
  if (__DEV__) console.log(...args);
}

/**
 * Release-visible logging — kept for field diagnosis of the save pipeline.
 * These run only on the capture path (a few lines per shot), never hot loops.
 */
export function rlog(...args: unknown[]): void {
  console.log('[camen:r]', ...args);
}
