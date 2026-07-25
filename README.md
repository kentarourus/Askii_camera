# ASCII VISION - アスキーカメラ (Native Camera App & PWA) 📸

Webカメラの映像や画像をリアルタイムで美しい**アスキーアート（ASCII Art）**に変換・描画する、ネガティブアプリ感溢れるPWA（Progressive Web App）カメラアプリケーションです。

![ASCII Vision Banner](https://img.shields.io/badge/ASCII-VISION-00f2fe?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Ready-success?style=for-the-badge&logo=pwa)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)

---

## ✨ 主な特徴 & カメラアプリUI

### 1. 📱 完全にPWA（アプリ化）対応
- **ホーム画面に追加可能**: iOS / Android / PC でアプリとしてインストールして全画面スタンドアロンで起動可能。
- **オフライン動作**: サービスワーカー (`sw.js`) 内蔵により、オフライン環境でも動作可能。

### 2. 📸 本格ネイティブカメラ UI
- **Viewfinder 画面**: 画面いっぱいに広がるファインダーと3x3ルール・オブ・サード標準カメラグリッド線。
- **大型シャッターボタン**: 押すと画面フラッシュアニメーションとともに撮影が完了する本格的な操作感。
- **モード切り替えリボン**: 画面下部の横スライドリボンで `MATRIX`, `NEON CYBER`, `COLOR`, `MONO`, `AMBER`, `INVERT`, `CUSTOM` を直感的に切り替え。
- **スライドイン設定ドロワー**: ⚙️ボタンをタップすると下部からスムーズにせり上がるボトムシート形式の調整パネル。
- **キャプチャ・エクスポートモーダル**: 撮影後にポップアップでPNG保存・.txt保存・コピーがすぐに実行可能。

---

## 🎛️ 詳細なチューニングパラメータ
- **鮮やかさ (Saturation)**: スライダー調整 (`0.0` 〜 `3.0`)
- **ガンマ補正 (Gamma)**: 明暗トーンバランス (`0.2` 〜 `2.5`)
- **輪郭抽出 (Edge Mode)**: Sobel演算子によるエッジ強調モード
- **文字セット**: Standard, Detailed (70階調), Matrix, Blocks, Binary, Emoji, Custom
- **グリッド・解像度**: Column幅、フォントサイズ、文字縦横比

---

## 🚀 起動方法

```bash
# 開発サーバーの起動
npm run dev
# または
npx vite
```

### GitHub リポジトリ
[https://github.com/kentarourus/Askii_camera](https://github.com/kentarourus/Askii_camera)
