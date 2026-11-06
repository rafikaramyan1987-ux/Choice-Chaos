type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper: h('button.primary#play', { onclick }, 'Play'). */
export function h<K extends keyof HTMLElementTagNameMap>(sel: string, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel);
  const tag = (m?.[1] || 'div') as K;
  const el = document.createElement(tag);
  for (const part of m?.[2]?.match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [k, val] of Object.entries(attrs)) {
    if (val === undefined || val === false) continue;
    if (typeof val === 'function') el.addEventListener(k.replace(/^on/, ''), val as EventListener);
    else if (k === 'html') el.innerHTML = String(val);
    else if (val === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(val));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.firstChild.remove();
}
