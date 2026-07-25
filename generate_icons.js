import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#05070a"/>
  <rect x="20" y="20" width="472" height="472" rx="80" fill="none" stroke="#00f2fe" stroke-width="8" opacity="0.3"/>
  <circle cx="256" cy="256" r="180" fill="none" stroke="#00f2fe" stroke-width="16" opacity="0.8"/>
  <circle cx="256" cy="256" r="130" fill="#05070a" stroke="#00ff66" stroke-width="12"/>
  <text x="256" y="275" font-family="monospace" font-size="70" font-weight="bold" fill="#00f2fe" text-anchor="middle">ASCII</text>
  <circle cx="370" cy="140" r="25" fill="#ff0844"/>
</svg>`;

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
console.log('SVG Icon generated successfully.');
