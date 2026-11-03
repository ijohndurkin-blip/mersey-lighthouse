export type QualityLevel = 'low' | 'medium' | 'high';

export const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

export function detectQuality(): QualityLevel {
  try {
    const saved = localStorage.getItem('mm.quality');
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch {
    /* storage unavailable */
  }
  const url = new URL(location.href);
  const q = url.searchParams.get('quality');
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  let renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = String((gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL));
    }
  } catch {
    /* ignore */
  }
  if (/swiftshader|llvmpipe|software/i.test(renderer)) return 'low';
  const mem = (navigator as any).deviceMemory as number | undefined;
  if (isTouchDevice()) {
    if (mem !== undefined && mem <= 3) return 'low';
    return 'medium';
  }
  if (mem !== undefined && mem <= 4) return 'medium';
  return 'high';
}

export function saveQuality(q: QualityLevel) {
  try {
    localStorage.setItem('mm.quality', q);
  } catch {
    /* ignore */
  }
}

export const QualitySettings: Record<QualityLevel, { scaling: number; terrainCell: number; grass: number; post: boolean; msaa: number; bloom: boolean }> = {
  low: { scaling: 0.75, terrainCell: 2.0, grass: 0.35, post: false, msaa: 1, bloom: false },
  medium: { scaling: 1.0, terrainCell: 1.5, grass: 0.7, post: true, msaa: 1, bloom: true },
  high: { scaling: 1.5, terrainCell: 1.5, grass: 1, post: true, msaa: 4, bloom: true },
};
