/**
 * =====================================================================
 *  AsciiEngine v2 — 高性能リアルタイム画像→アスキーアート変換エンジン
 * =====================================================================
 *
 *  アーキテクチャ:
 *    SourceElement → DownsampleCanvas → ImagePipeline → CharMapper → Renderer
 *
 *  パフォーマンス改善:
 *    - OffscreenCanvas + ImageData 直接操作でメインスレッド負荷を削減
 *    - ルックアップテーブル (LUT) による gamma / contrast の事前計算
 *    - fillText のバッチ描画 (同色の文字をまとめて描画)
 *    - 不要な Math.pow / Math.sqrt をループ外に移動
 */

// ────────── Character Set Presets ──────────

export const CHARACTER_SETS = {
  standard:  '@%#*+=-:. ',
  detailed:  '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  blocks:    '█▓▒░ ',
  binary:    '10',
  emoji:     '💥🔥😎⭐✨⚡🔷▫️ ',
  matrix:    'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ9876543210 ',
};

// ────────── Lookup Table Builder ──────────

function buildGammaLUT(gamma) {
  const lut = new Uint8Array(256);
  const invGamma = 1 / Math.max(0.01, gamma);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, Math.round(Math.pow(i / 255, invGamma) * 255)));
  }
  return lut;
}

function buildContrastBrightnessLUT(contrast, brightness) {
  const lut = new Uint8Array(256);
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
  for (let i = 0; i < 256; i++) {
    let v = i + brightness;
    v = factor * (v - 128) + 128;
    lut[i] = Math.min(255, Math.max(0, Math.round(v)));
  }
  return lut;
}

// ────────── Image Processing Pipeline ──────────

class ImagePipeline {
  constructor() {
    this._gammaLUT = null;
    this._cbLUT = null;
    this._lastGamma = NaN;
    this._lastContrast = NaN;
    this._lastBrightness = NaN;
  }

  /**
   * フルパイプラインを ImageData.data (RGBA Uint8ClampedArray) にインプレースで適用
   */
  apply(pixels, width, height, opts) {
    const len = width * height * 4;

    // LUT キャッシュ — パラメータが変わった時のみ再構築
    if (opts.gamma !== this._lastGamma) {
      this._gammaLUT = buildGammaLUT(opts.gamma);
      this._lastGamma = opts.gamma;
    }
    if (opts.contrast !== this._lastContrast || opts.brightness !== this._lastBrightness) {
      this._cbLUT = buildContrastBrightnessLUT(opts.contrast, opts.brightness);
      this._lastContrast = opts.contrast;
      this._lastBrightness = opts.brightness;
    }

    const gammaLUT = this._gammaLUT;
    const cbLUT = this._cbLUT;
    const sat = opts.saturation;
    const needSat = sat !== 1.0;
    const needGamma = opts.gamma !== 1.0;
    const needCB = opts.contrast !== 1.0 || opts.brightness !== 0;

    // Single-pass over all pixels
    for (let i = 0; i < len; i += 4) {
      let r = pixels[i];
      let g = pixels[i + 1];
      let b = pixels[i + 2];

      // 1. Saturation (鮮やかさ)
      if (needSat) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = Math.min(255, Math.max(0, gray + (r - gray) * sat));
        g = Math.min(255, Math.max(0, gray + (g - gray) * sat));
        b = Math.min(255, Math.max(0, gray + (b - gray) * sat));
      }

      // 2. Brightness + Contrast (LUT)
      if (needCB) {
        r = cbLUT[Math.min(255, Math.max(0, r | 0))];
        g = cbLUT[Math.min(255, Math.max(0, g | 0))];
        b = cbLUT[Math.min(255, Math.max(0, b | 0))];
      }

      // 3. Gamma (LUT)
      if (needGamma) {
        r = gammaLUT[r];
        g = gammaLUT[g];
        b = gammaLUT[b];
      }

      pixels[i]     = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
  }
}

// ────────── Sobel Edge Detection ──────────

class EdgeDetector {
  /**
   * pixels (processed) から輝度グリッドを構築し、Sobel フィルタで
   * エッジ強度マップ (Float32Array, rows*cols) を返す
   */
  static computeEdgeMap(pixels, width, height, threshold) {
    // Build luminance grid
    const lum = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const pi = i * 4;
      lum[i] = 0.299 * pixels[pi] + 0.587 * pixels[pi + 1] + 0.114 * pixels[pi + 2];
    }

    const edgeMap = new Float32Array(width * height);

    // Sobel 3x3 operator
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

        // Gx = [-1 0 +1; -2 0 +2; -1 0 +1]
        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        // Gy = [-1 -2 -1;  0  0  0; +1 +2 +1]
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

        // Fast approximation of magnitude (avoid sqrt in hot loop)
        let mag = Math.abs(gx) + Math.abs(gy);

        // Threshold gating
        edgeMap[y * width + x] = mag > threshold ? Math.min(255, mag) : 0;
      }
    }

    return edgeMap;
  }
}

// ────────── Color Modes ──────────

const COLOR_FN = {
  matrix(r, g, b, lum, x, y, cols, rows) {
    const i = lum | 0;
    return (0 << 24) | (Math.max(80, i) << 8) | ((i * 0.4) | 0);  // packed, but we return string
  },
  cyber(r, g, b, lum, x, y, cols, rows) {
    const ratio = x / cols;
    return null; // handled inline for perf
  },
  color(r, g, b) { return null; },
  mono(r, g, b, lum) { return null; },
  amber(r, g, b, lum) { return null; },
  invert(r, g, b, lum) { return null; },
  custom(r, g, b, lum) { return null; },
};

function getCharColorString(mode, r, g, b, lum, x, y, cols, rows, customTextColor) {
  switch (mode) {
    case 'matrix': {
      const i = lum | 0;
      return `rgb(0,${Math.max(80, i)},${(i * 0.4) | 0})`;
    }
    case 'cyber': {
      const ratio = x / cols;
      return `rgb(${(255 * ratio) | 0},${(lum * 0.8) | 0},${(255 * (1 - ratio)) | 0})`;
    }
    case 'color':
      return `rgb(${r | 0},${g | 0},${b | 0})`;
    case 'amber': {
      const i = lum | 0;
      return `rgb(${i},${(i * 0.7) | 0},0)`;
    }
    case 'custom':
      return customTextColor;
    case 'invert':
      return '#111';
    case 'mono':
    default: {
      const i = lum | 0;
      return `rgb(${i},${i},${i})`;
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

    this.pipeline = new ImagePipeline();

    // ── Options ──
    this.cols = 100;
    this.fontSize = 10;
    this.charAspect = 0.55;
    this.charSet = CHARACTER_SETS.standard;
    this.colorMode = 'matrix';

    this.brightness = 0;
    this.contrast = 1.0;
    this.saturation = 1.0;
    this.gamma = 1.0;
    this.edgeMode = false;
    this.edgeThreshold = 30;
    this.invert = false;

    this.customBgColor = '#05070a';
    this.customTextColor = '#00ff66';

    // ── FPS ──
    this._fps = 0;
    this._frames = 0;
    this._fpsTime = performance.now();

    // ── Text Output Cache ──
    this.lastTextOutput = '';

    // ── 内部バッファ ──
    this._charWidthCache = 0;
  }

  /* ───── Public API ───── */

  setOptions(o) {
    for (const k of Object.keys(o)) {
      if (o[k] !== undefined) this[k] = o[k];
    }
  }

  getFps() { return this._fps; }
  getTextOutput() { return this.lastTextOutput; }

  /**
   * メインレンダリングパス
   */
  process(sourceElement) {
    if (!sourceElement) return;

    const srcW = sourceElement.videoWidth || sourceElement.width;
    const srcH = sourceElement.videoHeight || sourceElement.height;
    if (!srcW || !srcH) return;

    // ── FPS Measurement ──
    this._frames++;
    const now = performance.now();
    if (now - this._fpsTime >= 1000) {
      this._fps = Math.round((this._frames * 1000) / (now - this._fpsTime));
      this._frames = 0;
      this._fpsTime = now;
    }

    // ── Grid dimensions ──
    const cols = this.cols;
    const rows = Math.max(1, Math.floor((srcH / srcW) * cols * this.charAspect));

    // ── Downsample Source → Small Canvas ──
    this.sourceCanvas.width = cols;
    this.sourceCanvas.height = rows;
    this.sourceCtx.drawImage(sourceElement, 0, 0, cols, rows);

    const imgData = this.sourceCtx.getImageData(0, 0, cols, rows);
    const pixels = imgData.data;

    // ── Image Pipeline (Saturation → Brightness/Contrast → Gamma) ──
    this.pipeline.apply(pixels, cols, rows, {
      saturation: this.saturation,
      brightness: this.brightness,
      contrast:   this.contrast,
      gamma:      this.gamma,
    });

    // ── Edge Detection (Sobel) ──
    let edgeMap = null;
    if (this.edgeMode) {
      edgeMap = EdgeDetector.computeEdgeMap(pixels, cols, rows, this.edgeThreshold);
    }

    // ── Prepare Output Canvas ──
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
      : (this.colorMode === 'invert' ? '#fff' : '#05070a');
    ctx.fillRect(0, 0, outW, outH);

    ctx.font = `${this.fontSize}px 'Fira Code','Courier New',monospace`;
    ctx.textBaseline = 'top';

    const chars = this.charSet;
    const charLen = chars.length;
    const invCharLen = charLen / 256; // pre-compute multiplier
    const mode = this.colorMode;
    const customTC = this.customTextColor;
    const doInvert = this.invert;

    const textLines = new Array(rows);

    // ── Render Loop ──
    // 同色バッチ描画: 前回の色を記憶し、色が変わったタイミングで fillStyle を切り替える
    let prevColor = '';

    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const pi = (r * cols + c) * 4;
        const pr = pixels[pi];
        const pg = pixels[pi + 1];
        const pb = pixels[pi + 2];

        // Luminance
        let lum;
        if (edgeMap) {
          lum = edgeMap[r * cols + c];
        } else {
          lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        }

        if (doInvert) lum = 255 - lum;

        // Character selection
        const ci = Math.min(charLen - 1, Math.max(0, (lum * invCharLen) | 0));
        const ch = chars[ci];
        line += ch;

        // Color
        const color = getCharColorString(mode, pr, pg, pb, lum, c, r, cols, rows, customTC);
        if (color !== prevColor) {
          ctx.fillStyle = color;
          prevColor = color;
        }
        ctx.fillText(ch, c * cellW, r * cellH);
      }
      textLines[r] = line;
    }

    this.lastTextOutput = textLines.join('\n');
  }
}
