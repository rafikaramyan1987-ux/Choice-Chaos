import type { ArtKey } from '../core/types';

/**
 * Simple vector illustrations drawn in code (no image files).
 * Each scene is 320×180 and shares a background + a central motif.
 */
const BG: Record<ArtKey, [string, string]> = {
  office: ['#cfe3ff', '#9ec1f5'], money: ['#d9f7d2', '#9fdc8f'], home: ['#ffe7c7', '#f7c78b'],
  neighbor: ['#e7dcff', '#bca7f5'], friends: ['#ffd9e6', '#f5a3c0'], heart: ['#ffd6d6', '#f59a9a'],
  family: ['#fff1c2', '#f5d36b'], travel: ['#c9f0ff', '#7fd0f0'], weird: ['#e0ffe9', '#8be0b0'],
  food: ['#ffe2cc', '#f5ab7a'], phone: ['#dfe4ff', '#a3aef5'], party: ['#fbd9ff', '#d99af0'],
  shop: ['#d6f5f0', '#86d6c8'], park: ['#dcf5c9', '#9ad47a'], pet: ['#fff0d9', '#f5c98f'],
  storm: ['#d3d9e6', '#8b97b3'],
};

const INK = '#2b2340';

function face(cx: number, cy: number, r: number, color: string, mood: 'happy' | 'shock' | 'meh' = 'happy'): string {
  const mouth =
    mood === 'happy'
      ? `<path d="M${cx - r * 0.4} ${cy + r * 0.2} Q${cx} ${cy + r * 0.6} ${cx + r * 0.4} ${cy + r * 0.2}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : mood === 'shock'
        ? `<ellipse cx="${cx}" cy="${cy + r * 0.35}" rx="${r * 0.18}" ry="${r * 0.24}" fill="${INK}"/>`
        : `<path d="M${cx - r * 0.35} ${cy + r * 0.35} H${cx + r * 0.35}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="${INK}" stroke-width="3"/>
<circle cx="${cx - r * 0.35}" cy="${cy - r * 0.15}" r="${r * 0.11}" fill="${INK}"/>
<circle cx="${cx + r * 0.35}" cy="${cy - r * 0.15}" r="${r * 0.11}" fill="${INK}"/>${mouth}`;
}

const MOTIF: Record<ArtKey, string> = {
  office: `<rect x="95" y="100" width="130" height="50" rx="6" fill="#8a6b4f" stroke="${INK}" stroke-width="3"/>
<rect x="120" y="55" width="80" height="50" rx="6" fill="#fff" stroke="${INK}" stroke-width="3"/>
<rect x="128" y="63" width="64" height="34" rx="3" fill="#7fb1ff"/>
<path d="M150 105 h20 v8 h-20z" fill="${INK}"/>${face(250, 80, 20, '#ffd7a8', 'shock')}
<rect x="40" y="70" width="40" height="70" rx="4" fill="#e6e6e6" stroke="${INK}" stroke-width="3"/>
<rect x="46" y="80" width="28" height="8" fill="#fff" stroke="${INK}" stroke-width="2"/>`,
  money: `<ellipse cx="160" cy="140" rx="70" ry="14" fill="#e3b93c" stroke="${INK}" stroke-width="3"/>
<ellipse cx="160" cy="128" rx="60" ry="12" fill="#f5cf4a" stroke="${INK}" stroke-width="3"/>
<ellipse cx="160" cy="116" rx="50" ry="10" fill="#ffe066" stroke="${INK}" stroke-width="3"/>
<circle cx="160" cy="70" r="30" fill="#ffe066" stroke="${INK}" stroke-width="3"/>
<text x="160" y="82" font-size="34" font-weight="900" text-anchor="middle" fill="${INK}" font-family="system-ui,sans-serif">$</text>
<path d="M90 50 l6 10 M230 45 l-6 12 M240 90 l10 2" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  home: `<rect x="100" y="80" width="120" height="75" fill="#fff6e6" stroke="${INK}" stroke-width="3"/>
<path d="M88 84 L160 30 L232 84 Z" fill="#e85d5d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<rect x="145" y="110" width="30" height="45" fill="#8a6b4f" stroke="${INK}" stroke-width="3"/>
<rect x="112" y="95" width="24" height="22" fill="#7fd0f0" stroke="${INK}" stroke-width="3"/>
<rect x="184" y="95" width="24" height="22" fill="#7fd0f0" stroke="${INK}" stroke-width="3"/>
<rect x="190" y="40" width="14" height="26" fill="#b5523b" stroke="${INK}" stroke-width="3"/>`,
  neighbor: `<rect x="40" y="60" width="90" height="95" fill="#fff" stroke="${INK}" stroke-width="3"/>
<rect x="190" y="60" width="90" height="95" fill="#fff" stroke="${INK}" stroke-width="3"/>
<rect x="70" y="105" width="30" height="50" fill="#5d8ae8" stroke="${INK}" stroke-width="3"/>
<rect x="220" y="105" width="30" height="50" fill="#e8a05d" stroke="${INK}" stroke-width="3"/>
<path d="M140 150 h40 M145 140 h30 M150 130 h20" stroke="${INK}" stroke-width="3"/>
${face(85, 82, 14, '#ffd7a8', 'meh')}${face(235, 82, 14, '#c99a6b', 'shock')}`,
  friends: `${face(110, 95, 30, '#ffd7a8')}${face(160, 85, 32, '#c99a6b')}${face(212, 95, 30, '#f2c79b', 'shock')}
<path d="M80 160 Q110 125 140 160 M128 165 Q160 120 192 165 M182 160 Q212 125 242 160" fill="#7f8cf0" stroke="${INK}" stroke-width="3"/>`,
  heart: `<path d="M160 150 C 60 90, 100 25, 160 65 C 220 25, 260 90, 160 150 Z" fill="#ff5c7a" stroke="${INK}" stroke-width="3"/>
<path d="M120 70 q8 -12 22 -8" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M70 50 l10 10 M250 50 l-10 10 M60 110 h12 M248 110 h12" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  family: `<rect x="60" y="120" width="200" height="14" rx="4" fill="#8a6b4f" stroke="${INK}" stroke-width="3"/>
${face(95, 85, 22, '#ffd7a8')}${face(145, 80, 26, '#c99a6b', 'meh')}${face(195, 92, 16, '#f2c79b', 'shock')}${face(235, 86, 20, '#e8b98a')}
<ellipse cx="160" cy="116" rx="26" ry="8" fill="#fff" stroke="${INK}" stroke-width="3"/>`,
  travel: `<path d="M60 110 L240 70 L262 78 L250 92 L90 128 Z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M150 90 L120 50 L140 48 L185 85 Z" fill="#e85d5d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M140 115 L120 150 L138 148 L170 108 Z" fill="#e85d5d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="200" cy="85" r="4" fill="${INK}"/><circle cx="215" cy="81" r="4" fill="${INK}"/><circle cx="185" cy="89" r="4" fill="${INK}"/>
<path d="M30 150 q20 -10 40 0 t40 0" stroke="#fff" stroke-width="4" fill="none"/>`,
  weird: `<ellipse cx="160" cy="80" rx="80" ry="22" fill="#b3b8c9" stroke="${INK}" stroke-width="3"/>
<path d="M120 72 Q160 20 200 72 Z" fill="#9be8ff" stroke="${INK}" stroke-width="3"/>
${face(160, 58, 12, '#7be08f', 'shock')}
<path d="M120 102 L95 160 H225 L200 102 Z" fill="#fff59b" opacity="0.7"/>
<circle cx="110" cy="82" r="5" fill="#ffe066"/><circle cx="160" cy="88" r="5" fill="#ffe066"/><circle cx="210" cy="82" r="5" fill="#ffe066"/>`,
  food: `<ellipse cx="160" cy="130" rx="95" ry="22" fill="#fff" stroke="${INK}" stroke-width="3"/>
<path d="M95 125 Q160 40 225 125 Z" fill="#f5a35d" stroke="${INK}" stroke-width="3"/>
<circle cx="140" cy="100" r="7" fill="#e85d5d"/><circle cx="175" cy="92" r="7" fill="#7be08f"/><circle cx="190" cy="112" r="7" fill="#e85d5d"/>
<path d="M140 50 q6 -10 0 -20 M160 46 q6 -10 0 -20 M180 50 q6 -10 0 -20" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  phone: `<rect x="122" y="22" width="76" height="140" rx="14" fill="${INK}"/>
<rect x="130" y="36" width="60" height="110" rx="6" fill="#fff"/>
<rect x="138" y="46" width="40" height="14" rx="7" fill="#7f8cf0"/><rect x="148" y="68" width="34" height="14" rx="7" fill="#ffd166"/>
<rect x="138" y="90" width="44" height="14" rx="7" fill="#7f8cf0"/>
<circle cx="230" cy="50" r="16" fill="#ff5c7a" stroke="${INK}" stroke-width="3"/>
<text x="230" y="57" font-size="20" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">!</text>`,
  party: `${face(160, 100, 34, '#ffd7a8')}
<path d="M138 72 L160 18 L182 72 Z" fill="#ffd166" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="160" cy="18" r="6" fill="#ff5c7a" stroke="${INK}" stroke-width="2"/>
<rect x="60" y="40" width="8" height="8" fill="#ff5c7a" transform="rotate(20 64 44)"/><rect x="250" y="60" width="8" height="8" fill="#7f8cf0" transform="rotate(-20 254 64)"/>
<rect x="90" y="120" width="8" height="8" fill="#7be08f"/><rect x="230" y="130" width="8" height="8" fill="#ffd166"/>
<circle cx="70" cy="90" r="16" fill="#7f8cf0" stroke="${INK}" stroke-width="3"/><path d="M70 106 v40" stroke="${INK}" stroke-width="2"/>
<circle cx="250" cy="100" r="16" fill="#ff5c7a" stroke="${INK}" stroke-width="3"/><path d="M250 116 v40" stroke="${INK}" stroke-width="2"/>`,
  shop: `<path d="M80 80 h170 l-20 55 h-125 z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M60 60 h25 l10 20" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
<circle cx="115" cy="150" r="10" fill="${INK}"/><circle cx="215" cy="150" r="10" fill="${INK}"/>
<rect x="110" y="55" width="30" height="35" fill="#ff5c7a" stroke="${INK}" stroke-width="3"/>
<rect x="148" y="45" width="34" height="45" fill="#ffd166" stroke="${INK}" stroke-width="3"/>
<circle cx="205" cy="70" r="18" fill="#7be08f" stroke="${INK}" stroke-width="3"/>`,
  park: `<rect x="148" y="90" width="20" height="65" fill="#8a6b4f" stroke="${INK}" stroke-width="3"/>
<circle cx="158" cy="65" r="45" fill="#5cbf5c" stroke="${INK}" stroke-width="3"/>
<rect x="40" y="125" width="70" height="8" fill="#8a6b4f" stroke="${INK}" stroke-width="3"/>
<path d="M48 133 v20 M102 133 v20" stroke="${INK}" stroke-width="3"/>
<circle cx="260" cy="40" r="20" fill="#ffd166" stroke="${INK}" stroke-width="3"/>
<ellipse cx="235" cy="145" rx="18" ry="10" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="252" cy="137" r="6" fill="#fff" stroke="${INK}" stroke-width="3"/>`,
  pet: `<ellipse cx="160" cy="125" rx="55" ry="35" fill="#f5a35d" stroke="${INK}" stroke-width="3"/>
<circle cx="160" cy="80" r="35" fill="#f5a35d" stroke="${INK}" stroke-width="3"/>
<path d="M132 58 L128 25 L152 48 Z M188 58 L192 25 L168 48 Z" fill="#f5a35d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="146" cy="78" r="5" fill="${INK}"/><circle cx="174" cy="78" r="5" fill="${INK}"/>
<path d="M154 92 l6 5 l6 -5" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M120 90 h-25 M120 96 h-22 M200 90 h25 M200 96 h22" stroke="${INK}" stroke-width="2"/>
<path d="M215 130 q35 -10 25 -45" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/>
<path d="M215 130 q35 -10 25 -45" stroke="#f5a35d" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  storm: `<path d="M90 80 a30 30 0 0 1 40 -30 a38 38 0 0 1 70 5 a28 28 0 0 1 20 50 h-120 a25 25 0 0 1 -10 -25z" fill="#eef0f5" stroke="${INK}" stroke-width="3"/>
<path d="M165 105 L145 140 H162 L150 172 L190 128 H172 L185 105 Z" fill="#ffd166" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M100 120 l-6 14 M120 125 l-6 14 M210 120 l-6 14 M230 115 l-6 14" stroke="#5d8ae8" stroke-width="4" stroke-linecap="round"/>`,
};

export function artSvg(key: ArtKey, label = ''): string {
  const [top, bottom] = BG[key] ?? BG.weird;
  const id = `g-${key}`;
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" focusable="false">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<rect width="320" height="180" fill="url(#${id})"/>
<circle cx="30" cy="30" r="40" fill="#fff" opacity="0.25"/><circle cx="300" cy="160" r="50" fill="#fff" opacity="0.18"/>
${MOTIF[key] ?? MOTIF.weird}
</svg>`;
}

/** Original "Choice Chaos" logo: two diverging arrows over a tilted wordmark. */
export function logoSvg(): string {
  return `<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Choice Chaos">
<g stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
<path d="M180 120 L180 80 Q180 50 130 35" fill="none" stroke="#ff5c7a" stroke-width="12"/>
<path d="M180 80 Q180 50 230 35" fill="none" stroke="#7f8cf0" stroke-width="12"/>
<path d="M118 22 L140 26 L128 46 Z" fill="#ff5c7a"/>
<path d="M242 22 L220 26 L232 46 Z" fill="#7f8cf0"/>
</g>
<g transform="rotate(-4 180 150)" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-weight="900" text-anchor="middle">
<text x="183" y="153" font-size="54" fill="${INK}">CHOICE</text>
<text x="180" y="150" font-size="54" fill="#ffd166" stroke="${INK}" stroke-width="2">CHOICE</text>
<text x="183" y="197" font-size="46" fill="${INK}">CHAOS</text>
<text x="180" y="194" font-size="46" fill="#ff5c7a" stroke="${INK}" stroke-width="2">CHAOS</text>
</g>
<circle cx="70" cy="120" r="7" fill="#7be08f"/><circle cx="300" cy="110" r="6" fill="#ffd166"/><circle cx="320" cy="60" r="4" fill="#ff5c7a"/><circle cx="40" cy="70" r="5" fill="#7f8cf0"/>
</svg>`;
}
