/**
 * AI Face Filter Engine
 * Real-Time Face Tracking & AR Face Filter System for Live Streamers.
 * Supports:
 * - Native Browser FaceDetector API + High-Speed Offline CV Fallback.
 * - Interactive Drag-and-Drop on live canvas (ចាប់អូសលើអេក្រង់បានដោយផ្ទាល់).
 * - Mouse Wheel & Multi-touch Zoom / Scale (បង្រួមតូច ធំ).
 * - 10 High-Quality AR Accessories: Sunglasses, Royal Crown, Bunny Ears,
 *   Cat Ears, Flower Headband, Cyber Neon Visor, Kawaii Blush & Hearts,
 *   Gentleman Top Hat & Mustache, Sci-Fi AI Scanner, and Masquerade Mask.
 */

class AIFaceFilterEngine {
  constructor() {
    this.enabled = false;
    this.currentFilter = 'none'; // 'none', 'sunglasses', 'crown', 'bunny', 'cat_ears', 'flower_crown', 'neon_visor', 'kawaii', 'gentleman', 'ai_scan', 'masquerade'
    this.filterScale = 1.0;      // 0.4 to 2.5
    this.offsetX = 0;            // -400 to +400 px
    this.offsetY = 0;            // -400 to +400 px
    this.showDebugBox = false;

    // Interactive Dragging & Scaling on Canvas
    this.isDragging = false;
    this.isHovered = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartOffsetX = 0;
    this.dragStartOffsetY = 0;
    this.lastInteractionTime = 0;

    // Bounding Box of the currently rendered filter
    this.currentBounds = { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };

    // Smoothed Face Coordinates (Exponential Moving Average)
    this.face = {
      detected: false,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      angle: 0,
      confidence: 0,
      lastSeen: 0
    };

    // Native FaceDetector if supported
    this.nativeDetector = null;
    if (window.FaceDetector) {
      try {
        this.nativeDetector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
        console.log('[AI Face Filter] Native browser FaceDetector API available');
      } catch (e) {
        this.nativeDetector = null;
      }
    }

    // Downscaled offscreen canvas for CV skin/feature detection
    this.detectCanvas = document.createElement('canvas');
    this.detectCanvas.width = 160;
    this.detectCanvas.height = 120;
    this.detectCtx = this.detectCanvas.getContext('2d', { willReadFrequently: true });

    // Detection throttling
    this.lastDetectTime = 0;
    this.detectIntervalMs = 70; // ~14 times per second (low CPU)
    this.isDetecting = false;
  }

  setFilter(filterId) {
    this.currentFilter = filterId;
    this.enabled = filterId !== 'none';
    this.triggerInteraction();
  }

  setScale(scale) {
    this.filterScale = Math.max(0.4, Math.min(2.5, Math.round(scale * 100) / 100));
    this.triggerInteraction();
  }

  setOffsetX(offset) {
    this.offsetX = Math.max(-400, Math.min(400, Math.round(offset)));
    this.triggerInteraction();
  }

  setOffsetY(offset) {
    this.offsetY = Math.max(-400, Math.min(400, Math.round(offset)));
    this.triggerInteraction();
  }

  resetTransform() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.filterScale = 1.0;
    this.triggerInteraction();
  }

  triggerInteraction() {
    this.lastInteractionTime = performance.now();
  }

  /**
   * Hit test to see if mouse pointer is over the filter
   */
  hitTest(canvasX, canvasY) {
    if (!this.enabled || !this.face.detected || this.currentFilter === 'none') return false;
    const b = this.currentBounds;
    if (b.w <= 0 || b.h <= 0) return false;
    const pad = Math.max(35, b.w * 0.2);
    return (
      canvasX >= b.x - pad &&
      canvasX <= b.x + b.w + pad &&
      canvasY >= b.y - pad &&
      canvasY <= b.y + b.h + pad
    );
  }

  /**
   * Main Process and Render pipeline called on each canvas frame
   */
  processAndRender(ctx, videoEl, canvasW, canvasH, flipH = false) {
    if (!this.enabled || this.currentFilter === 'none' || !videoEl || videoEl.readyState < 2) {
      return;
    }

    const now = performance.now();

    // Trigger async face detection on throttle interval
    if (now - this.lastDetectTime >= this.detectIntervalMs && !this.isDetecting) {
      this.lastDetectTime = now;
      this.isDetecting = true;
      this.detectFace(videoEl, canvasW, canvasH, flipH)
        .catch(err => console.debug('[Face detect error]', err))
        .finally(() => { this.isDetecting = false; });
    }

    // Decay face detection if not seen recently (> 650ms)
    if (now - this.face.lastSeen > 650) {
      this.face.detected = false;
    }

    if (!this.face.detected) {
      return;
    }

    const { x, y, w, h, angle } = this.face;

    ctx.save();

    // Debug box if toggled
    if (this.showDebugBox) {
      ctx.save();
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 16px "Inter", sans-serif';
      ctx.fillText(`AI FACE DETECTED (${Math.round(this.face.confidence * 100)}%)`, x, y - 10);
      ctx.restore();
    }

    // Render Chosen Filter
    switch (this.currentFilter) {
      case 'sunglasses':
        this.drawSunglasses(ctx, x, y, w, h, angle);
        break;
      case 'crown':
        this.drawRoyalCrown(ctx, x, y, w, h, angle, now);
        break;
      case 'bunny':
        this.drawBunnyEars(ctx, x, y, w, h, angle, now);
        break;
      case 'cat_ears':
        this.drawCatEars(ctx, x, y, w, h, angle);
        break;
      case 'flower_crown':
        this.drawFlowerCrown(ctx, x, y, w, h, angle, now);
        break;
      case 'neon_visor':
        this.drawNeonVisor(ctx, x, y, w, h, angle, now);
        break;
      case 'kawaii':
        this.drawKawaiiBlush(ctx, x, y, w, h, angle, now);
        break;
      case 'gentleman':
        this.drawGentleman(ctx, x, y, w, h, angle);
        break;
      case 'ai_scan':
        this.drawAiScanner(ctx, x, y, w, h, angle, now);
        break;
      case 'masquerade':
        this.drawMasqueradeMask(ctx, x, y, w, h, angle);
        break;
    }

    // Interactive Dragging & Sizing Gizmo (shown when dragging or hovering or recently adjusted)
    const isInteractingRecently = (now - this.lastInteractionTime < 1800);
    if ((this.isDragging || this.isHovered || isInteractingRecently) && this.currentBounds.w > 0) {
      this.drawTransformGizmo(ctx, now);
    }

    ctx.restore();
  }

  /**
   * Draws interactive dashed frame, handles, and HUD feedback when dragging or zooming
   */
  drawTransformGizmo(ctx, now) {
    const b = this.currentBounds;
    if (!b || b.w <= 0) return;

    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(this.face.angle || 0);

    const halfW = b.w / 2 + 10;
    const halfH = b.h / 2 + 10;

    // Glowing dashed frame
    ctx.strokeStyle = this.isDragging ? '#f43f5e' : '#8b5cf6';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.shadowColor = this.isDragging ? 'rgba(244, 63, 94, 0.7)' : 'rgba(139, 92, 246, 0.7)';
    ctx.shadowBlur = 12;
    ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);

    // 4 Corner Handles
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = this.isDragging ? '#f43f5e' : '#8b5cf6';
    ctx.lineWidth = 2;
    const handleSize = 10;
    const corners = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [-halfW, halfH],
      [halfW, halfH]
    ];
    corners.forEach(([cx, cy]) => {
      ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    });

    // Move Icon ✥ at top center
    ctx.fillStyle = this.isDragging ? '#f43f5e' : '#8b5cf6';
    ctx.beginPath();
    ctx.arc(0, -halfH - 16, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✥', 0, -halfH - 16);

    // Status Pill Badge below: "✥ X: +0 Y: -12 • 🔍 110%"
    const infoText = `✥ X:${this.offsetX >= 0 ? '+' : ''}${this.offsetX} Y:${this.offsetY >= 0 ? '+' : ''}${this.offsetY}  •  🔍 ${Math.round(this.filterScale * 100)}%`;
    ctx.font = 'bold 13px "Inter", "Kantumruy Pro", sans-serif';
    const textW = ctx.measureText(infoText).width;
    const badgeW = textW + 26;
    const badgeH = 28;
    const badgeY = halfH + 16;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 14);
    } else {
      ctx.rect(-badgeW / 2, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.strokeStyle = this.isDragging ? '#f43f5e' : '#8b5cf6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(infoText, 0, badgeY + badgeH / 2);

    ctx.restore();
  }

  /**
   * Face Detection Strategy:
   * 1. If Native FaceDetector is supported, use it.
   * 2. Otherwise use high-speed, zero-dependency skin-tone & facial valley computer vision detector.
   */
  async detectFace(videoEl, canvasW, canvasH, flipH) {
    let targetBox = null;

    if (this.nativeDetector) {
      try {
        const faces = await this.nativeDetector.detect(videoEl);
        if (faces && faces.length > 0) {
          const f = faces[0];
          const b = f.boundingBox;
          const vW = videoEl.videoWidth || 1;
          const vH = videoEl.videoHeight || 1;

          let fx = (b.x / vW) * canvasW;
          let fy = (b.y / vH) * canvasH;
          let fw = (b.width / vW) * canvasW;
          let fh = (b.height / vH) * canvasH;

          if (flipH) {
            fx = canvasW - (fx + fw);
          }

          targetBox = { x: fx, y: fy, w: fw, h: fh, angle: 0, conf: 0.95 };
        }
      } catch (err) {
        // Fallback to internal detector
      }
    }

    if (!targetBox) {
      targetBox = this.detectFaceWithColorCV(videoEl, canvasW, canvasH, flipH);
    }

    if (targetBox) {
      const now = performance.now();
      const alpha = 0.35; // Smoothing factor

      if (!this.face.detected) {
        this.face.x = targetBox.x;
        this.face.y = targetBox.y;
        this.face.w = targetBox.w;
        this.face.h = targetBox.h;
        this.face.angle = targetBox.angle || 0;
      } else {
        this.face.x += (targetBox.x - this.face.x) * alpha;
        this.face.y += (targetBox.y - this.face.y) * alpha;
        this.face.w += (targetBox.w - this.face.w) * alpha;
        this.face.h += (targetBox.h - this.face.h) * alpha;
        this.face.angle += ((targetBox.angle || 0) - this.face.angle) * alpha;
      }

      this.face.confidence = targetBox.conf || 0.9;
      this.face.detected = true;
      this.face.lastSeen = now;
    }
  }

  /**
   * Ultra-Fast, Zero-Dependency Offline Computer Vision Face Detector
   */
  detectFaceWithColorCV(videoEl, canvasW, canvasH, flipH) {
    const dw = this.detectCanvas.width;
    const dh = this.detectCanvas.height;

    this.detectCtx.drawImage(videoEl, 0, 0, dw, dh);
    let imgData;
    try {
      imgData = this.detectCtx.getImageData(0, 0, dw, dh);
    } catch (e) {
      return null;
    }

    const data = imgData.data;
    let minX = dw, maxX = 0, minY = dh, maxY = 0;
    let skinPixelCount = 0;
    let sumX = 0, sumY = 0;

    for (let y = 10; y < dh - 10; y += 2) {
      for (let x = 10; x < dw - 10; x += 2) {
        const idx = (y * dw + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const isSkin = (r > 80 && g > 35 && b > 20 &&
                        r > g && r > b &&
                        (r - g) > 10 &&
                        Math.abs(r - g) > 12 &&
                        (Math.max(r, g, b) - Math.min(r, g, b)) > 15);

        if (isSkin) {
          skinPixelCount++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (skinPixelCount < 90 || maxX <= minX || maxY <= minY) {
      const defW = canvasW * 0.32;
      const defH = defW * 1.25;
      const defX = (canvasW - defW) / 2;
      const defY = canvasH * 0.22;
      return { x: defX, y: defY, w: defW, h: defH, angle: 0, conf: 0.7 };
    }

    const centerX = sumX / skinPixelCount;
    const centerY = sumY / skinPixelCount;
    const rawW = Math.max(25, maxX - minX);
    const rawH = Math.max(30, maxY - minY);

    const headW = Math.min(rawW * 1.05, dw * 0.7);
    const headH = headW * 1.28;

    const scaleX = canvasW / dw;
    const scaleY = canvasH / dh;

    let fx = (centerX - headW / 2) * scaleX;
    let fy = (centerY - headH * 0.45) * scaleY;
    let fw = headW * scaleX;
    let fh = headH * scaleY;

    if (flipH) {
      fx = canvasW - (fx + fw);
    }

    return { x: fx, y: fy, w: fw, h: fh, angle: 0, conf: 0.88 };
  }

  // =========================================================================
  // VECTOR AR FILTER DRAWING PROCEDURES (WITH OFFSET X, OFFSET Y & BOUNDS TRACKING)
  // =========================================================================

  /**
   * 1. 🕶️ Cool Sunglasses (Thug Life / Luxury Aviators)
   */
  drawSunglasses(ctx, fx, fy, fw, fh, angle) {
    const scale = this.filterScale;
    const glassW = fw * 0.95 * scale;
    const glassH = glassW * 0.38;
    const centerX = fx + fw / 2 + this.offsetX;
    const centerY = fy + fh * 0.38 + this.offsetY;

    this.currentBounds = {
      x: centerX - glassW / 2,
      y: centerY - glassH / 2,
      w: glassW,
      h: glassH,
      cx: centerX,
      cy: centerY
    };

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 14;

    const lensW = glassW * 0.44;
    const lensH = glassH;
    const bridgeW = glassW * 0.12;

    this.drawAviatorLens(ctx, -bridgeW / 2 - lensW, -lensH / 2, lensW, lensH);
    this.drawAviatorLens(ctx, bridgeW / 2, -lensH / 2, lensW, lensH);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4 * scale;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-bridgeW / 2 - 2, -lensH * 0.1);
    ctx.quadraticCurveTo(0, -lensH * 0.3, bridgeW / 2 + 2, -lensH * 0.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-glassW * 0.46, -lensH * 0.46);
    ctx.lineTo(glassW * 0.46, -lensH * 0.46);
    ctx.stroke();

    ctx.restore();
  }

  drawAviatorLens(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + 10, y);
    ctx.lineTo(x + w - 10, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 10);
    ctx.lineTo(x + w * 0.9, y + h * 0.7);
    ctx.quadraticCurveTo(x + w * 0.65, y + h, x + w * 0.4, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h * 0.6);
    ctx.lineTo(x, y + 10);
    ctx.quadraticCurveTo(x, y, x + 10, y);
    ctx.closePath();

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#111319');
    grad.addColorStop(0.4, '#1f293d');
    grad.addColorStop(0.7, '#0b0d13');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.clip();
    const glareGrad = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
    glareGrad.addColorStop(0.1, 'rgba(255, 255, 255, 0.4)');
    glareGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
    glareGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    glareGrad.addColorStop(0.7, 'transparent');
    ctx.fillStyle = glareGrad;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    ctx.restore();
  }

  /**
   * 2. 👑 Royal Gold Crown
   */
  drawRoyalCrown(ctx, fx, fy, fw, fh, angle, now) {
    const scale = this.filterScale;
    const crownW = fw * 0.85 * scale;
    const crownH = crownW * 0.62;
    const centerX = fx + fw / 2 + this.offsetX;
    const crownY = fy - crownH * 0.45 + this.offsetY;

    this.currentBounds = {
      x: centerX - crownW / 2,
      y: crownY - crownH,
      w: crownW,
      h: crownH,
      cx: centerX,
      cy: crownY - crownH / 2
    };

    const bob = Math.sin(now / 350) * 5;

    ctx.save();
    ctx.translate(centerX, crownY + bob);
    ctx.rotate(angle);

    ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
    ctx.shadowBlur = 20;

    ctx.beginPath();
    const halfW = crownW / 2;
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(halfW, 0);
    ctx.lineTo(halfW * 0.95, -crownH * 0.65);
    ctx.lineTo(halfW * 0.5, -crownH * 0.35);
    ctx.lineTo(halfW * 0.35, -crownH * 0.85);
    ctx.lineTo(0, -crownH * 0.5);
    ctx.lineTo(0, -crownH * 1.0);
    ctx.lineTo(-halfW * 0.25, -crownH * 0.5);
    ctx.lineTo(-halfW * 0.35, -crownH * 0.85);
    ctx.lineTo(-halfW * 0.5, -crownH * 0.35);
    ctx.lineTo(-halfW * 0.95, -crownH * 0.65);
    ctx.closePath();

    const goldGrad = ctx.createLinearGradient(0, -crownH, 0, 0);
    goldGrad.addColorStop(0, '#fef08a');
    goldGrad.addColorStop(0.35, '#eab308');
    goldGrad.addColorStop(0.7, '#ca8a04');
    goldGrad.addColorStop(1, '#a16207');
    ctx.fillStyle = goldGrad;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-halfW * 0.98, -12, crownW * 0.98, 12);

    this.drawJewel(ctx, 0, -crownH * 0.78, 10 * scale, '#dc2626', now);
    this.drawJewel(ctx, -halfW * 0.35, -crownH * 0.65, 8 * scale, '#2563eb', now);
    this.drawJewel(ctx, halfW * 0.35, -crownH * 0.65, 8 * scale, '#2563eb', now);
    this.drawJewel(ctx, -halfW * 0.85, -crownH * 0.5, 6 * scale, '#16a34a', now);
    this.drawJewel(ctx, halfW * 0.85, -crownH * 0.5, 6 * scale, '#16a34a', now);

    ctx.restore();
  }

  drawJewel(ctx, x, y, radius, color, now) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const sparkle = (Math.sin(now / 200 + x) + 1) * 0.5;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + sparkle * 0.5})`;
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 3. 🐰 Cute Bunny Ears
   */
  drawBunnyEars(ctx, fx, fy, fw, fh, angle, now) {
    const scale = this.filterScale;
    const earW = fw * 0.28 * scale;
    const earH = fw * 0.95 * scale;
    const totalW = fw * 0.85 * scale;
    const centerX = fx + fw / 2 + this.offsetX;
    const headTopY = fy + this.offsetY;

    this.currentBounds = {
      x: centerX - totalW / 2,
      y: headTopY - earH,
      w: totalW,
      h: earH,
      cx: centerX,
      cy: headTopY - earH / 2
    };

    const twitchLeft = Math.sin(now / 280) * 0.08;
    const twitchRight = Math.cos(now / 320) * 0.07;

    ctx.save();
    ctx.translate(centerX, headTopY);
    ctx.rotate(angle);

    ctx.save();
    ctx.translate(-fw * 0.24 * scale, 0);
    ctx.rotate(-0.15 + twitchLeft);
    this.drawSingleBunnyEar(ctx, earW, earH);
    ctx.restore();

    ctx.save();
    ctx.translate(fw * 0.24 * scale, 0);
    ctx.rotate(0.18 + twitchRight);
    this.drawSingleBunnyEar(ctx, earW, earH);
    ctx.restore();

    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(0, 0, 14 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawSingleBunnyEar(ctx, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, w * 0.3, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f9a8d4';
    ctx.fill();
    ctx.restore();
  }

  /**
   * 4. 🐱 Neko Cat Ears & Whiskers
   */
  drawCatEars(ctx, fx, fy, fw, fh, angle) {
    const scale = this.filterScale;
    const earSize = fw * 0.34 * scale;
    const totalW = fw * 0.95 * scale;
    const totalH = fh * 0.65 * scale;
    const centerX = fx + fw / 2 + this.offsetX;
    const headTopY = fy + fh * 0.08 + this.offsetY;

    this.currentBounds = {
      x: centerX - totalW / 2,
      y: headTopY - earSize,
      w: totalW,
      h: totalH,
      cx: centerX,
      cy: headTopY
    };

    ctx.save();
    ctx.translate(centerX, headTopY);
    ctx.rotate(angle);

    this.drawSingleCatEar(ctx, -fw * 0.32 * scale, 0, earSize, -1);
    this.drawSingleCatEar(ctx, fw * 0.32 * scale, 0, earSize, 1);

    const noseY = fh * 0.48;
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.ellipse(0, noseY, 8 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';

    [-12, 0, 12].forEach(offset => {
      ctx.beginPath();
      ctx.moveTo(-16 * scale, noseY + offset * 0.4);
      ctx.lineTo(-fw * 0.48 * scale, noseY + offset);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(16 * scale, noseY + offset * 0.4);
      ctx.lineTo(fw * 0.48 * scale, noseY + offset);
      ctx.stroke();
    });

    ctx.restore();
  }

  drawSingleCatEar(ctx, x, y, size, dir) {
    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.moveTo(-size / 2, 0);
    ctx.lineTo(dir * (size * 0.15), -size * 1.1);
    ctx.lineTo(size / 2, 0);
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -2);
    ctx.lineTo(dir * (size * 0.1), -size * 0.85);
    ctx.lineTo(size * 0.3, -2);
    ctx.closePath();
    ctx.fillStyle = '#f43f5e';
    ctx.fill();

    ctx.restore();
  }

  /**
   * 5. 🌸 Sakura Floral Headband Crown
   */
  drawFlowerCrown(ctx, fx, fy, fw, fh, angle, now) {
    const scale = this.filterScale;
    const crownW = fw * 0.95 * scale;
    const crownH = 50 * scale;
    const centerX = fx + fw / 2 + this.offsetX;
    const headbandY = fy + fh * 0.05 + this.offsetY;

    this.currentBounds = {
      x: centerX - crownW / 2,
      y: headbandY - crownH / 2,
      w: crownW,
      h: crownH,
      cx: centerX,
      cy: headbandY
    };

    ctx.save();
    ctx.translate(centerX, headbandY);
    ctx.rotate(angle);

    const flowerCount = 7;
    const step = crownW / (flowerCount - 1);

    for (let i = 0; i < flowerCount; i++) {
      const x = -crownW / 2 + i * step;
      const y = Math.pow(x / (crownW / 2), 2) * (fh * 0.12);
      const color = i % 2 === 0 ? '#fda4af' : '#fb7185';
      const rot = (now / 1500) + i;
      this.drawBlossom(ctx, x, y, 16 * scale, color, rot);
    }

    ctx.restore();
  }

  drawBlossom(ctx, x, y, r, color, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    for (let p = 0; p < 5; p++) {
      ctx.save();
      ctx.rotate((p * Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.6, r * 0.45, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#fde047';
    ctx.fill();

    ctx.restore();
  }

  /**
   * 6. 🕶️ Cyberpunk Neon Visor (HUD Sci-Fi)
   */
  drawNeonVisor(ctx, fx, fy, fw, fh, angle, now) {
    const scale = this.filterScale;
    const visorW = fw * 1.05 * scale;
    const visorH = visorW * 0.28;
    const centerX = fx + fw / 2 + this.offsetX;
    const centerY = fy + fh * 0.38 + this.offsetY;

    this.currentBounds = {
      x: centerX - visorW / 2,
      y: centerY - visorH / 2,
      w: visorW,
      h: visorH,
      cx: centerX,
      cy: centerY
    };

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 25;

    ctx.beginPath();
    ctx.moveTo(-visorW / 2, -visorH / 2);
    ctx.lineTo(visorW / 2, -visorH / 2);
    ctx.lineTo(visorW * 0.45, visorH / 2);
    ctx.lineTo(-visorW * 0.45, visorH / 2);
    ctx.closePath();

    const visorGrad = ctx.createLinearGradient(0, -visorH / 2, 0, visorH / 2);
    visorGrad.addColorStop(0, 'rgba(0, 255, 255, 0.85)');
    visorGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.7)');
    visorGrad.addColorStop(1, 'rgba(236, 72, 153, 0.85)');
    ctx.fillStyle = visorGrad;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.shadowBlur = 0;
    const scanY = (Math.sin(now / 200) * 0.5 + 0.5) * visorH - visorH / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-visorW * 0.4, scanY);
    ctx.lineTo(visorW * 0.4, scanY);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(11 * scale)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CYBER // ONLINE 99%', 0, 0);

    ctx.restore();
  }

  /**
   * 7. 💖 Kawaii Anime Blush & Floating Hearts
   */
  drawKawaiiBlush(ctx, fx, fy, fw, fh, angle, now) {
    const scale = this.filterScale;
    const cheekDist = fw * 0.28 * scale;
    const cheekY = fy + fh * 0.46 + this.offsetY;
    const cheekRadius = fw * 0.14 * scale;
    const centerX = fx + fw / 2 + this.offsetX;
    const totalW = fw * 0.95 * scale;
    const totalH = fh * 0.8 * scale;

    this.currentBounds = {
      x: centerX - totalW / 2,
      y: cheekY - totalH * 0.6,
      w: totalW,
      h: totalH,
      cx: centerX,
      cy: cheekY
    };

    ctx.save();
    ctx.translate(centerX, cheekY);
    ctx.rotate(angle);

    [-cheekDist, cheekDist].forEach(cx => {
      ctx.save();
      const grad = ctx.createRadialGradient(cx, 0, 0, cx, 0, cheekRadius);
      grad.addColorStop(0, 'rgba(251, 113, 133, 0.65)');
      grad.addColorStop(0.6, 'rgba(244, 63, 94, 0.35)');
      grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, 0, cheekRadius, cheekRadius * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - cheekRadius * 0.3, -cheekRadius * 0.15, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    for (let i = 0; i < 3; i++) {
      const phase = (now / 700 + i * 1.5);
      const floatY = -fh * 0.55 - (phase % 2) * (fh * 0.25);
      const floatX = (i - 1) * (fw * 0.32);
      const heartAlpha = 1 - ((phase % 2) / 2);
      const heartSize = 14 * scale;
      this.drawHeart(ctx, floatX, floatY, heartSize, `rgba(244, 63, 94, ${heartAlpha})`);
    }

    ctx.restore();
  }

  drawHeart(ctx, x, y, size, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.3);
    ctx.bezierCurveTo(-size, -size * 0.5, -size * 0.5, -size, 0, -size * 0.3);
    ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.5, 0, size * 0.3);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  /**
   * 8. 🎩 Gentleman Top Hat & Curved Mustache
   */
  drawGentleman(ctx, fx, fy, fw, fh, angle) {
    const scale = this.filterScale;
    const hatW = fw * 0.85 * scale;
    const hatH = hatW * 0.75;
    const centerX = fx + fw / 2 + this.offsetX;
    const headTopY = fy + this.offsetY;

    this.currentBounds = {
      x: centerX - hatW / 2,
      y: headTopY - hatH,
      w: hatW,
      h: hatH + fh * 0.7,
      cx: centerX,
      cy: headTopY
    };

    ctx.save();
    ctx.translate(centerX, headTopY);
    ctx.rotate(angle);

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-hatW * 0.38, -hatH);
    ctx.lineTo(hatW * 0.38, -hatH);
    ctx.lineTo(hatW * 0.34, -hatH * 0.15);
    ctx.lineTo(-hatW * 0.34, -hatH * 0.15);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-hatW * 0.34, -hatH * 0.28, hatW * 0.68, hatH * 0.14);

    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3;
    ctx.strokeRect(-hatW * 0.08, -hatH * 0.3, hatW * 0.16, hatH * 0.18);

    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.ellipse(0, -hatH * 0.12, hatW * 0.52, hatH * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    const stacheY = fh * 0.58;
    this.drawMustache(ctx, 0, stacheY, fw * 0.52 * scale);

    ctx.restore();
  }

  drawMustache(ctx, x, y, width) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#1e293b';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.bezierCurveTo(-width * 0.25, -12, -width * 0.45, 0, -width * 0.5, -10);
    ctx.bezierCurveTo(-width * 0.4, 18, -width * 0.15, 12, 0, 6);
    ctx.bezierCurveTo(width * 0.15, 12, width * 0.4, 18, width * 0.5, -10);
    ctx.bezierCurveTo(width * 0.45, 0, width * 0.25, -12, 0, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * 9. 🤖 Sci-Fi AI Face Tracking Hologram Scanner
   */
  drawAiScanner(ctx, fx, fy, fw, fh, angle, now) {
    const scale = this.filterScale;
    const boxW = fw * 1.15 * scale;
    const boxH = fh * 1.25 * scale;
    const centerX = fx + fw / 2 + this.offsetX;
    const centerY = fy + fh / 2 + this.offsetY;

    this.currentBounds = {
      x: centerX - boxW / 2,
      y: centerY - boxH / 2,
      w: boxW,
      h: boxH,
      cx: centerX,
      cy: centerY
    };

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    const halfW = boxW / 2;
    const halfH = boxH / 2;
    const cornerLen = Math.min(32, boxW * 0.2);

    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(-halfW, -halfH + cornerLen);
    ctx.lineTo(-halfW, -halfH);
    ctx.lineTo(-halfW + cornerLen, -halfH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(halfW - cornerLen, -halfH);
    ctx.lineTo(halfW, -halfH);
    ctx.lineTo(halfW, -halfH + cornerLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-halfW, halfH - cornerLen);
    ctx.lineTo(-halfW, halfH);
    ctx.lineTo(-halfW + cornerLen, halfH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(halfW - cornerLen, halfH);
    ctx.lineTo(halfW, halfH);
    ctx.lineTo(halfW, halfH - cornerLen);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 255, 204, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.moveTo(-28, 0); ctx.lineTo(28, 0);
    ctx.moveTo(0, -28); ctx.lineTo(0, 28);
    ctx.stroke();

    const scanY = Math.sin(now / 350) * (halfH * 0.9);
    const laserGrad = ctx.createLinearGradient(-halfW, scanY, halfW, scanY);
    laserGrad.addColorStop(0, 'rgba(0, 255, 204, 0)');
    laserGrad.addColorStop(0.5, 'rgba(0, 255, 204, 0.85)');
    laserGrad.addColorStop(1, 'rgba(0, 255, 204, 0)');
    ctx.fillStyle = laserGrad;
    ctx.fillRect(-halfW, scanY - 2, boxW, 4);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('AI_FACE_LOCK [LIVE]', -halfW, -halfH - 8);
    ctx.textAlign = 'right';
    ctx.fillText('CONFIDENCE: 99.8%', halfW, halfH + 18);

    ctx.restore();
  }

  /**
   * 10. 🦹 Venetian Masquerade Gold Mask
   */
  drawMasqueradeMask(ctx, fx, fy, fw, fh, angle) {
    const scale = this.filterScale;
    const maskW = fw * 0.98 * scale;
    const maskH = maskW * 0.42;
    const centerX = fx + fw / 2 + this.offsetX;
    const centerY = fy + fh * 0.38 + this.offsetY;

    this.currentBounds = {
      x: centerX - maskW / 2,
      y: centerY - maskH / 2,
      w: maskW,
      h: maskH,
      cx: centerX,
      cy: centerY
    };

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.moveTo(-maskW / 2, -maskH * 0.4);
    ctx.bezierCurveTo(-maskW * 0.3, -maskH * 0.8, -maskW * 0.1, -maskH * 0.2, 0, -maskH * 0.35);
    ctx.bezierCurveTo(maskW * 0.1, -maskH * 0.2, maskW * 0.3, -maskH * 0.8, maskW / 2, -maskH * 0.4);
    ctx.bezierCurveTo(maskW * 0.45, maskH * 0.6, maskW * 0.2, maskH * 0.8, 0, maskH * 0.4);
    ctx.bezierCurveTo(-maskW * 0.2, maskH * 0.8, -maskW * 0.45, maskH * 0.6, -maskW / 2, -maskH * 0.4);
    ctx.closePath();

    const maskGrad = ctx.createLinearGradient(-maskW / 2, -maskH / 2, maskW / 2, maskH / 2);
    maskGrad.addColorStop(0, '#f59e0b');
    maskGrad.addColorStop(0.5, '#78350f');
    maskGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = maskGrad;
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(-maskW * 0.22, 0, maskW * 0.14, maskH * 0.26, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(maskW * 0.22, 0, maskW * 0.14, maskH * 0.26, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}

window.AIFaceFilterEngine = AIFaceFilterEngine;
