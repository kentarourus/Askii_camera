import { AsciiEngine, CHARACTER_SETS } from './asciiEngine.js';
import { CameraManager } from './cameraManager.js';
import { downloadPng, downloadTxt, copyTextToClipboard } from './exporter.js';

document.addEventListener('DOMContentLoaded', () => {

  // ═══ PWA ═══
  let deferredPrompt = null;
  const btnInstall = document.getElementById('btnInstall');
  const iosModal = document.getElementById('iosModal');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('./sw.js', import.meta.url).href)
      .then(() => console.log('SW registered'))
      .catch(e => console.log('SW error:', e));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove('hidden');
  });

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!isStandalone) btnInstall.classList.remove('hidden');

  btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') { toast('アプリをインストールしました'); btnInstall.classList.add('hidden'); }
      deferredPrompt = null;
    } else if (isIOS) {
      iosModal.classList.add('open');
    } else {
      toast('ブラウザメニューから「ホーム画面に追加」でインストールできます');
    }
  });

  document.getElementById('btnCloseIos').addEventListener('click', () => iosModal.classList.remove('open'));
  document.getElementById('btnIosOk').addEventListener('click', () => iosModal.classList.remove('open'));

  // ═══ Core Elements ═══
  const asciiCanvas = document.getElementById('asciiCanvas');
  const sourceCanvas = document.getElementById('sourceCanvas');
  const webcam = document.getElementById('webcam');
  const fpsBadge = document.getElementById('fpsBadge');
  const gridOverlay = document.getElementById('gridOverlay');
  const shutterFlash = document.getElementById('shutterFlash');
  const dropZone = document.getElementById('dropZone');
  const viewfinder = document.getElementById('viewfinder');
  const toastEl = document.getElementById('toast');

  // ═══ Engine & Camera ═══
  const engine = new AsciiEngine(asciiCanvas, sourceCanvas);
  let currentSource = null;
  let isPaused = false;
  let animId = null;
  let activeMode = 'matrix';

  const camera = new CameraManager(
    webcam,
    (src, mode) => { currentSource = src; startLoop(); toast(mode === 'camera' ? 'カメラ起動' : 'メディア読み込み完了'); },
    (err) => toast(err)
  );

  // ═══ Render Loop ═══
  function render() {
    if (!isPaused && currentSource) {
      engine.process(currentSource);
      fpsBadge.textContent = `${engine.getFps()} FPS`;
    }
    animId = requestAnimationFrame(render);
  }
  function startLoop() { if (!animId) render(); }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  // ═══ Sync Settings → Engine ═══
  const $ = (id) => document.getElementById(id);

  function sync() {
    const charSetKey = $('charSetSel').value;
    let charSet = CHARACTER_SETS[charSetKey];
    if (charSetKey === 'custom') charSet = $('customCharInput').value || '@%#*+=-:. ';

    engine.setOptions({
      cols:          +$('sCols').value,
      fontSize:      +$('sFont').value,
      charAspect:    +$('sAspect').value,
      charSet,
      colorMode:     activeMode,
      frameAspect:   aspectModes[aspectIdx].toLowerCase(),
      dithering:     $('chkDither').checked,
      shadowLift:    +$('sShadow').value,
      brightness:    +$('sBright').value,
      contrast:      +$('sContrast').value,
      saturation:    +$('sSat').value,
      gamma:         +$('sGamma').value,
      edgeMode:      $('chkEdge').checked,
      edgeThreshold: +$('sEdge').value,
      invert:        $('chkInvert').checked,
      customBgColor: $('bgColor').value,
      customTextColor: $('textColor').value,
    });
  }

  // ═══ Aspect Ratio ═══
  const aspectModes = ['FULL', '16:9', '4:3', '1:1'];
  let aspectIdx = 0;

  $('btnAspect').addEventListener('click', () => {
    aspectIdx = (aspectIdx + 1) % aspectModes.length;
    $('aspectLabel').textContent = aspectModes[aspectIdx];
    toast(`比率: ${aspectModes[aspectIdx]}`);
    sync();
  });

  // ═══ Top Buttons ═══
  $('btnGrid').addEventListener('click', () => {
    gridOverlay.classList.toggle('hidden');
    $('btnGrid').classList.toggle('on');
  });

  $('btnFlip').addEventListener('click', async () => {
    await camera.switchCamera();
    toast('カメラ切替');
  });

  $('btnSettings').addEventListener('click', () => $('settingsDrawer').classList.toggle('open'));
  $('btnCloseDrawer').addEventListener('click', () => $('settingsDrawer').classList.remove('open'));

  $('btnFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => toast('全画面非対応'));
    } else {
      document.exitFullscreen();
    }
  });

  // ═══ Mode Ribbon ═══
  $('modeRibbon').addEventListener('click', (e) => {
    const chip = e.target.closest('.mode-chip');
    if (!chip) return;
    $('modeRibbon').querySelectorAll('.mode-chip').forEach(el => el.classList.remove('active'));
    chip.classList.add('active');
    activeMode = chip.dataset.mode;
    $('customColorField').style.display = activeMode === 'custom' ? 'block' : 'none';
    sync();
  });

  // ═══ Shutter ═══
  $('btnShutter').addEventListener('click', () => {
    shutterFlash.classList.add('active');
    setTimeout(() => shutterFlash.classList.remove('active'), 100);
    const pc = $('previewCanvas');
    pc.width = asciiCanvas.width;
    pc.height = asciiCanvas.height;
    pc.getContext('2d').drawImage(asciiCanvas, 0, 0);
    $('captureModal').classList.add('open');
  });

  $('btnCloseCapture').addEventListener('click', () => $('captureModal').classList.remove('open'));

  // ═══ Pause ═══
  $('btnPause').addEventListener('click', () => {
    isPaused = !isPaused;
    $('pauseIcon').innerHTML = isPaused
      ? '<path fill="currentColor" d="M8 5v14l11-7z"/>'
      : '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    toast(isPaused ? '一時停止' : '再開');
  });

  // ═══ File Input ═══
  $('fileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) camera.loadFile(e.target.files[0]);
  });

  // ═══ Drag & Drop ═══
  viewfinder.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
  viewfinder.addEventListener('dragleave', () => dropZone.classList.remove('active'));
  viewfinder.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    if (e.dataTransfer.files[0]) camera.loadFile(e.dataTransfer.files[0]);
  });

  // ═══ Drawer Slider Bindings ═══
  const sliders = [
    ['sShadow', 'vShadow'],
    ['sSat', 'vSat'],
    ['sGamma', 'vGamma'],
    ['sBright', 'vBright'],
    ['sContrast', 'vContrast'],
    ['sCols', 'vCols'],
    ['sFont', 'vFont'],
    ['sAspect', 'vAspect'],
    ['sEdge', 'vEdge'],
  ];
  for (const [sid, vid] of sliders) {
    $(sid).addEventListener('input', () => { $(vid).textContent = $(sid).value; sync(); });
  }

  $('chkDither').addEventListener('change', sync);
  $('chkInvert').addEventListener('change', sync);
  $('chkEdge').addEventListener('change', () => {
    $('edgeField').style.display = $('chkEdge').checked ? 'block' : 'none';
    sync();
  });

  $('charSetSel').addEventListener('change', () => {
    $('customCharField').style.display = $('charSetSel').value === 'custom' ? 'block' : 'none';
    sync();
  });
  $('customCharInput').addEventListener('input', sync);
  $('bgColor').addEventListener('input', sync);
  $('textColor').addEventListener('input', sync);

  // ═══ Export ═══
  $('btnSavePng').addEventListener('click', () => {
    downloadPng(asciiCanvas, `ascii-${Date.now()}.png`);
    toast('PNG保存完了');
    $('captureModal').classList.remove('open');
  });

  $('btnSaveTxt').addEventListener('click', () => {
    const txt = engine.getTextOutput();
    if (txt) { downloadTxt(txt, `ascii-${Date.now()}.txt`); toast('TXT保存完了'); $('captureModal').classList.remove('open'); }
  });

  $('btnCopy').addEventListener('click', async () => {
    const txt = engine.getTextOutput();
    if (txt && await copyTextToClipboard(txt)) { toast('クリップボードにコピー'); $('captureModal').classList.remove('open'); }
  });

  // ═══ Resize ═══
  window.addEventListener('resize', sync);

  // ═══ Boot ═══
  sync();
  camera.startCamera().catch(() => toast('カメラ or ファイルを選択'));
});
