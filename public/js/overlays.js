/**
 * Overlays & Graphics Compositor
 * Handles Lower Thirds, Scrolling Marquee Ticker, Badges, Promo Cards,
 * and Pinned YouTube Comments directly onto the Live Canvas.
 */

class OverlayManager {
  constructor() {
    // Lower Third Config
    this.lowerThird = {
      enabled: true,
      title: '🔴 PHEANG SA | កំពុងផ្សាយផ្ទាល់',
      subtitle: 'សូមស្វាគមន៍! សូមចុច Like & Subscribe ដើម្បីទទួលបានវីដេអូថ្មីៗ',
      style: 'youtube', // youtube, royal, emerald, gold, dark
      x: 60,
      y: 900
    };

    // Bottom Scrolling Ticker Config
    this.ticker = {
      enabled: true,
      text: '🎉 សូមស្វាគមន៍មកកាន់ការ Live! ទំនាក់ទំនងទូរស័ព្ទ៖ 012 345 678 | ABA: 000 123 456 (PHEANG SA) | Telegram: @pheangsa',
      speed: 2.5,
      bg: 'rgba(20, 20, 25, 0.9)',
      textColor: '#ffffff',
      x: 0
    };

    // Watermark / Corner Badge
    this.watermark = {
      enabled: true,
      text: 'LIVE 🔴 1080p HD',
      pos: 'top-right'
    };

    // Live Viewer Counter Badge Config (On-Screen Live Viewers Display)
    this.viewerCounter = {
      enabled: true,
      count: 0,
      pos: 'top-left', // top-left, top-right, bottom-left, bottom-right
      style: 'glass', // glass, youtube, facebook, emerald, gold
      label: 'កំពុងទស្សនា',
      format: 'number', // number, compact, raw
      showDot: true,
      showEye: true
    };

    // Promo / Product Card Carousel (1 to 5 items with smooth slide transitions)
    this.promo = {
      enabled: false,
      pos: 'top-left', // top-left, top-right, bottom-right
      slideDirection: 'left-to-right', // left-to-right, right-to-left, alternate
      autoRotate: true,
      rotateInterval: 6000,
      themeStyle: 'gold', // gold, emerald, ruby, royal, purple
      currentIndex: 0,
      nextIndex: 0,
      isTransitioning: false,
      transitionProgress: 0,
      transitionStartTime: 0,
      transitionDuration: 650,
      currentDirectionFactor: 1, // 1: left-to-right, -1: right-to-left
      lastSwitchTime: Date.now(),
      items: [
        {
          id: 1,
          badge: '🔥 ផលិតផល #1',
          title: '🔥 ផលិតផលទី ១៖ ឈុតប្រូម៉ូសិនពិសេស',
          price: '$19.99 (បញ្ចុះ 50%)',
          desc: '📦 ដឹកជញ្ជូនឥតគិតថ្លៃ | Inbox ឬខល 012 345 678',
          enabled: true
        },
        {
          id: 2,
          badge: '⚡ ផលិតផល #2',
          title: '⚡ ផលិតផលទី ២៖ ស្មាតហ្វូនស៊េរីថ្មី Pro',
          price: '$299.00 (ថែម Case + កាស)',
          desc: '🎁 ធានា ១ ឆ្នាំពេញពីក្រុមហ៊ុន | មានស្តុកស្រាប់',
          enabled: true
        },
        {
          id: 3,
          badge: '💎 ផលិតផល #3',
          title: '💎 ផលិតផលទី ៣៖ នាឡិកាដៃ Smart Watch',
          price: '$45.00 (បញ្ចុះតម្លៃ 30%)',
          desc: '💧 មិនជ្រាបទឹក វាស់ចង្វាក់បេះដូង និងកីឡា',
          enabled: true
        },
        {
          id: 4,
          badge: '🎧 ផលិតផល #4',
          title: '🎧 ផលិតផលទី ៤៖ កាសប៊្លូធូសឥតខ្សែ ANC',
          price: '$25.00 (សម្លេងបាសបុកពិរោះ)',
          desc: '🔋 ថ្មកាន់ ៣៦ ម៉ោង កាត់បន្ថយសម្លេងរំខាន',
          enabled: true
        },
        {
          id: 5,
          badge: '🎁 ផលិតផល #5',
          title: '🎁 ផលិតផលទី ៥៖ កាតាបស្ពាយការពារទឹក',
          price: '$15.00 (ទិញ ១ ថែម ១)',
          desc: '🎒 គុណភាពខ្ពស់ ប្រើបានយូរ ទាន់សម័យ',
          enabled: true
        }
      ]
    };

    // Thumbnail Cover / Standby Screen (រូបភាពគ្រប Thumbnail)
    this.thumbnailCover = {
      enabled: false,
      image: null,
      imageUrl: null,
      preset: 'starting', // starting, brb, podcast, shop, gaming
      mode: 'fullscreen', // fullscreen, pip
      title: '🔴 ការផ្សាយផ្ទាល់នឹងចាប់ផ្តើមឆាប់ៗ...',
      subtitle: 'សូមរង់ចាំបន្តិច! សូមកុំភ្លេចជួយ Like & Share ម្នាក់មួយ',
      darkness: 0.4
    };

    // Pinned Comment On Screen
    this.pinnedComment = null; // { author, text, avatar, timestamp }
  }

  setPinnedComment(comment) {
    this.pinnedComment = comment;
  }

  dismissPinnedComment() {
    this.pinnedComment = null;
  }

  /**
   * Main render method called on every animation frame
   */
  render(ctx, width, height) {
    // 0. Thumbnail Cover / Standby Screen (Cover Image)
    const isFullscreenCover = this.thumbnailCover && this.thumbnailCover.enabled && this.thumbnailCover.mode === 'fullscreen';
    if (this.thumbnailCover && this.thumbnailCover.enabled) {
      this.drawThumbnailCover(ctx, width, height);
    }

    // 1. Watermark / Corner Badge
    if (this.watermark.enabled) {
      this.drawWatermark(ctx, width, height);
    }

    // 1.5 Live Viewer Counter Badge (hide during fullscreen standby cover)
    if (this.viewerCounter && this.viewerCounter.enabled && !isFullscreenCover) {
      this.drawViewerCounter(ctx, width, height);
    }

    // 2. Promo / Product Card (hide during fullscreen standby cover)
    if (this.promo.enabled && !isFullscreenCover) {
      this.drawPromoCard(ctx, width, height);
    }

    // 3. Lower Third Banner (hide during fullscreen standby cover or if pinned comment)
    if (this.lowerThird.enabled && !this.pinnedComment && !isFullscreenCover) {
      this.drawLowerThird(ctx, width, height);
    }

    // 4. Pinned Comment Card (hide during fullscreen standby cover)
    if (this.pinnedComment && !isFullscreenCover) {
      this.drawPinnedComment(ctx, width, height);
    }

    // 5. Bottom Scrolling Ticker
    if (this.ticker.enabled) {
      this.drawTicker(ctx, width, height);
    }
  }

  drawWatermark(ctx, width, height) {
    const text = this.watermark.text || 'LIVE 🔴';
    ctx.save();
    ctx.font = 'bold 24px "Kantumruy Pro", "Inter", sans-serif';
    const textWidth = ctx.measureText(text).width;
    const paddingX = 24;
    const badgeW = textWidth + paddingX * 2;
    const badgeH = 50;

    let x = width - badgeW - 50;
    let y = 45;
    if (this.watermark.pos === 'top-left') {
      x = 50;
    }

    // Badge Background with soft shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(15, 18, 26, 0.82)';
    this.roundRect(ctx, x, y, badgeW, badgeH, 25);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + paddingX, y + badgeH / 2);

    ctx.restore();
  }

  drawViewerCounter(ctx, width, height) {
    if (!this.viewerCounter || !this.viewerCounter.enabled) return;

    const count = Math.max(0, Number(this.viewerCounter.count) || 0);
    const format = this.viewerCounter.format || 'number';
    let formattedCount = '';
    if (format === 'compact') {
      if (count >= 1000000) {
        formattedCount = (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      } else if (count >= 1000) {
        formattedCount = (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      } else {
        formattedCount = String(count);
      }
    } else {
      formattedCount = count.toLocaleString('en-US');
    }

    const labelText = this.viewerCounter.label ? String(this.viewerCounter.label).trim() : '';
    const style = this.viewerCounter.style || 'glass';
    const pos = this.viewerCounter.pos || 'top-left';
    const isVertical = height > width;

    ctx.save();

    // Responsive font size
    const fontSize = isVertical ? 22 : 24;
    ctx.font = `bold ${fontSize}px "Kantumruy Pro", "Inter", sans-serif`;

    // Measure widths
    const countW = ctx.measureText(formattedCount).width;
    let labelW = 0;
    if (labelText) {
      ctx.font = `${isVertical ? fontSize - 3 : fontSize - 2}px "Kantumruy Pro", "Inter", sans-serif`;
      labelW = ctx.measureText(' ' + labelText).width;
    }

    const dotRadius = 5;
    const dotGap = this.viewerCounter.showDot ? 20 : 0;
    const eyeWidth = this.viewerCounter.showEye ? 28 : 0;
    const paddingX = isVertical ? 18 : 22;
    const badgeH = isVertical ? 46 : 50;
    const badgeW = paddingX + dotGap + eyeWidth + countW + labelW + paddingX;

    // Responsive margin
    const margin = isVertical ? 30 : 50;
    let x = margin;
    let y = margin;

    // Smart collision avoidance with Watermark badge
    const watermarkActive = this.watermark && this.watermark.enabled;
    const watermarkPos = this.watermark ? this.watermark.pos : 'top-right';

    if (pos === 'top-left') {
      x = margin;
      y = (watermarkActive && watermarkPos === 'top-left') ? margin + 65 : margin;
    } else if (pos === 'top-right') {
      x = width - badgeW - margin;
      y = (watermarkActive && watermarkPos === 'top-right') ? margin + 65 : margin;
    } else if (pos === 'bottom-left') {
      const bottomOffset = this.ticker && this.ticker.enabled ? (isVertical ? 90 : 110) : (isVertical ? 40 : 60);
      x = margin;
      y = height - badgeH - bottomOffset;
    } else if (pos === 'bottom-right') {
      const bottomOffset = this.ticker && this.ticker.enabled ? (isVertical ? 90 : 110) : (isVertical ? 40 : 60);
      x = width - badgeW - margin;
      y = height - badgeH - bottomOffset;
    }

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;

    // Theme styles
    let bgGrad = ctx.createLinearGradient(x, y, x + badgeW, y + badgeH);
    let borderColor = 'rgba(255, 255, 255, 0.22)';
    let dotColor = '#ef4444';
    let textColor = '#ffffff';
    let countColor = '#ffffff';

    if (style === 'youtube') {
      bgGrad.addColorStop(0, 'rgba(220, 38, 38, 0.92)');
      bgGrad.addColorStop(1, 'rgba(185, 28, 28, 0.92)');
      borderColor = 'rgba(255, 255, 255, 0.35)';
      dotColor = '#ffffff';
    } else if (style === 'facebook') {
      bgGrad.addColorStop(0, 'rgba(24, 119, 242, 0.92)');
      bgGrad.addColorStop(1, 'rgba(29, 78, 216, 0.92)');
      borderColor = 'rgba(255, 255, 255, 0.35)';
      dotColor = '#ffffff';
    } else if (style === 'emerald') {
      bgGrad.addColorStop(0, 'rgba(5, 150, 105, 0.92)');
      bgGrad.addColorStop(1, 'rgba(4, 120, 87, 0.92)');
      borderColor = 'rgba(52, 211, 153, 0.45)';
      dotColor = '#34d399';
      countColor = '#a7f3d0';
    } else if (style === 'gold') {
      bgGrad.addColorStop(0, 'rgba(217, 119, 6, 0.92)');
      bgGrad.addColorStop(1, 'rgba(180, 83, 9, 0.92)');
      borderColor = 'rgba(251, 191, 36, 0.45)';
      dotColor = '#fbbf24';
      countColor = '#fef08a';
    } else {
      // Default: Modern Glass Dark
      bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.88)');
      bgGrad.addColorStop(1, 'rgba(30, 41, 59, 0.88)');
      borderColor = 'rgba(255, 255, 255, 0.2)';
      dotColor = '#ef4444';
    }

    // Draw pill background
    ctx.fillStyle = bgGrad;
    this.roundRect(ctx, x, y, badgeW, badgeH, badgeH / 2);
    ctx.fill();

    // Border stroke
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Content positioning
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    let curX = x + paddingX;
    const centerY = y + badgeH / 2;

    // Pulsing live dot
    if (this.viewerCounter.showDot) {
      const pulseTime = Date.now() / 320;
      const pulseRadius = dotRadius + Math.sin(pulseTime) * 2;
      const pulseAlpha = 0.35 + 0.35 * Math.sin(pulseTime);

      // Outer glow
      ctx.beginPath();
      ctx.arc(curX + dotRadius, centerY, Math.max(dotRadius, pulseRadius + 3), 0, Math.PI * 2);
      ctx.fillStyle = dotColor === '#ffffff' ? `rgba(255, 255, 255, ${pulseAlpha})` : `rgba(239, 68, 68, ${pulseAlpha})`;
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(curX + dotRadius, centerY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();

      curX += dotGap;
    }

    // Eye Emoji / Icon
    if (this.viewerCounter.showEye) {
      ctx.font = `${isVertical ? 18 : 20}px sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';
      ctx.fillText('👁️', curX, centerY);
      curX += eyeWidth;
    }

    // Count Number (Bold)
    ctx.font = `bold ${fontSize}px "Kantumruy Pro", "Inter", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = countColor;
    ctx.fillText(formattedCount, curX, centerY);
    curX += countW;

    // Label Text
    if (labelText) {
      ctx.fillStyle = textColor;
      ctx.font = `${isVertical ? fontSize - 3 : fontSize - 2}px "Kantumruy Pro", "Inter", sans-serif`;
      ctx.fillText(' ' + labelText, curX, centerY);
    }

    ctx.restore();
  }

  drawLowerThird(ctx, width, height) {
    const title = this.lowerThird.title || '';
    const subtitle = this.lowerThird.subtitle || '';
    if (!title && !subtitle) return;

    ctx.save();

    const isVertical = height > width;
    const bottomOffset = this.ticker.enabled ? (isVertical ? 85 : 110) : (isVertical ? 40 : 60);
    const startX = isVertical ? 30 : 60;

    // Font styles
    ctx.font = isVertical ? 'bold 28px "Kantumruy Pro", "Inter", sans-serif' : 'bold 32px "Kantumruy Pro", "Inter", sans-serif';
    const titleWidth = ctx.measureText(title).width;

    ctx.font = isVertical ? '20px "Kantumruy Pro", "Battambang", sans-serif' : '22px "Kantumruy Pro", "Battambang", sans-serif';
    const subWidth = ctx.measureText(subtitle).width;

    const bannerW = isVertical ? (width - 60) : Math.min(width - 120, Math.max(titleWidth, subWidth, 420) + 70);
    const bannerH = isVertical ? 110 : 100;
    const startY = height - bottomOffset - bannerH;

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;

    // Theme Gradients
    let grad = ctx.createLinearGradient(startX, startY, startX + bannerW, startY + bannerH);
    let accentColor = '#ff0033';

    switch (this.lowerThird.style) {
      case 'royal':
        grad.addColorStop(0, 'rgba(15, 32, 67, 0.95)');
        grad.addColorStop(1, 'rgba(26, 75, 160, 0.95)');
        accentColor = '#3b82f6';
        break;
      case 'emerald':
        grad.addColorStop(0, 'rgba(6, 44, 30, 0.95)');
        grad.addColorStop(1, 'rgba(16, 120, 80, 0.95)');
        accentColor = '#10b981';
        break;
      case 'gold':
        grad.addColorStop(0, 'rgba(45, 30, 10, 0.95)');
        grad.addColorStop(1, 'rgba(130, 95, 25, 0.95)');
        accentColor = '#f59e0b';
        break;
      case 'dark':
        grad.addColorStop(0, 'rgba(18, 20, 28, 0.92)');
        grad.addColorStop(1, 'rgba(30, 35, 48, 0.92)');
        accentColor = '#64748b';
        break;
      case 'youtube':
      default:
        grad.addColorStop(0, 'rgba(26, 14, 18, 0.96)');
        grad.addColorStop(1, 'rgba(180, 15, 40, 0.95)');
        accentColor = '#ff0033';
        break;
    }

    // Draw main container
    ctx.fillStyle = grad;
    this.roundRect(ctx, startX, startY, bannerW, bannerH, 16);
    ctx.fill();

    // Accent line bar on the left
    ctx.fillStyle = accentColor;
    this.roundRect(ctx, startX, startY, 8, bannerH, { tl: 16, bl: 16, tr: 0, br: 0 });
    ctx.fill();

    // Draw Text
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = isVertical ? 'bold 27px "Kantumruy Pro", "Inter", sans-serif' : 'bold 30px "Kantumruy Pro", "Inter", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(this.truncateText(ctx, title, bannerW - 50), startX + 24, startY + 16);

    ctx.fillStyle = 'rgba(240, 243, 246, 0.88)';
    ctx.font = isVertical ? '19px "Kantumruy Pro", "Battambang", sans-serif' : '21px "Kantumruy Pro", "Battambang", sans-serif';
    ctx.fillText(this.truncateText(ctx, subtitle, bannerW - 50), startX + 24, startY + 58);

    ctx.restore();
  }

  drawPinnedComment(ctx, width, height) {
    if (!this.pinnedComment) return;

    ctx.save();
    const isVertical = height > width;
    const bottomOffset = this.ticker.enabled ? (isVertical ? 85 : 120) : (isVertical ? 40 : 60);
    const startX = isVertical ? 30 : 60;
    const bannerW = isVertical ? (width - 60) : Math.min(width - 120, 880);
    const bannerH = 135;
    const startY = height - bottomOffset - bannerH;

    // Card background
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;

    const bgGrad = ctx.createLinearGradient(startX, startY, startX + bannerW, startY + bannerH);
    bgGrad.addColorStop(0, 'rgba(18, 22, 33, 0.96)');
    bgGrad.addColorStop(1, 'rgba(28, 34, 52, 0.96)');
    ctx.fillStyle = bgGrad;
    this.roundRect(ctx, startX, startY, bannerW, bannerH, 18);
    ctx.fill();

    // Red left accent badge
    ctx.fillStyle = '#ff0033';
    this.roundRect(ctx, startX, startY, 10, bannerH, { tl: 18, bl: 18, tr: 0, br: 0 });
    ctx.fill();

    // "LIVE COMMENT" pill tag
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff0033';
    this.roundRect(ctx, startX + 26, startY + 14, 150, 26, 13);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Inter", "Kantumruy Pro", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('📌 LIVE COMMENT', startX + 40, startY + 27);

    // Avatar Circle
    const avatarX = startX + 54;
    const avatarY = startY + 82;
    const avatarR = 26;

    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (this.pinnedComment.author || 'U').charAt(0).toUpperCase();
    ctx.fillText(initial, avatarX, avatarY);

    // Author Name
    ctx.textAlign = 'left';
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 22px "Kantumruy Pro", "Inter", sans-serif';
    ctx.fillText(this.pinnedComment.author || 'Anonymous', startX + 96, startY + 68);

    // Comment Body
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px "Kantumruy Pro", "Battambang", sans-serif';
    const maxTextW = bannerW - 120;
    const commentBody = this.pinnedComment.text || '';
    ctx.fillText(this.truncateText(ctx, commentBody, maxTextW), startX + 96, startY + 100);

    ctx.restore();
  }

  drawTicker(ctx, width, height) {
    const text = this.ticker.text || '';
    if (!text) return;

    ctx.save();
    const tickerH = 54;
    const tickerY = height - tickerH;

    // Background Bar
    ctx.fillStyle = this.ticker.bg || 'rgba(15, 18, 25, 0.92)';
    ctx.fillRect(0, tickerY, width, tickerH);

    // Subtle top border line
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(0, tickerY, width, 1.5);

    // Left Ticker Label Pill
    const labelW = 120;
    ctx.fillStyle = '#ff0033';
    ctx.fillRect(0, tickerY, labelW, tickerH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Inter", "Kantumruy Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📢 ដំណឹង', labelW / 2, tickerY + tickerH / 2);

    // Scrolling text area with clipping
    ctx.save();
    ctx.beginPath();
    ctx.rect(labelW + 15, tickerY, width - labelW - 15, tickerH);
    ctx.clip();

    ctx.font = '24px "Kantumruy Pro", "Battambang", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.ticker.textColor || '#ffffff';

    const textWidth = ctx.measureText(text).width;
    const loopSpacing = 200;

    // Update position
    this.ticker.x -= this.ticker.speed;
    if (this.ticker.x < -(textWidth + loopSpacing)) {
      this.ticker.x = 0;
    }

    const drawX = labelW + 20 + this.ticker.x;
    const drawY = tickerY + tickerH / 2 + 1;

    // Draw main text + repeated text for seamless infinite loop
    ctx.fillText(text, drawX, drawY);
    ctx.fillText(text, drawX + textWidth + loopSpacing, drawY);

    ctx.restore();
    ctx.restore();
  }

  switchPromoItem(targetIndex, customDirection = null) {
    if (!this.promo.items || this.promo.items.length === 0) return;
    if (targetIndex < 0 || targetIndex >= this.promo.items.length) return;
    if (targetIndex === this.promo.currentIndex && !this.promo.isTransitioning) return;

    let dirFactor = 1;
    if (customDirection === 'right-to-left' || (!customDirection && this.promo.slideDirection === 'right-to-left')) {
      dirFactor = -1;
    } else if (customDirection === 'left-to-right' || (!customDirection && this.promo.slideDirection === 'left-to-right')) {
      dirFactor = 1;
    } else if (this.promo.slideDirection === 'alternate') {
      dirFactor = (this.promo.currentDirectionFactor || 1) * -1;
    } else {
      dirFactor = targetIndex > this.promo.currentIndex ? -1 : 1;
    }

    this.promo.nextIndex = targetIndex;
    this.promo.currentDirectionFactor = dirFactor;
    this.promo.isTransitioning = true;
    this.promo.transitionStartTime = performance.now();
  }

  nextPromoItem() {
    if (!this.promo.items || this.promo.items.length <= 1) return;
    const total = this.promo.items.length;
    let next = (this.promo.currentIndex + 1) % total;
    let attempts = 0;
    while (!this.promo.items[next].enabled && attempts < total) {
      next = (next + 1) % total;
      attempts++;
    }
    const dir = this.promo.slideDirection === 'alternate' ? null : (this.promo.slideDirection === 'left-to-right' ? 'left-to-right' : 'right-to-left');
    this.switchPromoItem(next, dir);
  }

  prevPromoItem() {
    if (!this.promo.items || this.promo.items.length <= 1) return;
    const total = this.promo.items.length;
    let prev = (this.promo.currentIndex - 1 + total) % total;
    let attempts = 0;
    while (!this.promo.items[prev].enabled && attempts < total) {
      prev = (prev - 1 + total) % total;
      attempts++;
    }
    const dir = this.promo.slideDirection === 'alternate' ? null : (this.promo.slideDirection === 'left-to-right' ? 'right-to-left' : 'left-to-right');
    this.switchPromoItem(prev, dir);
  }

  getPromoTheme(style) {
    switch (style) {
      case 'emerald':
        return {
          border: '#10b981',
          glow: 'rgba(16, 185, 129, 0.6)',
          badgeBg: 'rgba(16, 185, 129, 0.25)',
          badgeText: '#6ee7b7',
          price: '#34d399'
        };
      case 'ruby':
        return {
          border: '#ef4444',
          glow: 'rgba(239, 68, 68, 0.6)',
          badgeBg: 'rgba(239, 68, 68, 0.25)',
          badgeText: '#fca5a5',
          price: '#f87171'
        };
      case 'royal':
        return {
          border: '#3b82f6',
          glow: 'rgba(59, 130, 246, 0.6)',
          badgeBg: 'rgba(59, 130, 246, 0.25)',
          badgeText: '#93c5fd',
          price: '#60a5fa'
        };
      case 'purple':
        return {
          border: '#a855f7',
          glow: 'rgba(168, 85, 247, 0.6)',
          badgeBg: 'rgba(168, 85, 247, 0.25)',
          badgeText: '#d8b4fe',
          price: '#c084fc'
        };
      case 'gold':
      default:
        return {
          border: '#f59e0b',
          glow: 'rgba(245, 158, 11, 0.6)',
          badgeBg: 'rgba(245, 158, 11, 0.25)',
          badgeText: '#fde68a',
          price: '#fbbf24'
        };
    }
  }

  drawSinglePromoCard(ctx, item, x, y, width, height, alpha, index, total, theme, isVertical) {
    if (!item || alpha <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // Outer Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // Background Card with Gradient
    const bgGrad = ctx.createLinearGradient(x, y, x + width, y + height);
    bgGrad.addColorStop(0, 'rgba(16, 20, 31, 0.96)');
    bgGrad.addColorStop(1, 'rgba(24, 30, 46, 0.96)');
    ctx.fillStyle = bgGrad;
    this.roundRect(ctx, x, y, width, height, 16);
    ctx.fill();

    // Border with Theme Color
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Subtle Glow Accent along top
    ctx.save();
    ctx.beginPath();
    this.roundRect(ctx, x + 2, y + 2, width - 4, 3, { tl: 14, tr: 14, bl: 0, br: 0 });
    ctx.fillStyle = theme.glow;
    ctx.fill();
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 0. Product Image Thumbnail (Left Side)
    const imgSize = isVertical ? 130 : 126;
    const imgX = x + 18;
    const imgY = y + Math.round((height - imgSize) / 2);
    const hasImage = item.image && item.image.complete && item.image.naturalWidth > 0;

    // Draw the image container box with rounded corners
    ctx.save();
    this.roundRect(ctx, imgX, imgY, imgSize, imgSize, 12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.clip(); // Strictly isolate product image inside rounded box

    if (hasImage) {
      // Draw uploaded product photo cropped to fit
      const img = item.image;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      let sWidth, sHeight, sx, sy;
      if (imgRatio > 1) {
        sHeight = img.naturalHeight;
        sWidth = img.naturalHeight;
        sx = (img.naturalWidth - sWidth) / 2;
        sy = 0;
      } else {
        sWidth = img.naturalWidth;
        sHeight = img.naturalWidth;
        sx = 0;
        sy = (img.naturalHeight - sHeight) / 2;
      }
      ctx.drawImage(img, sx, sy, sWidth, sHeight, imgX, imgY, imgSize, imgSize);
    } else {
      // Fallback stylish gradient box with product icon / emoji
      const iconGrad = ctx.createLinearGradient(imgX, imgY, imgX + imgSize, imgY + imgSize);
      iconGrad.addColorStop(0, 'rgba(30, 41, 59, 0.85)');
      iconGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      ctx.fillStyle = iconGrad;
      ctx.fillRect(imgX, imgY, imgSize, imgSize);

      const emojiMatch = (item.title || '').match(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/u);
      const iconChar = emojiMatch ? emojiMatch[0] : '🛍️';

      ctx.font = '52px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(iconChar, imgX + imgSize / 2, imgY + imgSize / 2);
    }
    ctx.restore();

    // Text content container strictly to the right of the image
    const contentX = imgX + imgSize + 18;
    const contentW = Math.max(100, (x + width) - contentX - 18);

    // 1. Badge Pill (Top Left of Content)
    const badgeText = item.badge || `🔥 ផលិតផល #${index + 1}`;
    ctx.font = 'bold 12px "Inter", "Kantumruy Pro", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const badgeW = ctx.measureText(badgeText).width + 18;
    const badgeH = 22;
    const badgeY = y + 15;

    ctx.fillStyle = theme.badgeBg;
    this.roundRect(ctx, contentX, badgeY, badgeW, badgeH, 11);
    ctx.fill();

    ctx.fillStyle = theme.badgeText;
    ctx.fillText(badgeText, contentX + 9, badgeY + badgeH / 2);

    // 2. Pagination Indicator (Top Right: Dots for <= 6 items, numeric pill for 7+ items)
    if (total <= 6) {
      const dotCount = Math.max(1, total);
      const dotSpacing = 12;
      const dotRadius = 4;
      const dotsStartX = x + width - 18 - (dotCount - 1) * dotSpacing;
      const dotsCenterY = y + 26;

      for (let i = 0; i < dotCount; i++) {
        const dotX = dotsStartX + i * dotSpacing;
        ctx.beginPath();
        ctx.arc(dotX, dotsCenterY, i === index ? dotRadius + 1.5 : dotRadius, 0, Math.PI * 2);
        if (i === index) {
          ctx.fillStyle = theme.border;
          ctx.shadowColor = theme.border;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fill();
        }
      }
    } else {
      const counterText = `${index + 1} / ${total}`;
      ctx.font = 'bold 12px "Inter", "Kantumruy Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cW = ctx.measureText(counterText).width + 16;
      const cH = 22;
      const cX = x + width - 18 - cW;
      const cY = y + 15;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      this.roundRect(ctx, cX, cY, cW, cH, 11);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = theme.price;
      ctx.fillText(counterText, cX + cW / 2, cY + cH / 2);
    }

    // 3. Clip Text Region strictly so NO text can EVER cross into the image
    ctx.save();
    ctx.beginPath();
    ctx.rect(contentX, y, contentW, height);
    ctx.clip();

    // 4. Product Title (bold Khmer font, strictly left-aligned)
    const titleY = y + 46;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = isVertical ? 'bold 24px "Kantumruy Pro", "Inter", sans-serif' : 'bold 20px "Kantumruy Pro", "Inter", sans-serif';
    const titleText = item.title || `ផលិតផលទី ${index + 1}`;
    ctx.fillText(this.truncateText(ctx, titleText, contentW), contentX, titleY);

    // 5. Product Price Tag (strictly left-aligned)
    const priceY = y + 78;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.price;
    ctx.font = isVertical ? 'bold 26px "Inter", "Kantumruy Pro", sans-serif' : 'bold 23px "Inter", "Kantumruy Pro", sans-serif';
    const priceText = item.price || '$0.00';
    ctx.fillText(this.truncateText(ctx, priceText, contentW), contentX, priceY);

    // 6. Details / Contact / Shipping (strictly left-aligned)
    const descY = y + 116;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 15px "Kantumruy Pro", "Battambang", sans-serif';
    const descText = item.desc || 'ទំនាក់ទំនងទិញ ឬ Inbox ឥឡូវនេះ';
    ctx.fillText(this.truncateText(ctx, descText, contentW), contentX, descY);

    ctx.restore(); // Restore text clipping
    ctx.restore(); // Restore single card
  }

  drawPromoCard(ctx, width, height) {
    if (!this.promo || !this.promo.enabled) return;

    if (!this.promo.items || this.promo.items.length === 0) {
      this.promo.items = [
        {
          id: 1,
          badge: '🔥 ផលិតផល #1',
          title: '🔥 ផលិតផលទី ១៖ ឈុតប្រូម៉ូសិនពិសេស',
          price: '$19.99 (បញ្ចុះ 50%)',
          desc: '📦 ដឹកជញ្ជូនឥតគិតថ្លៃ | Inbox ឬខល 012 345 678',
          enabled: true,
          image: null,
          imageUrl: null
        }
      ];
    }

    const items = this.promo.items;
    const enabledItems = items.filter(item => item.enabled);
    if (enabledItems.length === 0) return;

    const now = performance.now();

    // Auto-rotation handling
    if (this.promo.autoRotate && !this.promo.isTransitioning && enabledItems.length > 1) {
      const interval = this.promo.rotateInterval || 6000;
      if (Date.now() - (this.promo.lastSwitchTime || 0) >= interval) {
        this.nextPromoItem();
      }
    }

    ctx.save();
    const isVertical = height > width;
    const cardW = isVertical ? (width - 60) : 540;
    const cardH = 164;
    let baseX = isVertical ? 30 : 60;
    let baseY = 60;

    const pos = this.promo.pos || 'top-left';
    if (!isVertical) {
      if (pos === 'top-right') {
        baseX = width - cardW - 60;
      } else if (pos === 'bottom-right') {
        baseX = width - cardW - 60;
        baseY = height - (this.ticker.enabled ? 80 : 40) - cardH;
      }
    } else {
      if (pos === 'bottom-right') {
        baseY = height - (this.ticker.enabled ? 90 : 40) - cardH - 140;
      }
    }

    // Animation progress calculation
    let isAnim = false;
    let progress = 1;
    let dir = this.promo.currentDirectionFactor || 1; // 1: left-to-right (moves right), -1: right-to-left (moves left)

    if (this.promo.isTransitioning) {
      const elapsed = now - (this.promo.transitionStartTime || now);
      const duration = this.promo.transitionDuration || 650;
      progress = Math.min(1, elapsed / duration);
      if (progress >= 1) {
        this.promo.isTransitioning = false;
        this.promo.currentIndex = this.promo.nextIndex;
        this.promo.lastSwitchTime = Date.now();
        isAnim = false;
      } else {
        isAnim = true;
      }
    }

    // Ease-out cubic curve
    const ease = isAnim ? (1 - Math.pow(1 - progress, 3)) : 1;

    if (this.promo.currentIndex < 0 || this.promo.currentIndex >= items.length) {
      this.promo.currentIndex = 0;
    }
    const currentItem = items[this.promo.currentIndex];
    const theme = this.getPromoTheme(this.promo.themeStyle || 'gold');

    if (isAnim) {
      const nextItem = items[this.promo.nextIndex] || currentItem;
      const slideDistance = cardW + 60;

      // When dir === 1 (Left to Right):
      // Outgoing card slides to the right (+X), incoming card slides in from the left (-X to 0)
      // When dir === -1 (Right to Left):
      // Outgoing card slides to the left (-X), incoming card slides in from the right (+X to 0)
      const outOffsetX = dir * ease * slideDistance;
      const outAlpha = Math.max(0, 1 - ease);

      const inOffsetX = -dir * (1 - ease) * slideDistance;
      const inAlpha = Math.min(1, ease);

      // Draw outgoing card
      this.drawSinglePromoCard(ctx, currentItem, baseX + outOffsetX, baseY, cardW, cardH, outAlpha, this.promo.currentIndex, items.length, theme, isVertical);

      // Draw incoming card
      this.drawSinglePromoCard(ctx, nextItem, baseX + inOffsetX, baseY, cardW, cardH, inAlpha, this.promo.nextIndex, items.length, theme, isVertical);
    } else {
      // Static draw
      this.drawSinglePromoCard(ctx, currentItem, baseX, baseY, cardW, cardH, 1.0, this.promo.currentIndex, items.length, theme, isVertical);
    }

    ctx.restore();
  }

  drawThumbnailCover(ctx, width, height) {
    const cover = this.thumbnailCover;
    if (!cover) return;
    ctx.save();

    const isVert = width < height;
    const hasCustomImage = cover.image && cover.image.complete && cover.image.naturalWidth > 0;
    const showText = cover.showText !== false;

    if (cover.mode === 'fullscreen') {
      // 1. Draw Cover Image or Preset Background
      if (hasCustomImage) {
        const img = cover.image;
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const canvasRatio = width / height;

        let drawW, drawH, drawX, drawY;
        if (canvasRatio > imgRatio) {
          drawW = width;
          drawH = width / imgRatio;
          drawX = 0;
          drawY = (height - drawH) / 2;
        } else {
          drawH = height;
          drawW = height * imgRatio;
          drawX = (width - drawW) / 2;
          drawY = 0;
        }
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        // Draw Stylish Gradient Background based on preset
        const grad = ctx.createLinearGradient(0, 0, width, height);
        if (cover.preset === 'brb') {
          grad.addColorStop(0, '#1e1b4b');
          grad.addColorStop(0.5, '#0f172a');
          grad.addColorStop(1, '#020617');
        } else if (cover.preset === 'podcast') {
          grad.addColorStop(0, '#14532d');
          grad.addColorStop(0.5, '#052e16');
          grad.addColorStop(1, '#022c22');
        } else if (cover.preset === 'shop') {
          grad.addColorStop(0, '#701a75');
          grad.addColorStop(0.5, '#3b0764');
          grad.addColorStop(1, '#1e1b4b');
        } else if (cover.preset === 'gaming') {
          grad.addColorStop(0, '#7f1d1d');
          grad.addColorStop(0.5, '#1e1b4b');
          grad.addColorStop(1, '#09090b');
        } else {
          // 'starting' default
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(0.5, '#0f172a');
          grad.addColorStop(1, '#020617');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Subtle glowing center spotlight
        ctx.save();
        ctx.beginPath();
        const radGrad = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.min(width, height) * 0.45);
        radGrad.addColorStop(0, 'rgba(59, 130, 246, 0.28)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      // 2. Dark Overlay for high contrast readability
      const darkness = cover.darkness !== undefined ? cover.darkness : 0.4;
      if (darkness > 0 && (showText || !hasCustomImage)) {
        ctx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Render Standby Badge & Text
      if (showText && (cover.title || cover.subtitle)) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const centerY = isVert ? height * 0.46 : height * 0.48;

        // Glowing Live Soon Pill Badge
        let badgeText = cover.badgeText;
        if (!badgeText) {
          if (cover.preset === 'brb') badgeText = '☕ BE RIGHT BACK (សម្រាកបន្តិច)';
          else if (cover.preset === 'podcast') badgeText = '🎙️ LIVE PODCAST TALK';
          else if (cover.preset === 'shop') badgeText = '🛍️ MEGA LIVE SALE';
          else if (cover.preset === 'gaming') badgeText = '🎮 LIVE GAMING SHOW';
          else badgeText = '🔴 LIVE STARTING SOON (ផ្សាយផ្ទាល់ឆាប់ៗ)';
        }

        const badgeFontSize = isVert ? 18 : 22;
        ctx.font = `bold ${badgeFontSize}px "Inter", "Kantumruy Pro", sans-serif`;
        const badgeW = ctx.measureText(badgeText).width + 36;
        const badgeH = isVert ? 40 : 46;
        const badgeX = (width - badgeW) / 2;
        const badgeY = centerY - (isVert ? 82 : 96);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
        ctx.shadowBlur = 20;
        this.roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(badgeText, width / 2, badgeY + badgeH / 2);

        // Main Title
        if (cover.title) {
          const titleFontSize = isVert ? 36 : 50;
          ctx.font = `bold ${titleFontSize}px "Kantumruy Pro", "Inter", sans-serif`;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 24;
          ctx.fillStyle = '#ffffff';
          const maxTextW = width * 0.88;
          const displayTitle = this.truncateText(ctx, cover.title, maxTextW);
          ctx.fillText(displayTitle, width / 2, centerY);
        }

        // Subtitle
        if (cover.subtitle) {
          const subFontSize = isVert ? 22 : 26;
          ctx.font = `500 ${subFontSize}px "Battambang", "Inter", sans-serif`;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#93c5fd';
          const maxSubW = width * 0.88;
          const displaySub = this.truncateText(ctx, cover.subtitle, maxSubW);
          ctx.fillText(displaySub, width / 2, centerY + (isVert ? 58 : 68));
        }
      }
    } else if (cover.mode === 'pip') {
      // Picture-in-Picture mode
      const pipW = isVert ? Math.round(width * 0.42) : Math.round(width * 0.28);
      const pipH = Math.round(pipW * (9 / 16));
      const pipX = isVert ? 30 : 50;
      const pipY = isVert ? 30 : 50;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;

      this.roundRect(ctx, pipX, pipY, pipW, pipH, 12);
      ctx.stroke();

      ctx.save();
      this.roundRect(ctx, pipX, pipY, pipW, pipH, 12);
      ctx.clip();

      if (hasCustomImage) {
        ctx.drawImage(cover.image, pipX, pipY, pipW, pipH);
      } else {
        const miniGrad = ctx.createLinearGradient(pipX, pipY, pipX + pipW, pipY + pipH);
        miniGrad.addColorStop(0, '#1e1b4b');
        miniGrad.addColorStop(1, '#020617');
        ctx.fillStyle = miniGrad;
        ctx.fillRect(pipX, pipY, pipW, pipH);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🖼️ THUMBNAIL', pipX + pipW / 2, pipY + pipH / 2);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  }

  roundRect(ctx, x, y, width, height, radius) {
    if (typeof radius === 'number') {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
  }
}

window.OverlayManager = OverlayManager;
