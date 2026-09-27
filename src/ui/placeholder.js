/**
 * 仮画像。データの image が null のとき、IDから色を決めたSVGを作る。
 * 本番画像を用意したら、データの image にパスを書くだけで差し替わる。
 */
import { initialOf } from './format.js';

/** IDから色相を決める（FNV-1aハッシュ＋黄金角で、連番IDでも色が離れる） */
function hueOf(id) {
  let h = 0x811c9dc5;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return Math.round((h * 137.508) % 360);
}

export function placeholderSvg(id, name, kind) {
  const hue = hueOf(id);
  const bg = `hsl(${hue} 32% 34%)`;
  const fg = `hsl(${hue} 45% 72%)`;
  const shape =
    kind === 'character'
      ? `<circle cx="60" cy="46" r="20" fill="${fg}" opacity=".55"/><path d="M22 112c4-26 20-40 38-40s34 14 38 40z" fill="${fg}" opacity=".55"/>`
      : `<path d="M20 96c0-34 16-62 40-62s40 28 40 62c0 10-8 12-20 12H40c-12 0-20-2-20-12z" fill="${fg}" opacity=".55"/><circle cx="48" cy="70" r="5" fill="${bg}"/><circle cx="72" cy="70" r="5" fill="${bg}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${bg}"/>${shape}<text x="60" y="104" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif" opacity=".9">${initialOf(name)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function unitImageSrc(def, kind) {
  return def.image ?? placeholderSvg(def.id, def.name, kind);
}
