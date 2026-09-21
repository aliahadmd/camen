/** Pure UI/camera contracts. Keep these independent of React and native modules. */
export type ZoomRange = { zoomMinRatio: number; zoomMaxRatio: number };
export type ZoomRanges = { back: ZoomRange; front: ZoomRange };

/** Curated K80 Pro ranges, not runtime capability discovery. */
export const K80_ZOOM_RANGES: ZoomRanges = {
  back: { zoomMinRatio: 0.6, zoomMaxRatio: 10 },
  front: { zoomMinRatio: 1, zoomMaxRatio: 10 },
};

export function zoomRangeForFacing(
  profile: { zoomRanges: ZoomRanges },
  facing: 'front' | 'back',
): ZoomRange {
  return profile.zoomRanges[facing];
}

export function clampRatio(range: ZoomRange, ratio: number): number {
  'worklet';
  return Math.min(range.zoomMaxRatio, Math.max(range.zoomMinRatio, ratio));
}

/** Matches the patched native camera's active-lens min/max interpolation. */
export function ratioToNormalized(range: ZoomRange, ratio: number): number {
  const span = range.zoomMaxRatio - range.zoomMinRatio;
  return span > 0 ? (clampRatio(range, ratio) - range.zoomMinRatio) / span : 0;
}

export function normalizedToRatio(range: ZoomRange, normalized: number): number {
  return range.zoomMinRatio + Math.min(1, Math.max(0, normalized)) *
    (range.zoomMaxRatio - range.zoomMinRatio);
}

/** Both inputs are milliseconds. The mounted active ring never displays zero. */
export function countdownDisplay(remainingMs: number, totalMs: number) {
  return {
    seconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    progress: totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0,
  };
}

/** Tick cells are centered: subtract half a cell from each edge's padding. */
export function rulerPadding(viewportWidth: number, stepPx: number): number {
  return Math.max(0, (viewportWidth - stepPx) / 2);
}

export function rulerIndex(offset: number, stepPx: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.round(offset / stepPx)));
}

export function rulerOffset(value: number, min: number, step: number, stepPx: number, count: number): number {
  return rulerIndex((value - min) / step * stepPx, stepPx, count) * stepPx;
}

export function permissionAction(canAskAgain: boolean): 'request' | 'settings' {
  return canAskAgain ? 'request' : 'settings';
}
