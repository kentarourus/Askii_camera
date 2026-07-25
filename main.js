import { AsciiEngine, CHARACTER_SETS } from './asciiEngine.js';
import { CameraManager } from './cameraManager.js';
import { downloadPng, downloadTxt, copyTextToClipboard } from './exporter.js';

document.addEventListener('DOMContentLoaded', () => {
  // PWA Service Worker Registration
  let deferredPrompt = null;
  const btnInstallApp = document.getElementById('btnInstallApp');
  const iosInstallModal = document.getElementById('iosInstallModal');
  const btnCloseIosModal = document.getElementById('btnCloseIosModal');
  const btnConfirmIosGuide = document.getElementById('btnConfirmIosGuide');

  if ('serviceWorker' in navigator) {
    const swPath = new URL('./sw.js', import.meta.url).href;
    navigator.serviceWorker.register(swPath)
      .then(() => console.log('Service Worker Registered'))
      .catch(err => console.log('SW Registration failed: ', err));
  }

  // PWA Install Prompt Listener
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstallApp) btnInstallApp.classList.remove('hidden');
  });

  if (btnInstallApp) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

    if (!isStandalone) btnInstallApp.classList.remove('hidden');

    btnInstallApp.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('アプリをインストールしました！');
          btnInstallApp.classList.add('hidden');
        }
        deferredPrompt = null;
      } else if (isIOS) {
        iosInstallModal.classList.add('open');
      } else {
        showToast('ブラウザメニューから「ホーム画面に追加」でアプリ化できます');
      }
    });
  }

  if (btnCloseIosModal) btnCloseIosModal.addEventListener('click', () => iosInstallModal.classList.remove('open'));
  if (btnConfirmIosGuide) btnConfirmIosGuide.addEventListener('click', () => iosInstallModal.classList.remove('open'));

  // DOM Elements
  const asciiCanvas = document.getElementById('asciiCanvas');
  const sourceCanvas = document.getElementById('sourceCanvas');
  const webcamVideo = document.getElementById('webcamVideo');

  const fpsBadge = document.getElementById('fpsBadge');
  const cameraGrid = document.getElementById('cameraGrid');
  const shutterFlash = document.getElementById('shutterFlash');
  const canvasContainer = document.getElementById('canvasContainer');
  const dropOverlay = document.getElementById('dropOverlay');

  // Aspect Ratio Button
  const btnAspect = document.getElementById('btnAspect');
  const aspectLabel = document.getElementById('aspectLabel');
  const aspectModes = ['FULL', '16:9', '4:3', '1:1'];
  let currentAspectIdx = 0;

  // Buttons & Controls
  const btnToggleGrid = document.getElementById('btnToggleGrid');
  const btnSwitchCamera = document.getElementById('btnSwitchCamera');
  const btnToggleDrawer = document.getElementById('btnToggleDrawer');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnShutter = document.getElementById('btnShutter');
  const btnPause = document.getElementById('btnPause');
  const pauseIcon = document.getElementById('pauseIcon');
  const fileInput = document.getElementById('fileInput');

  // Quick Tune Bar & Floating Slider
  const quickTuneBar = document.querySelector('.quick-tune-bar');
  const quickSliderPopup = document.getElementById('quickSliderPopup');
  const quickSliderTitle = document.getElementById('quickSliderTitle');
  const quickSliderValue = document.getElementById('quickSliderValue');
  const quickSliderInput = document.getElementById('quickSliderInput');
  let currentActiveTune = 'brightness';

  // Mode Ribbon
  const modeRibbon = document.getElementById('modeRibbon');

  // Adjustment Drawer
  const adjustmentDrawer = document.getElementById('adjustmentDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');

  // Form Controls
  const charSetSelect = document.getElementById('charSetSelect');
  const customCharGroup = document.getElementById('customCharGroup');
  const customCharInput = document.getElementById('customCharInput');

  const customColorRow = document.getElementById('customColorRow');
  const bgColorInput = document.getElementById('bgColorInput');
  const textColorInput = document.getElementById('textColorInput');

  const ditherCheckbox = document.getElementById('ditherCheckbox');
  const shadowBoostSlider = document.getElementById('shadowBoostSlider');
  const shadowBoostVal = document.getElementById('shadowBoostVal');

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

  function updateEngineSettings() {
    let charSet = CHARACTER_SETS[charSetSelect.value];
    if (charSetSelect.value === 'custom') {
      charSet = customCharInput.value || '@%#*+=-:. ';
    }

    const currentAspectMode = aspectModes[currentAspectIdx].toLowerCase();

    engine.setOptions({
      cols: parseInt(resolutionSlider.value, 10),
      fontSize: parseInt(fontSizeSlider.value, 10),
      charAspect: parseFloat(charAspectSlider.value),
      charSet: charSet,
      colorMode: activeColorMode,
      frameAspect: currentAspectMode,
      dithering: ditherCheckbox.checked,
      shadowBoost: parseInt(shadowBoostSlider.value, 10),
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

  // ────────── Camera Pro Quick Tune Bar Logic ──────────
  const TUNE_MAP = {
    brightness: { title: '☀️ 明るさ', min: -100, max: 100, step: 5, target: brightnessSlider, targetVal: brightnessVal },
    shadow:     { title: '🌗 暗部補正', min: 0, max: 60, step: 2, target: shadowBoostSlider, targetVal: shadowBoostVal },
    contrast:   { title: '🌓 コントラスト', min: 0.5, max: 3.0, step: 0.05, target: contrastSlider, targetVal: contrastVal },
    saturation: { title: '🎨 鮮やかさ', min: 0.0, max: 3.0, step: 0.1, target: saturationSlider, targetVal: saturationVal },
    resolution: { title: '🔍 解像度', min: 40, max: 240, step: 5, target: resolutionSlider, targetVal: resolutionVal },
  };

  function setupQuickSlider(tuneKey) {
    const config = TUNE_MAP[tuneKey];
    if (!config) return;

    currentActiveTune = tuneKey;
    quickSliderTitle.textContent = config.title;
    quickSliderInput.min = config.min;
    quickSliderInput.max = config.max;
    quickSliderInput.step = config.step;
    quickSliderInput.value = config.target.value;
    quickSliderValue.textContent = config.target.value;
  }

  quickTuneBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tune-btn');
    if (!btn) return;

    const tuneKey = btn.dataset.tune;
    if (currentActiveTune === tuneKey && !quickSliderPopup.classList.contains('hidden')) {
      quickSliderPopup.classList.add('hidden');
      btn.classList.remove('active');
    } else {
      quickTuneBar.querySelectorAll('.tune-btn').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      setupQuickSlider(tuneKey);
      quickSliderPopup.classList.remove('hidden');
    }
  });

  quickSliderInput.addEventListener('input', () => {
    const config = TUNE_MAP[currentActiveTune];
    if (config) {
      config.target.value = quickSliderInput.value;
      config.targetVal.textContent = quickSliderInput.value;
      quickSliderValue.textContent = quickSliderInput.value;
      updateEngineSettings();
    }
  });

  // Aspect Ratio Cycle
  btnAspect.addEventListener('click', () => {
    currentAspectIdx = (currentAspectIdx + 1) % aspectModes.length;
    const modeName = aspectModes[currentAspectIdx];
    aspectLabel.textContent = modeName;
    showToast(`アスペクト比: ${modeName}`);
    updateEngineSettings();
  });

  // Mode Ribbon Select
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

  // Native Shutter Trigger
  btnShutter.addEventListener('click', () => {
    shutterFlash.classList.add('flash-active');
    setTimeout(() => {
      shutterFlash.classList.remove('flash-active');
    }, 100);

    modalPreviewCanvas.width = asciiCanvas.width;
    modalPreviewCanvas.height = asciiCanvas.height;
    const ctx = modalPreviewCanvas.getContext('2d');
    ctx.drawImage(asciiCanvas, 0, 0);

    captureModal.classList.add('open');
  });

  btnCloseModal.addEventListener('click', () => {
    captureModal.classList.remove('open');
  });

  // Top Bar Buttons
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

  // Drag & Drop
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

  // Drawer Controls Listeners
  bgColorInput.addEventListener('input', updateEngineSettings);
  textColorInput.addEventListener('input', updateEngineSettings);

  charSetSelect.addEventListener('change', () => {
    customCharGroup.style.display = charSetSelect.value === 'custom' ? 'flex' : 'none';
    updateEngineSettings();
  });
  customCharInput.addEventListener('input', updateEngineSettings);

  ditherCheckbox.addEventListener('change', updateEngineSettings);

  shadowBoostSlider.addEventListener('input', () => {
    shadowBoostVal.textContent = shadowBoostSlider.value;
    setupQuickSlider('shadow');
    updateEngineSettings();
  });

  saturationSlider.addEventListener('input', () => {
    saturationVal.textContent = saturationSlider.value;
    setupQuickSlider('saturation');
    updateEngineSettings();
  });

  gammaSlider.addEventListener('input', () => {
    gammaVal.textContent = gammaSlider.value;
    updateEngineSettings();
  });

  brightnessSlider.addEventListener('input', () => {
    brightnessVal.textContent = brightnessSlider.value;
    setupQuickSlider('brightness');
    updateEngineSettings();
  });

  contrastSlider.addEventListener('input', () => {
    contrastVal.textContent = contrastSlider.value;
    setupQuickSlider('contrast');
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
    setupQuickSlider('resolution');
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

  // Export Modal Actions
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

  // Window Resize
  window.addEventListener('resize', updateEngineSettings);

  // Initial Engine Setup & Auto Start Camera
  setupQuickSlider('brightness');
  updateEngineSettings();
  cameraManager.startCamera().catch(() => {
    showToast('カメラまたはファイルを選択してください');
  });
});
