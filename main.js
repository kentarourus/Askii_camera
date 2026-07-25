import { AsciiEngine, CHARACTER_SETS } from './asciiEngine.js';
import { CameraManager } from './cameraManager.js';
import { downloadPng, downloadTxt, copyTextToClipboard } from './exporter.js';

document.addEventListener('DOMContentLoaded', () => {
  // PWA Service Worker Registration (Relative path friendly)
  if ('serviceWorker' in navigator) {
    const swPath = new URL('./sw.js', import.meta.url).href;
    navigator.serviceWorker.register(swPath)
      .then(() => console.log('Service Worker Registered'))
      .catch(err => console.log('SW Registration failed: ', err));
  }

  // DOM Elements - Viewfinder & Overlays
  const asciiCanvas = document.getElementById('asciiCanvas');
  const sourceCanvas = document.getElementById('sourceCanvas');
  const webcamVideo = document.getElementById('webcamVideo');

  const fpsBadge = document.getElementById('fpsBadge');
  const cameraGrid = document.getElementById('cameraGrid');
  const shutterFlash = document.getElementById('shutterFlash');
  const canvasContainer = document.getElementById('canvasContainer');
  const dropOverlay = document.getElementById('dropOverlay');

  // Buttons & Controls
  const btnToggleGrid = document.getElementById('btnToggleGrid');
  const btnSwitchCamera = document.getElementById('btnSwitchCamera');
  const btnToggleDrawer = document.getElementById('btnToggleDrawer');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnShutter = document.getElementById('btnShutter');
  const btnPause = document.getElementById('btnPause');
  const pauseIcon = document.getElementById('pauseIcon');
  const fileInput = document.getElementById('fileInput');

  // Mode Ribbon
  const modeRibbon = document.getElementById('modeRibbon');

  // Adjustment Drawer
  const adjustmentDrawer = document.getElementById('adjustmentDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');

  // Drawer Form Controls
  const charSetSelect = document.getElementById('charSetSelect');
  const customCharGroup = document.getElementById('customCharGroup');
  const customCharInput = document.getElementById('customCharInput');

  const customColorRow = document.getElementById('customColorRow');
  const bgColorInput = document.getElementById('bgColorInput');
  const textColorInput = document.getElementById('textColorInput');

  const saturationSlider = document.getElementById('saturationSlider');
  const saturationVal = document.getElementById('saturationVal');

  const gammaSlider = document.getElementById('gammaSlider');
  const gammaVal = document.getElementById('gammaVal');

  const brightnessSlider = document.getElementById('brightnessSlider');
  const brightnessVal = document.getElementById('brightnessVal');

  const contrastSlider = document.getElementById('contrastSlider');
  const contrastVal = document.getElementById('contrastVal');

  const edgeCheckbox = document.getElementById('edgeCheckbox');
  const edgeThresholdGroup = document.getElementById('edgeThresholdGroup');
  const edgeThresholdSlider = document.getElementById('edgeThresholdSlider');
  const edgeThresholdVal = document.getElementById('edgeThresholdVal');

  const invertCheckbox = document.getElementById('invertCheckbox');

  const resolutionSlider = document.getElementById('resolutionSlider');
  const resolutionVal = document.getElementById('resolutionVal');

  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeVal = document.getElementById('fontSizeVal');

  const charAspectSlider = document.getElementById('charAspectSlider');
  const charAspectVal = document.getElementById('charAspectVal');

  // Capture Modal Elements
  const captureModal = document.getElementById('captureModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const modalPreviewCanvas = document.getElementById('modalPreviewCanvas');
  const btnSnapPng = document.getElementById('btnSnapPng');
  const btnSnapTxt = document.getElementById('btnSnapTxt');
  const btnCopyTxt = document.getElementById('btnCopyTxt');

  const toast = document.getElementById('toast');

  // State
  let isPaused = false;
  let animFrameId = null;
  let currentSource = null;
  let activeColorMode = 'matrix';

  // Initialize Engine & Camera
  const engine = new AsciiEngine(asciiCanvas, sourceCanvas);

  const cameraManager = new CameraManager(
    webcamVideo,
    (source, mode) => {
      currentSource = source;
      startLoop();
      showToast(mode === 'camera' ? 'カメラ動作中' : 'メディア読み込み完了');
    },
    (errMsg) => {
      showToast(errMsg);
    }
  );

  // Update Settings from Controls
  function updateEngineSettings() {
    let charSet = CHARACTER_SETS[charSetSelect.value];
    if (charSetSelect.value === 'custom') {
      charSet = customCharInput.value || '@%#*+=-:. ';
    }

    engine.setOptions({
      cols: parseInt(resolutionSlider.value, 10),
      fontSize: parseInt(fontSizeSlider.value, 10),
      charAspect: parseFloat(charAspectSlider.value),
      charSet: charSet,
      colorMode: activeColorMode,
      brightness: parseInt(brightnessSlider.value, 10),
      contrast: parseFloat(contrastSlider.value),
      saturation: parseFloat(saturationSlider.value),
      gamma: parseFloat(gammaSlider.value),
      edgeMode: edgeCheckbox.checked,
      edgeThreshold: parseInt(edgeThresholdSlider.value, 10),
      invert: invertCheckbox.checked,
      customBgColor: bgColorInput.value,
      customTextColor: textColorInput.value
    });
  }

  // Render Animation Loop
  function renderFrame() {
    if (!isPaused && currentSource) {
      engine.process(currentSource);
      fpsBadge.textContent = `${engine.getFps()} FPS`;
    }
    animFrameId = requestAnimationFrame(renderFrame);
  }

  function startLoop() {
    if (!animFrameId) {
      renderFrame();
    }
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // ────────── Mode Ribbon Select ──────────
  modeRibbon.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-item');
    if (!btn) return;

    modeRibbon.querySelectorAll('.mode-item').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    activeColorMode = btn.dataset.mode;
    if (activeColorMode === 'custom') {
      customColorRow.style.display = 'block';
    } else {
      customColorRow.style.display = 'none';
    }
    updateEngineSettings();
  });

  // ────────── Native Shutter Trigger ──────────
  btnShutter.addEventListener('click', () => {
    // 1. Shutter Flash FX
    shutterFlash.classList.add('flash-active');
    setTimeout(() => {
      shutterFlash.classList.remove('flash-active');
    }, 100);

    // 2. Clone ASCII Canvas to Modal Preview
    modalPreviewCanvas.width = asciiCanvas.width;
    modalPreviewCanvas.height = asciiCanvas.height;
    const ctx = modalPreviewCanvas.getContext('2d');
    ctx.drawImage(asciiCanvas, 0, 0);

    // 3. Open Export Modal
    captureModal.classList.add('open');
  });

  btnCloseModal.addEventListener('click', () => {
    captureModal.classList.remove('open');
  });

  // ────────── Top Bar Buttons ──────────
  btnToggleGrid.addEventListener('click', () => {
    cameraGrid.classList.toggle('hidden');
    btnToggleGrid.classList.toggle('active');
  });

  btnSwitchCamera.addEventListener('click', async () => {
    await cameraManager.switchCamera();
    showToast('カメラ切り替え完了');
  });

  btnToggleDrawer.addEventListener('click', () => {
    adjustmentDrawer.classList.toggle('open');
  });

  btnCloseDrawer.addEventListener('click', () => {
    adjustmentDrawer.classList.remove('open');
  });

  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        showToast('全画面表示に対応していません');
      });
    } else {
      document.exitFullscreen();
    }
  });

  btnPause.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      pauseIcon.innerHTML = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
      showToast('一時停止中');
    } else {
      pauseIcon.innerHTML = '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      showToast('再開');
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      cameraManager.loadFile(file);
    }
  });

  // ────────── Drag & Drop ──────────
  canvasContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('drag-over');
  });

  canvasContainer.addEventListener('dragleave', () => {
    dropOverlay.classList.remove('drag-over');
  });

  canvasContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      cameraManager.loadFile(e.dataTransfer.files[0]);
    }
  });

  // ────────── Drawer Controls Listeners ──────────
  bgColorInput.addEventListener('input', updateEngineSettings);
  textColorInput.addEventListener('input', updateEngineSettings);

  charSetSelect.addEventListener('change', () => {
    customCharGroup.style.display = charSetSelect.value === 'custom' ? 'flex' : 'none';
    updateEngineSettings();
  });
  customCharInput.addEventListener('input', updateEngineSettings);

  saturationSlider.addEventListener('input', () => {
    saturationVal.textContent = saturationSlider.value;
    updateEngineSettings();
  });

  gammaSlider.addEventListener('input', () => {
    gammaVal.textContent = gammaSlider.value;
    updateEngineSettings();
  });

  brightnessSlider.addEventListener('input', () => {
    brightnessVal.textContent = brightnessSlider.value;
    updateEngineSettings();
  });

  contrastSlider.addEventListener('input', () => {
    contrastVal.textContent = contrastSlider.value;
    updateEngineSettings();
  });

  edgeCheckbox.addEventListener('change', () => {
    edgeThresholdGroup.style.display = edgeCheckbox.checked ? 'flex' : 'none';
    updateEngineSettings();
  });

  edgeThresholdSlider.addEventListener('input', () => {
    edgeThresholdVal.textContent = edgeThresholdSlider.value;
    updateEngineSettings();
  });

  invertCheckbox.addEventListener('change', updateEngineSettings);

  resolutionSlider.addEventListener('input', () => {
    resolutionVal.textContent = resolutionSlider.value;
    updateEngineSettings();
  });

  fontSizeSlider.addEventListener('input', () => {
    fontSizeVal.textContent = fontSizeSlider.value;
    updateEngineSettings();
  });

  charAspectSlider.addEventListener('input', () => {
    charAspectVal.textContent = charAspectSlider.value;
    updateEngineSettings();
  });

  // ────────── Export Modal Actions ──────────
  btnSnapPng.addEventListener('click', () => {
    downloadPng(asciiCanvas, `ascii-art-${Date.now()}.png`);
    showToast('PNG画像として保存しました');
    captureModal.classList.remove('open');
  });

  btnSnapTxt.addEventListener('click', () => {
    const text = engine.getTextOutput();
    if (text) {
      downloadTxt(text, `ascii-art-${Date.now()}.txt`);
      showToast('テキスト(.txt)として保存しました');
      captureModal.classList.remove('open');
    }
  });

  btnCopyTxt.addEventListener('click', async () => {
    const text = engine.getTextOutput();
    if (text) {
      const success = await copyTextToClipboard(text);
      if (success) {
        showToast('クリップボードにコピーしました');
        captureModal.classList.remove('open');
      }
    }
  });

  // Initial Engine Setup & Auto Start Camera
  updateEngineSettings();
  cameraManager.startCamera().catch(() => {
    showToast('カメラまたはファイルを選択してください');
  });
});
