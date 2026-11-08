/**
 * Beauty Filters & Color Processing Pipeline
 * Provides real-time skin smoothing, glow, warmth, tint, and presets.
 */

class BeautyFilterEngine {
  constructor() {
    this.settings = {
      smooth: 45,        // 0 to 100
      brightness: 110,   // 60 to 150
      contrast: 105,     // 60 to 140
      saturation: 115,   // 50 to 160
      warmth: 10,        // -50 to 50
      rosy: 15           // 0 to 50
    };

    // Offscreen canvas for ultra-fast downscaled background blur & effects (320x180)
    this.tempCanvas = document.createElement('canvas');
    this.tempCanvas.width = 320;
    this.tempCanvas.height = 180;
    this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: false });

    this.presets = {
      natural: { smooth: 45, brightness: 110, contrast: 105, saturation: 115, warmth: 10, rosy: 15 },
      korea:   { smooth: 75, brightness: 120, contrast: 102, saturation: 125, warmth: 5,  rosy: 30 },
      warm:    { smooth: 40, brightness: 108, contrast: 110, saturation: 120, warmth: 35, rosy: 10 },
      cool:    { smooth: 35, brightness: 105, contrast: 115, saturation: 95,  warmth: -30,rosy: 5 },
      sharp:   { smooth: 15, brightness: 105, contrast: 125, saturation: 120, warmth: 0,  rosy: 5 },
      noir:    { smooth: 50, brightness: 100, contrast: 140, saturation: 0,   warmth: 0,  rosy: 0 }
    };
  }

  setParam(name, value) {
    if (this.settings.hasOwnProperty(name)) {
      this.settings[name] = Number(value);
    }
  }

  applyPreset(presetName) {
    if (this.presets[presetName]) {
      this.settings = { ...this.presets[presetName] };
      return this.settings;
    }
    return null;
  }

  reset() {
    this.settings = { ...this.presets.natural };
    return this.settings;
  }

  /**
   * Render video frame onto main target context with beauty pipeline applied.
   */
  render(targetCtx, videoEl, width, height, flipH = false) {
    if (!videoEl || videoEl.readyState < 2) return;

    const { smooth, brightness, contrast, saturation, warmth, rosy } = this.settings;

    targetCtx.save();

    // Horizontal mirror flip if enabled
    if (flipH) {
      targetCtx.translate(width, 0);
      targetCtx.scale(-1, 1);
    }

    // 1. Aspect ratio handling (Smart Blurred Background + Contain if ratios differ)
    const vW = videoEl.videoWidth || width;
    const vH = videoEl.videoHeight || height;
    const videoAspect = vW / vH;
    const canvasAspect = width / height;
    const aspectDiff = Math.abs(videoAspect - canvasAspect);

    const hueRotation = Math.round((warmth / 50) * 12);
    const baseFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hueRotation}deg)`;

    // Adapt offscreen buffer size to match orientation
    const isTargetVert = height > width;
    const reqTempW = isTargetVert ? 180 : 320;
    const reqTempH = isTargetVert ? 320 : 180;
    if (this.tempCanvas.width !== reqTempW || this.tempCanvas.height !== reqTempH) {
      this.tempCanvas.width = reqTempW;
      this.tempCanvas.height = reqTempH;
    }

    const scaleMode = this.scaleMode || 'fit'; // 'fit' (contain + blur background) or 'fill' (crop to fill screen)

    if (scaleMode === 'fill' && aspectDiff > 0.02) {
      // Zoom & crop to fill the entire canvas cleanly with no black or blurred bars
      const scaleFill = Math.max(width / vW, height / vH);
      const drawW = vW * scaleFill;
      const drawH = vH * scaleFill;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      targetCtx.filter = baseFilter;
      targetCtx.drawImage(videoEl, drawX, drawY, drawW, drawH);
      targetCtx.filter = 'none';

      if (smooth > 5) {
        const smoothFactor = smooth / 100;
        const blurRadius = Math.max(1, Math.round(smoothFactor * 3.5));
        targetCtx.save();
        targetCtx.globalAlpha = smoothFactor * 0.38;
        targetCtx.filter = `blur(${blurRadius}px) brightness(104%)`;
        targetCtx.drawImage(videoEl, drawX, drawY, drawW, drawH);
        targetCtx.restore();
      }
    } else if (aspectDiff > 0.04) {
      // A. Draw blurred cover background using low-overhead offscreen downscale with proper center-crop
      this.tempCtx.filter = 'blur(6px) brightness(45%) saturate(125%)';
      const bgScale = Math.max(reqTempW / vW, reqTempH / vH);
      const bgW = vW * bgScale;
      const bgH = vH * bgScale;
      const bgX = (reqTempW - bgW) / 2;
      const bgY = (reqTempH - bgH) / 2;
      this.tempCtx.drawImage(videoEl, bgX, bgY, bgW, bgH);
      this.tempCtx.filter = 'none';

      targetCtx.save();
      targetCtx.imageSmoothingEnabled = true;
      targetCtx.drawImage(this.tempCanvas, 0, 0, width, height);
      targetCtx.restore();

      // B. Foreground: Sharp contained video
      const scaleContain = Math.min(width / vW, height / vH);
      const drawW = vW * scaleContain;
      const drawH = vH * scaleContain;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      targetCtx.filter = baseFilter;
      targetCtx.drawImage(videoEl, drawX, drawY, drawW, drawH);
      targetCtx.filter = 'none';

      // Skin smoothing layer on foreground (lightweight blur)
      if (smooth > 5) {
        const smoothFactor = smooth / 100;
        const blurRadius = Math.max(1, Math.round(smoothFactor * 3.5));
        targetCtx.save();
        targetCtx.globalAlpha = smoothFactor * 0.38;
        targetCtx.filter = `blur(${blurRadius}px) brightness(104%)`;
        targetCtx.drawImage(videoEl, drawX, drawY, drawW, drawH);
        targetCtx.restore();
      }
    } else {
      // Direct full frame
      targetCtx.filter = baseFilter;
      targetCtx.drawImage(videoEl, 0, 0, width, height);
      targetCtx.filter = 'none';

      if (smooth > 5) {
        const smoothFactor = smooth / 100;
        const blurRadius = Math.max(1, Math.round(smoothFactor * 3.5));
        targetCtx.save();
        targetCtx.globalAlpha = smoothFactor * 0.38;
        targetCtx.filter = `blur(${blurRadius}px) brightness(104%)`;
        targetCtx.drawImage(videoEl, 0, 0, width, height);
        targetCtx.restore();
      }
    }

    // 3. Warmth / Temperature overlay
    if (warmth !== 0) {
      targetCtx.save();
      if (warmth > 0) {
        // Warm golden amber tint
        const warmAlpha = (warmth / 50) * 0.12;
        targetCtx.fillStyle = `rgba(255, 175, 75, ${warmAlpha})`;
        targetCtx.globalCompositeOperation = 'soft-light';
      } else {
        // Cool blue cinematic tint
        const coolAlpha = (Math.abs(warmth) / 50) * 0.14;
        targetCtx.fillStyle = `rgba(60, 130, 255, ${coolAlpha})`;
        targetCtx.globalCompositeOperation = 'soft-light';
      }
      targetCtx.fillRect(0, 0, width, height);
      targetCtx.restore();
    }

    // 4. Rosy Blush & Beauty Glow tint
    if (rosy > 0) {
      targetCtx.save();
      const rosyAlpha = (rosy / 50) * 0.14;
      targetCtx.fillStyle = `rgba(255, 90, 140, ${rosyAlpha})`;
      targetCtx.globalCompositeOperation = 'soft-light';
      targetCtx.fillRect(0, 0, width, height);
      targetCtx.restore();
    }

    targetCtx.restore();
  }
}

window.BeautyFilterEngine = BeautyFilterEngine;
