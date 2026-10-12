// Usage: node assets/banner.mjs assets  — then render social-preview.svg to PNG 1280x640 for GitHub Settings → Social preview.
// Generates assets/keystone-{dark,light}.svg (README banner 1200x300) and assets/social-preview.svg (1280x640).
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const T = {
  dark:  { bg1: '#0b1020', bg2: '#151b2e', stone: '#2a3350', edge: '#3b4668', key: '#f5b83d', keyEdge: '#ffd47a', title: '#f3f5fb', sub: '#a7b0c8', chip: '#1d2540', chipText: '#d6dcef', arrow: '#5b678c', accent: '#f5b83d' },
  light: { bg1: '#f7f8fc', bg2: '#eceff7', stone: '#d5dbea', edge: '#b9c2d8', key: '#e09a12', keyEdge: '#b97a00', title: '#141a2e', sub: '#4d5878', chip: '#ffffff', chipText: '#26304d', arrow: '#9aa4bf', accent: '#c98500' },
};
function arch(cx, cy, r1, r2, n, c) {
  let s = '';
  const gap = 0.018;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - (i / n) * Math.PI - gap / 2, a1 = Math.PI - ((i + 1) / n) * Math.PI + gap / 2;
    const isKey = i === (n - 1) / 2;
    const ro = isKey ? r2 + (r2 - r1) * 0.18 : r2, ri = isKey ? r1 - (r2 - r1) * 0.08 : r1;
    const p = [[a0, ri], [a0, ro], [a1, ro], [a1, ri]].map(([a, r]) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`);
    s += `<polygon points="${p.join(' ')}" fill="${isKey ? c.key : c.stone}" stroke="${isKey ? c.keyEdge : c.edge}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  return s;
}
const font = `font-family="'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif"`;
const mono = `font-family="'JetBrains Mono', 'Cascadia Code', Consolas, 'SFMono-Regular', monospace"`;
function chipsWidth(size, gapX) {
  const steps = ['grill', 'intent', 'plan', 'check', 'implement', 'verify'];
  return steps.reduce((s, t) => s + t.length * size * 0.62 + size * 1.4, 0) + gapX * (steps.length - 1);
}
function chips(x, y, c, size, gapX) {
  const steps = ['grill', 'intent', 'plan', 'check', 'implement', 'verify'];
  let s = '', cur = x;
  steps.forEach((t, i) => {
    const w = t.length * size * 0.62 + size * 1.4, h = size * 1.9;
    const first = t === 'intent'; // the keystone of the chain
    s += `<rect x="${cur}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${first ? c.key : c.chip}" stroke="${first ? c.keyEdge : c.edge}" stroke-width="1.5"/>`;
    s += `<text x="${cur + w / 2}" y="${y + size * 0.36}" text-anchor="middle" ${mono} font-size="${size}" fill="${first ? '#1a1300' : c.chipText}" font-weight="${first ? 700 : 500}">${t}</text>`;
    cur += w;
    if (i < steps.length - 1) { s += `<text x="${cur + gapX / 2}" y="${y + size * 0.36}" text-anchor="middle" ${font} font-size="${size}" fill="${c.arrow}">→</text>`; cur += gapX; }
  });
  return s;
}
function banner(c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300" role="img" aria-label="Keystone — intent-first workflow for Claude Code">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient></defs>
<rect width="1200" height="300" rx="18" fill="url(#g)"/>
${arch(170, 236, 78, 128, 9, c)}
<line x1="30" y1="238" x2="310" y2="238" stroke="${c.edge}" stroke-width="2"/>
<text x="360" y="128" ${font} font-size="76" font-weight="800" fill="${c.title}" letter-spacing="-1">Keystone</text>
<text x="364" y="172" ${font} font-size="26" fill="${c.sub}">Intent-first workflow for <tspan fill="${c.accent}" font-weight="600">Claude Code</tspan></text>
${chips(364, 232, c, 17, 26)}
</svg>`;
}
function social(c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" aria-label="Keystone — intent-first workflow for Claude Code">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient></defs>
<rect width="1280" height="640" fill="url(#g)"/>
${arch(640, 300, 120, 200, 9, c)}
<line x1="380" y1="302" x2="900" y2="302" stroke="${c.edge}" stroke-width="2"/>
<text x="640" y="418" text-anchor="middle" ${font} font-size="92" font-weight="800" fill="${c.title}" letter-spacing="-1">Keystone</text>
<text x="640" y="470" text-anchor="middle" ${font} font-size="32" fill="${c.sub}">Intent-first workflow for <tspan fill="${c.accent}" font-weight="600">Claude Code</tspan></text>
${chips((1280 - chipsWidth(22, 34)) / 2, 550, c, 22, 34)}
</svg>`;
}
writeFileSync(`${out}/keystone-dark.svg`, banner(T.dark));
writeFileSync(`${out}/keystone-light.svg`, banner(T.light));
writeFileSync(`${out}/social-preview.svg`, social(T.dark));
