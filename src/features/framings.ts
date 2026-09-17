/**
 * Framing presets — plan/plan14.md.
 * Social-platform framings are aspects, not resolutions: the sensor always
 * captures at maximum quality and the shot is center-cropped to the framing,
 * so quality is never thrown away. The viewfinder masks itself to the same
 * aspect for WYSIWYG framing.
 */
export type Framing = {
  id: string;
  name: string;
  /** Target aspect (w/h). null = native sensor aspect (4:3), no crop. */
  aspect: number | null;
  /** Optional long-edge cap applied after the crop (smaller files for feeds). */
  maxLongEdge?: number;
  note: string;
};

export const FRAMINGS: Framing[] = [
  { id: 'full', name: 'Full', aspect: null, note: 'Native · 4:3' },
  { id: 'instagram', name: 'Instagram', aspect: 4 / 5, note: 'Post · 4:5' },
  { id: 'square', name: 'Square', aspect: 1, note: 'Feed · 1:1' },
  { id: 'story', name: 'Story', aspect: 9 / 16, note: 'Story · 9:16' },
  {
    id: 'wechat',
    name: 'WeChat',
    aspect: 4 / 3,
    maxLongEdge: 2560,
    note: 'Moments · 4:3',
  },
  { id: 'wide', name: 'Wide', aspect: 16 / 9, note: 'Cinema · 16:9' },
];

export const getFraming = (id: string): Framing =>
  FRAMINGS.find((f) => f.id === id) ?? FRAMINGS[0];

/** Preview is portrait-oriented; null remains the capture's no-crop sentinel. */
export function previewAspect(mode: 'photo' | 'video', photoAspect: number | null): number {
  return mode === 'video' ? 9 / 16 : photoAspect ?? 3 / 4;
}

/** Largest centered rect with this aspect that fits inside maxW × maxH.
 * Null means no crop here too; preview callers must resolve previewAspect first.
 */
export function frameRect(
  aspect: number | null,
  maxW: number,
  maxH: number,
): { x: number; y: number; w: number; h: number } {
  if (!aspect || maxW <= 0 || maxH <= 0) {
    return { x: 0, y: 0, w: maxW, h: maxH };
  }
  let w = maxW;
  let h = maxW / aspect;
  if (h > maxH) {
    h = maxH;
    w = maxH * aspect;
  }
  return { x: (maxW - w) / 2, y: (maxH - h) / 2, w, h };
}

/** Pixel dimensions of a center crop at this aspect, from a source W×H. */
export function cropDims(
  aspect: number | null,
  maxW: number,
  maxH: number,
  maxLongEdge?: number,
): { w: number; h: number } {
  let { w, h } = cropDimsRaw(aspect, maxW, maxH);
  if (maxLongEdge && Math.max(w, h) > maxLongEdge) {
    const k = maxLongEdge / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { w, h };
}

function cropDimsRaw(aspect: number | null, maxW: number, maxH: number) {
  const r = frameRect(aspect, maxW, maxH);
  return { w: r.w, h: r.h };
}
