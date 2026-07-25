/**
 * ASCII Art Conversion & Rendering Engine
 */

export const CHARACTER_SETS = {
  standard: '@%#*+=-:. ',
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  blocks: '█▓▒░ ',
  binary: '10',
  emoji: '💥🔥😎⭐✨⚡🔷▫️ ',
};

export class AsciiEngine {
  constructor(asciiCanvas, sourceCanvas) {
    this.asciiCanvas = asciiCanvas;
    this.ctx = asciiCanvas.getContext('2d', { alpha: false });
    this.sourceCanvas = sourceCanvas;
    this.sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

    // Options
    this.cols = 100;
    this.fontSize = 10;
    this.charSet = CHARACTER_SETS.standard;
    this.colorMode = 'matrix';
    this.brightness = 0;
    this.contrast = 1.0;
    this.invert = false;

    // Output Cache for text export
    this.lastTextOutput = '';
  }

  setOptions(options) {
    if (options.cols !== undefined) this.cols = options.cols;
    if (options.fontSize !== undefined) this.fontSize = options.fontSize;
    if (options.charSet !== undefined) this.charSet = options.charSet;
    if (options.colorMode !== undefined) this.colorMode = options.colorMode;
    if (options.brightness !== undefined) this.brightness = options.brightness;
    if (options.contrast !== undefined) this.contrast = options.contrast;
    if (options.invert !== undefined) this.invert = options.invert;
  }

  /**
   * Process element (video or image) and render ASCII
   */
  process(sourceElement) {
    if (!sourceElement) return;

    let srcWidth = sourceElement.videoWidth || sourceElement.width;
    let srcHeight = sourceElement.videoHeight || sourceElement.height;

    if (!srcWidth || !srcHeight) return;

    // Aspect ratio calculation (ASCII characters are taller than wide, ~1:2 or font dependent)
    const fontAspect = 0.55; 
    const cols = this.cols;
    const rows = Math.floor((srcHeight / srcWidth) * cols * fontAspect);

    if (rows <= 0 || cols <= 0) return;

    // Resize source canvas for grid sampling
    this.sourceCanvas.width = cols;
    this.sourceCanvas.height = rows;
    this.sourceCtx.drawImage(sourceElement, 0, 0, cols, rows);

    const imgData = this.sourceCtx.getImageData(0, 0, cols, rows);
    const pixels = imgData.data;

    // Prepare Output Render Canvas
    const cellWidth = this.fontSize * 0.6;
    const cellHeight = this.fontSize;
    const outWidth = Math.floor(cols * cellWidth);
    const outHeight = Math.floor(rows * cellHeight);

    if (this.asciiCanvas.width !== outWidth || this.asciiCanvas.height !== outHeight) {
      this.asciiCanvas.width = outWidth;
      this.asciiCanvas.height = outHeight;
    }

    // Background fill
    this.ctx.fillStyle = this.colorMode === 'invert' ? '#ffffff' : '#05070a';
    this.ctx.fillRect(0, 0, outWidth, outHeight);

    this.ctx.font = `${this.fontSize}px 'Fira Code', 'Courier New', monospace`;
    this.ctx.textBaseline = 'top';

    const chars = this.charSet;
    const charLen = chars.length;
    let textLines = [];

    const contrastFactor = (259 * (this.contrast * 255 + 255)) / (255 * (259 - this.contrast * 255));

    for (let r = 0; r < rows; r++) {
      let lineText = '';
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 4;
        let red = pixels[idx];
        let green = pixels[idx + 1];
        let blue = pixels[idx + 2];

        // Apply Brightness & Contrast
        if (this.brightness !== 0) {
          red += this.brightness;
          green += this.brightness;
          blue += this.brightness;
        }

        if (this.contrast !== 1.0) {
          red = contrastFactor * (red - 128) + 128;
          green = contrastFactor * (green - 128) + 128;
          blue = contrastFactor * (blue - 128) + 128;
        }

        // Clamp
        red = Math.min(255, Math.max(0, red));
        green = Math.min(255, Math.max(0, green));
        blue = Math.min(255, Math.max(0, blue));

        // Luminance formula (ITU-R BT.601)
        let brightness = 0.299 * red + 0.587 * green + 0.114 * blue;

        if (this.invert) {
          brightness = 255 - brightness;
        }

        // Character mapping
        const charIdx = Math.floor((brightness / 256) * charLen);
        const char = chars[Math.min(charLen - 1, Math.max(0, charIdx))];
        lineText += char;

        // Color Mode styling
        this.ctx.fillStyle = this.getCharColor(this.colorMode, red, green, blue, brightness, c, r, cols, rows);
        this.ctx.fillText(char, c * cellWidth, r * cellHeight);
      }
      textLines.push(lineText);
    }

    this.lastTextOutput = textLines.join('\n');
  }

  getCharColor(mode, r, g, b, brightness, x, y, cols, rows) {
    switch (mode) {
      case 'matrix': {
        const intensity = Math.floor(brightness);
        return `rgb(0, ${Math.max(80, intensity)}, ${Math.floor(intensity * 0.4)})`;
      }
      case 'cyber': {
        // Gradient across screen x
        const ratio = x / cols;
        const cyR = Math.floor(255 * ratio);
        const cyG = Math.floor(brightness * 0.8);
        const cyB = Math.floor(255 * (1 - ratio));
        return `rgb(${cyR}, ${cyG}, ${cyB})`;
      }
      case 'color':
        return `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
      case 'amber': {
        const intensity = Math.floor(brightness);
        return `rgb(${intensity}, ${Math.floor(intensity * 0.7)}, 0)`;
      }
      case 'invert':
        return '#111111';
      case 'mono':
      default: {
        const intensity = Math.floor(brightness);
        return `rgb(${intensity}, ${intensity}, ${intensity})`;
      }
    }
  }

  getTextOutput() {
    return this.lastTextOutput;
  }
}
