/** Dev-only logging — silent in release bundles. */
export function dlog(...args: unknown[]): void {
  if (__DEV__) console.log(...args);
}
