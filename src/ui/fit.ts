/**
 * Landscape screens (desktop iframes such as 907×510, 1366×768 or 1920×1080 fullscreen) use a
 * two-column layout designed for a virtual 800×450 screen; on bigger screens it is scaled up
 * uniformly with CSS zoom so it fills the space instead of stretching. Portrait is not scaled.
 */
export const DESIGN_W = 800;
export const DESIGN_H = 450;

export function zoomFor(w: number, h: number): number {
  if (h <= 0 || w / h < 1.25) return 1;
  return Math.max(1, Math.min(h / DESIGN_H, w / DESIGN_W));
}

let current = 1;

/** Current zoom of the app (to convert screen pixels to CSS pixels inside it). */
export function appZoom(): number {
  return current;
}

export function fitToScreen(app: HTMLElement): void {
  const apply = () => {
    const z = zoomFor(window.innerWidth, window.innerHeight);
    current = z > 1.01 ? z : 1;
    app.style.zoom = current > 1 ? String(current) : '';
    const root = document.documentElement.style;
    root.setProperty('--zoom', String(current));
    root.setProperty('--vh', current > 1 ? `${window.innerHeight / current / 100}px` : '1dvh');
  };
  apply();
  window.addEventListener('resize', apply);
}
