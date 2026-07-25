import { AsciiEngine, CHARACTER_SETS } from './asciiEngine.js';
import { CameraManager } from './cameraManager.js';
import { downloadPng, downloadTxt, copyTextToClipboard } from './exporter.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const asciiCanvas = document.getElementById('asciiCanvas');
  const sourceCanvas = document.getElementById('sourceCanvas');
  const webcamVideo = document.getElementById('webcamVideo');

  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const screenWrapper = document.getElementById('screenWrapper');
  const canvasContainer = document.getElementById('canvasContainer');
  const dropOverlay = document.getElementById('dropOverlay');

  const btnStartCamera = document.getElementById('btnStartCamera');
  const btnSwitchCamera = document.getElementById('btnSwitchCamera');
  const cameraSwitchRow = document.getElementById('cameraSwitchRow');
  const fileInput = document.getElementById('fileInput');

  const btnPause = document.getElementById('btnPause');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnSnapPng = document.getElementById('btnSnapPng');
  const btnSnapTxt = document.getElementById('btnSnapTxt');
  const btnCopyTxt = document.getElementById('btnCopyTxt');

  // Form Controls
  const colorModeSelect = document.getElementById('colorMode');
  const charSetSelect = document.getElementById('charSetSelect');
  const customCharGroup = document.getElementById('customCharGroup');
  const customCharInput = document.getElementById('customCharInput');

  const resolutionSlider = document.getElementById('resolutionSlider');
  const resolutionVal = document.getElementById('resolutionVal');

  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeVal = document.getElementById('fontSizeVal');

  const brightnessSlider = document.getElementById('brightnessSlider');
  const brightnessVal = document.getElementById('brightnessVal');

  const contrastSlider = document.getElementById('contrastSlider');
  const contrastVal = document.getElementById('contrastVal');

  const invertCheckbox = document.getElementById('invertCheckbox');

  const toast = document.getElementById('toast');

  // State
  let isPaused = false;
  let animFrameId = null;
  let currentSource = null;

  // Initialize Engine & Camera
  const engine = new AsciiEngine(asciiCanvas, sourceCanvas);

  const cameraManager = new CameraManager(
    webcamVideo,
    (source, mode) => {
      currentSource = source;
      updateStatus(true, mode === 'camera' ? 'カメラ動作中' : 'ファイル再生中');
      if (mode === 'camera') {
        cameraSwitchRow.style.display = 'block';
        btnStartCamera.classList.add('active');
      } else {
        cameraSwitchRow.style.display = 'none';
        btnStartCamera.classList.remove('active');
      }
      startLoop();
    },
    (errMsg) => {
      showToast(errMsg);
      updateStatus(false, 'エラー');
    }
  );

  // Update Settings
  function updateEngineSettings() {
    let charSet = CHARACTER_SETS[charSetSelect.value];
    if (charSetSelect.value === 'custom') {
      charSet = customCharInput.value || '@%#*+=-:. ';
    }

    engine.setOptions({
      cols: parseInt(resolutionSlider.value, 10),
      fontSize: parseInt(fontSizeSlider.value, 10),
      charSet: charSet,
      colorMode: colorModeSelect.value,
      brightness: parseInt(brightnessSlider.value, 10),
      contrast: parseFloat(contrastSlider.value),
      invert: invertCheckbox.checked
    });
  }

  // Animation Loop
  function renderFrame() {
    if (!isPaused && currentSource) {
      engine.process(currentSource);
    }
    animFrameId = requestAnimationFrame(renderFrame);
  }

  function startLoop() {
    if (!animFrameId) {
      renderFrame();
    }
  }

  // Status & Toast Helper
  function updateStatus(active, text) {
    if (active) {
      statusDot.classList.add('active');
    } else {
      statusDot.classList.remove('active');
    }
    statusText.textContent = text;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // Event Listeners - Controls
  charSetSelect.addEventListener('change', () => {
    if (charSetSelect.value === 'custom') {
      customCharGroup.style.display = 'flex';
    } else {
      customCharGroup.style.display = 'none';
    }
    updateEngineSettings();
  });

  customCharInput.addEventListener('input', updateEngineSettings);
  colorModeSelect.addEventListener('change', updateEngineSettings);

  resolutionSlider.addEventListener('input', () => {
    resolutionVal.textContent = resolutionSlider.value;
    updateEngineSettings();
  });

  fontSizeSlider.addEventListener('input', () => {
    fontSizeVal.textContent = fontSizeSlider.value;
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

  invertCheckbox.addEventListener('change', updateEngineSettings);

  // Buttons - Source
  btnStartCamera.addEventListener('click', async () => {
    const success = await cameraManager.startCamera();
    if (success) {
      showToast('カメラを起動しました');
    }
  });

  btnSwitchCamera.addEventListener('click', async () => {
    await cameraManager.switchCamera();
    showToast('カメラを切り替えました');
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      cameraManager.loadFile(file);
      showToast(`${file.name} を読み込みました`);
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
      const file = e.dataTransfer.files[0];
      cameraManager.loadFile(file);
      showToast(`${file.name} を読み込みました`);
    }
  });

  // Action Buttons
  btnPause.addEventListener('click', () => {
    isPaused = !isPaused;
    btnPause.textContent = isPaused ? '▶️' : '⏸️';
    btnPause.title = isPaused ? '再開' : '一時停止';
    showToast(isPaused ? '表示を一時停止しました' : '再生を再開しました');
  });

  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      screenWrapper.requestFullscreen().catch(err => {
        showToast('全画面表示に失敗しました');
      });
    } else {
      document.exitFullscreen();
    }
  });

  btnSnapPng.addEventListener('click', () => {
    downloadPng(asciiCanvas, `ascii-art-${Date.now()}.png`);
    showToast('PNG画像として保存しました');
  });

  btnSnapTxt.addEventListener('click', () => {
    const text = engine.getTextOutput();
    if (text) {
      downloadTxt(text, `ascii-art-${Date.now()}.txt`);
      showToast('テキスト(.txt)として保存しました');
    } else {
      showToast('保存するテキストがありません');
    }
  });

  btnCopyTxt.addEventListener('click', async () => {
    const text = engine.getTextOutput();
    if (text) {
      const success = await copyTextToClipboard(text);
      if (success) {
        showToast('クリップボードにコピーしました');
      } else {
        showToast('コピーに失敗しました');
      }
    } else {
      showToast('コピーするテキストがありません');
    }
  });

  // Initial Setup
  updateEngineSettings();

  // Try auto starting camera on load
  cameraManager.startCamera().catch(() => {
    updateStatus(false, 'カメラまたはファイルを選択してください');
  });
});
