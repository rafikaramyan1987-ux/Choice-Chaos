export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(sel);
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Measures active time only (time with the tab hidden is not counted). */
export class Stopwatch {
  private startAt = 0;
  private hiddenAt: number | null = null;
  private hiddenTotal = 0;
  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hiddenAt = performance.now();
      else if (this.hiddenAt !== null) {
        this.hiddenTotal += performance.now() - this.hiddenAt;
        this.hiddenAt = null;
      }
    });
  }
  start(): void {
    this.startAt = performance.now();
    this.hiddenTotal = 0;
    this.hiddenAt = document.hidden ? this.startAt : null;
  }
  elapsed(): number {
    const now = performance.now();
    const hidden = this.hiddenTotal + (this.hiddenAt !== null ? now - this.hiddenAt : 0);
    return Math.max(0, now - this.startAt - hidden);
  }
}
