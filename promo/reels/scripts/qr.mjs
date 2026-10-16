// QR codes for the site.
//   public/img/qr.png, out/qr-kid-phonics.png        plain
//   public/img/qr-cats.png, out/qr-kid-phonics-cats.png  胖胖＆菲菲 in the middle, round dots, coloured corners
// The cat version uses error correction H (up to ~30% of the code may be unreadable) and covers ~11% with the badge.
// Function patterns (finders, alignment, timing, format) stay solid squares; only data modules become dots.
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const URL = 'https://gagahsu.github.io/kid-phonics/';
const INK = '#1F2A44';
const CORNERS = ['#D9434A', '#2E9E62', '#2F80C8'];   // site red / green / blue, darkened so scanners still see "dark"
mkdirSync('out', { recursive: true });

const plain = { errorCorrectionLevel: 'M', margin: 2, width: 1024, color: { dark: INK, light: '#FFFFFF' } };
await QRCode.toFile('public/img/qr.png', URL, plain);
await QRCode.toFile('out/qr-kid-phonics.png', URL, plain);

const qr = QRCode.create(URL, { errorCorrectionLevel: 'H' });
const n = qr.modules.size, on = (r, c) => qr.modules.get(r, c), fixed = (r, c) => qr.modules.isReserved(r, c);
const cell = 20, quiet = 3, size = (n + quiet * 2) * cell;
const xy = v => (v + quiet) * cell;
const logo = n % 2 ? 11 : 12, l0 = (n - logo) / 2;          // cleared square in the middle, in modules
const inLogo = (r, c) => r >= l0 - 0.5 && r < l0 + logo + 0.5 && c >= l0 - 0.5 && c < l0 + logo + 0.5;
const finders = [[0, 0], [0, n - 7], [n - 7, 0]];
const inFinder = (r, c) => finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

let dots = '';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  if (!on(r, c) || inFinder(r, c) || inLogo(r, c)) continue;
  dots += fixed(r, c)
    ? `<rect x="${xy(c) + 1}" y="${xy(r) + 1}" width="${cell - 2}" height="${cell - 2}" rx="4"/>`
    : `<circle cx="${xy(c) + cell / 2}" cy="${xy(r) + cell / 2}" r="${cell * 0.44}"/>`;
}
const eye = ([r, c], color) => `
  <rect x="${xy(c)}" y="${xy(r)}" width="${7 * cell}" height="${7 * cell}" rx="${2.2 * cell}" fill="${color}"/>
  <rect x="${xy(c) + cell}" y="${xy(r) + cell}" width="${5 * cell}" height="${5 * cell}" rx="${1.5 * cell}" fill="#fff"/>
  <rect x="${xy(c) + 2 * cell}" y="${xy(r) + 2 * cell}" width="${3 * cell}" height="${3 * cell}" rx="${cell}" fill="${color}"/>`;
const png = f => 'data:image/png;base64,' + readFileSync(f).toString('base64');
const bx = xy(l0), bw = logo * cell, catW = bw * 0.47, catH = catW * 1070 / 840;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${cell * 2}" fill="#fff"/>
  <g fill="${INK}">${dots}</g>
  ${finders.map((f, i) => eye(f, CORNERS[i])).join('')}
  <rect x="${bx}" y="${bx}" width="${bw}" height="${bw}" rx="${cell * 2.5}" fill="#FFF6E5" stroke="#FFC93C" stroke-width="${cell * 0.35}"/>
  <image href="${png('public/img/r2/pang.png')}" x="${bx + bw * 0.03}" y="${bx + (bw - catH) / 2}" width="${catW}" height="${catH}"/>
  <image href="${png('public/img/fei.png')}" x="${bx + bw * 0.5}" y="${bx + (bw - catH) / 2}" width="${catW}" height="${catH}"/>
</svg>`;
writeFileSync('out/qr-kid-phonics-cats.svg', svg);
const raster = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
writeFileSync('public/img/qr-cats.png', raster);
writeFileSync('out/qr-kid-phonics-cats.png', raster);
console.log(`QR -> ${URL} (version ${qr.version}, ${n}x${n}, logo ${logo}x${logo} = ${(100 * logo * logo / n / n).toFixed(0)}%)`);
