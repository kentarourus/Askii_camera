/**
 * Camera & File Media Stream Manager
 */

export class CameraManager {
  constructor(videoElement, onSourceReady, onError) {
    this.video = videoElement;
    this.onSourceReady = onSourceReady;
    this.onError = onError;

    this.stream = null;
    this.facingMode = 'user'; // 'user' or 'environment'
    this.currentMode = 'none'; // 'camera' or 'file'
    this.loadedImage = null;
    this.loadedVideo = null;
  }

  async startCamera() {
    this.stopAll();

    try {
      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      this.currentMode = 'camera';
      if (this.onSourceReady) this.onSourceReady(this.video, 'camera');
      return true;
    } catch (err) {
      console.error('Camera access error:', err);
      if (this.onError) {
        this.onError('カメラの起動に失敗しました。アクセスを許可するか、ファイル入力をお試しください。');
      }
      return false;
    }
  }

  async switchCamera() {
    if (this.currentMode !== 'camera') return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    await this.startCamera();
  }

  loadFile(file) {
    this.stopAll();

    if (!file) return;

    const fileUrl = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        this.loadedImage = img;
        this.currentMode = 'file-image';
        if (this.onSourceReady) this.onSourceReady(img, 'file-image');
      };
      img.src = fileUrl;
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        video.play();
        this.loadedVideo = video;
        this.currentMode = 'file-video';
        if (this.onSourceReady) this.onSourceReady(video, 'file-video');
      };
      video.src = fileUrl;
    }
  }

  stopAll() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.loadedVideo) {
      this.loadedVideo.pause();
      this.loadedVideo.src = '';
      this.loadedVideo = null;
    }

    this.video.srcObject = null;
    this.loadedImage = null;
    this.currentMode = 'none';
  }

  getCurrentSource() {
    if (this.currentMode === 'camera') return this.video;
    if (this.currentMode === 'file-image') return this.loadedImage;
    if (this.currentMode === 'file-video') return this.loadedVideo;
    return null;
  }
}
