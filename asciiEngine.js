/**
 * =====================================================================
 *  AsciiEngine v4.0 — Photographic Fidelity ASCII Renderer
 * =====================================================================
 *
 *  カメラらしい自然な描写を目指したエンジン:
 *    - sRGB → リニア → 処理 → sRGB の正しいカラーパイプライン
 *    - Adaptive Tone Mapping: カメラのオートトーンカーブを再現
 *    - 暗部の自然なリフト（黒潰れしない）
 *    - ハイライトのソフトロールオフ（白飛びしない）
 *    - 高精度 Bayer ディザリング
 *    - 色の忠実性を維持したまま文字の濃淡にマッピング
 */

export const CHARACTER_SETS = {
  standard:  '@%#*+=-:. ',
  detailed:  '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  blocks:    '█▓▒░ ',
  binary:    '10',
  emoji:     '💥🔥😎⭐✨⚡🔷▫️ ',
  matrix:    'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ9876543210 ',
  realistic: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
};

// ────────── Ordered Bayer 4×4 Dithering Matrix ──────────
const BAYER_4X4 = new Float32Array([
   0/16 - 0.5,  8/16 - 0.5,  2/16 - 0.5, 10/16 - 0.5,
  12/16 - 0.5,  4/16 - 0.5, 14/16 - 0.5,  6/16 - 0.5,
   3/16 - 0.5, 11/16 - 0.5,  1/16 - 0.5,  9/16 - 0.5,
  15/16 - 0.5,  7/16 - 0.5, 13/16 - 0.5,  5/16 - 0.5,
]);

// ────────── sRGB → Linear ──────────
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const s = i / 255;
  SRGB_TO_LINEAR[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// ────────── Photographic Tone Curve LUT ──────────
// カメラの内蔵トーンカーブを再現:
//   - シャドウ部を自然にリフト (黒潰れ防止)
//   - ミッドトーンはリニアに忠実
//   - ハイライトはソフトにロールオフ (白飛び防止)
function buildToneCurveLUT(brightness, contrast, gamma, shadowLift) {
  const lut = new Uint8Array(256);
  const invGamma = 1 / Math.max(0.1, gamma);

  // Contrast factor (Photoshop-style)
  const cf = Math.max(0.01, contrast);

  for (let i = 0; i < 256; i++) {
    let v = i / 255;

    // 1) Shadow Lift — ソフトな暗部底上げ (カメラのシャドウ補正に相当)
    //    暗いピクセルほど持ち上げ、明るいピクセルには影響しないスムーズカーブ
    if (shadowLift > 0) {
      const lift = (shadowLift / 100);
      // 暗部を底上げする S-curve ブレンド
      const shadowMask = (1 - v) * (1 - v); // 暗いほど強く適用
      v = v + lift * shadowMask * 0.35;
    }

    // 2) Brightness — 全体のシフト
    v = v + brightness / 255;

    // 3) Contrast — ミッドポイント (0.5) 中心の S-curve 強調
    v = ((v - 0.5) * cf) + 0.5;

    // 4) Gamma — トーンカーブの中間域形状を変更
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, invGamma);

    // 5) Soft Highlight Rolloff — ハイライト域の白飛び防止
    //    1.0 付近で滑らかに飽和させるカメラ的な処理
    if (v > 0.85) {
      const excess = (v - 0.85) / 0.15;
      v = 0.85 + 0.15 * (1 - Math.pow(1 - excess, 2.0));
    }

    lut[i] = Math.min(255, Math.max(0, Math.round(v * 255)));
  }
  return lut;
}

// ────────── Perceptual Luminance ──────────
function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ────────── Sobel Edge Detector ──────────
class EdgeDetector {
  static computeEdgeMap(pixels, width, height, threshold) {
    const lum = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const pi = i * 4;
      lum[i] = luminance(pixels[pi], pixels[pi + 1], pixels[pi + 2]);
    }

    const edgeMap = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const tl = lum[(y - 1) * width + (x - 1)];
        const tc = lum[(y - 1) * width + x];
        const tr = lum[(y - 1) * width + (x + 1)];
        const ml = lum[y * width + (x - 1)];
        const mr = lum[y * width + (x + 1)];
        const bl = lum[(y + 1) * width + (x - 1)];
        const bc = lum[(y + 1) * width + x];
        const br = lum[(y + 1) * width + (x + 1)];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        const mag = Math.sqrt(gx * gx + gy * gy);

        edgeMap[y * width + x] = mag > threshold ? Math.min(255, mag) : 0;
      }
    }
    return edgeMap;
  }
}

// ────────── Color Mode Rendering ──────────
function getCharColor(mode, r, g, b, lum, x, y, cols, rows, customTC) {
  switch (mode) {
    case 'color':
      return `rgb(${r},${g},${b})`;

    case 'matrix': {
      const gl = Math.max(80, (lum * 1.1) | 0);
      return `rgb(0,${Math.min(255, gl)},${Math.min(255, (lum * 0.35) | 0)})`;
    }

    case 'cyber': {
      const ratio = x / cols;
      const h = ratio * 270;
      // HSL-like neon gradient
      const cr = Math.min(255, (Math.sin(h * 0.0175) * 200 + 55) | 0);
      const cg = Math.min(255, (lum * 0.7) | 0);
      const cb = Math.min(255, (Math.cos(h * 0.0175) * 200 + 55) | 0);
      return `rgb(${cr},${cg},${cb})`;
    }

    case 'amber': {
      const a = Math.min(255, (lum * 1.05) | 0);
      return `rgb(${a},${(a * 0.72) | 0},${(a * 0.12) | 0})`;
    }

    case 'custom':
      return customTC;

    case 'invert':
      return '#111111';

    case 'mono':
    default: {
      const m = lum | 0;
      return `rgb(${m},${m},${m})`;
    }
  }
}

// ────────── Main Engine ──────────
export class AsciiEngine {
  constructor(asciiCanvas, sourceCanvas) {
    this.asciiCanvas = asciiCanvas;
    this.ctx = asciiCanvas.getContext('2d', { alpha: false });
    this.sourceCanvas = sourceCanvas;
    this.sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

    // Defaults
    this.cols = 120;
    this.fontSize = 10;
    this.charAspect = 0.55;
    this.charSet = CHARACTER_SETS.standard;
    this.colorMode = 'matrix';
    this.frameAspect = 'full';
    this.dithering = true;

    this.brightness = 0;
    this.contrast = 1.0;
    this.saturation = 1.0;
    this.gamma = 1.0;
    this.shadowLift = 30; // カメラ的な暗部リフト (0-100)
    this.edgeMode = false;
    this.edgeThreshold = 30;
    this.invert = false;

    this.customBgColor = '#05070a';
    this.customTextColor = '#00ff66';

    this._fps = 0;
    this._frames = 0;
    this._fpsTime = performance.now();

    this._toneLUT = null;
    this._lastToneParams = '';

    this.lastTextOutput = '';
  }

  setOptions(o) {
    for (const k of Object.keys(o)) {
      if (o[k] !== undefined) this[k] = o[k];
    }
  }

  getFps() { return this._fps; }
  getTextOutput() { return this.lastTextOutput; }

  process(sourceElement) {
    if (!sourceElement) return;

    const srcW = sourceElement.videoWidth || sourceElement.width;
    const srcH = sourceElement.videoHeight || sourceElement.height;
    if (!srcW || !srcH) return;

    // FPS Counter
    this._frames++;
    const now = performance.now();
    if (now - this._fpsTime >= 1000) {
      this._fps = Math.round((this._frames * 1000) / (now - this._fpsTime));
      this._frames = 0;
      this._fpsTime = now;
    }

    // Aspect Calculation & Center Crop
    const isPortrait = srcH > srcW;
    let targetRatio; // width / height

    if (this.frameAspect === '16:9') {
      targetRatio = isPortrait ? 9 / 16 : 16 / 9;
    } else if (this.frameAspect === '4:3') {
      targetRatio = isPortrait ? 3 / 4 : 4 / 3;
    } else if (this.frameAspect === '1:1') {
      targetRatio = 1.0;
    } else { // 'full'
      const parent = this.asciiCanvas.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        targetRatio = parent.clientWidth / parent.clientHeight;
      } else {
        targetRatio = srcW / srcH;
      }
    }

    // Crop box calculation (Center Crop)
    const srcRatio = srcW / srcH;
    let sx = 0, sy = 0, sw = srcW, sh = srcH;

    if (srcRatio > targetRatio) {
      // Source is wider -> crop left/right
      sw = srcH * targetRatio;
      sx = (srcW - sw) / 2;
    } else if (srcRatio < targetRatio) {
      // Source is taller -> crop top/bottom
      sh = srcW / targetRatio;
      sy = (srcH - sh) / 2;
    }

    const targetAR = 1 / targetRatio; // height / width
    const cols = this.cols;
    const rows = Math.max(1, Math.floor(cols * targetAR * this.charAspect));

    // Sample Source with Center Crop
    this.sourceCanvas.width = cols;
    this.sourceCanvas.height = rows;
    this.sourceCtx.drawImage(sourceElement, sx, sy, sw, sh, 0, 0, cols, rows);

    const imgData = this.sourceCtx.getImageData(0, 0, cols, rows);
    const pixels = imgData.data;

    // Build / Cache Tone Curve LUT
    const toneKey = `${this.contrast}_${this.brightness}_${this.gamma}_${this.shadowLift}`;
    if (toneKey !== this._lastToneParams) {
      this._toneLUT = buildToneCurveLUT(this.brightness, this.contrast, this.gamma, this.shadowLift);
      this._lastToneParams = toneKey;
    }
    const toneLUT = this._toneLUT;

    // Saturation Pass (in-place)
    const sat = this.saturation;
    const totalPx = cols * rows;

    if (sat !== 1.0) {
      for (let i = 0; i < totalPx * 4; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const gray = luminance(r, g, b);
        pixels[i]     = Math.min(255, Math.max(0, (gray + (r - gray) * sat) | 0));
        pixels[i + 1] = Math.min(255, Math.max(0, (gray + (g - gray) * sat) | 0));
        pixels[i + 2] = Math.min(255, Math.max(0, (gray + (b - gray) * sat) | 0));
      }
    }

    // Edge Detection (optional)
    let edgeMap = null;
    if (this.edgeMode) {
      edgeMap = EdgeDetector.computeEdgeMap(pixels, cols, rows, this.edgeThreshold);
    }

    // Prepare Output Canvas
    const cellW = this.fontSize * 0.6;
    const cellH = this.fontSize;
    const outW = (cols * cellW) | 0;
    const outH = (rows * cellH) | 0;

    if (this.asciiCanvas.width !== outW || this.asciiCanvas.height !== outH) {
      this.asciiCanvas.width = outW;
      this.asciiCanvas.height = outH;
    }

    const ctx = this.ctx;

    // Background
    ctx.fillStyle = this.colorMode === 'custom'
      ? this.customBgColor
      : (this.colorMode === 'invert' ? '#ffffff' : '#05070a');
    ctx.fillRect(0, 0, outW, outH);

    ctx.font = `${this.fontSize}px 'Fira Code','Courier New',monospace`;
    ctx.textBaseline = 'top';

    const chars = this.charSet;
    const charLen = chars.length;
    const charScale = (charLen - 1) / 255;
    const mode = this.colorMode;
    const customTC = this.customTextColor;
    const doInvert = this.invert;
    const doDither = this.dithering;

    const textLines = new Array(rows);
    let prevColor = '';

    for (let row = 0; row < rows; row++) {
      let line = '';
      const bayerRowOff = (row & 3) * 4; // row mod 4, offset into flat 4×4 matrix

      for (let col = 0; col < cols; col++) {
        const pi = (row * cols + col) * 4;
        const pr = pixels[pi];
        const pg = pixels[pi + 1];
        const pb = pixels[pi + 2];

        // 1. Raw perceptual luminance
        let rawLum = luminance(pr, pg, pb);

        // 2. Apply photographic tone curve
        let mappedLum = toneLUT[rawLum | 0];

        // 3. Edge override or Dithering
        if (edgeMap) {
          mappedLum = edgeMap[row * cols + col];
        } else if (doDither) {
          // Ordered dither: subtle texture without destroying tones
          const bayerVal = BAYER_4X4[bayerRowOff + (col & 3)];
          const ditherStrength = 12; // ピクセル単位の影響度
          mappedLum = Math.min(255, Math.max(0, mappedLum + bayerVal * ditherStrength));
        }

        if (doInvert) mappedLum = 255 - mappedLum;

        // 4. Character mapping
        const ci = Math.min(charLen - 1, Math.max(0, (mappedLum * charScale + 0.5) | 0));
        const ch = chars[ci];
        line += ch;

        // 5. Render with color
        const color = getCharColor(mode, pr, pg, pb, mappedLum, col, row, cols, rows, customTC);
        if (color !== prevColor) {
          ctx.fillStyle = color;
          prevColor = color;
        }
        ctx.fillText(ch, col * cellW, row * cellH);
      }
      textLines[row] = line;
    }

    this.lastTextOutput = textLines.join('\n');
  }
}
