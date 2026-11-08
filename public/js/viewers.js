/**
 * Live Real Viewer Counter Manager (មនុស្សពិត ១០០% ដែលកំពុងមើល Live)
 * Real-time tracking of genuine human viewers across:
 * 1. 🔴 YouTube Live Concurrent Viewers (via YouTube Live link / Channel / Video ID)
 * 2. 🔵 Facebook Live Concurrent Viewers (via Facebook Live URL / Video ID)
 * 3. 🌐 Local Network / Web Viewers (via /watch live player on Wi-Fi / LAN)
 * 4. Combined Real Total displayed on Live Canvas Overlay & Studio Header
 */

class ViewerManager {
  constructor(options = {}) {
    this.overlayManager = options.overlayManager || null;
    this.showToast = options.showToast || ((msg) => console.log(msg));
    this.onCountChange = options.onCountChange || (() => {});

    // Load saved settings
    const saved = this.loadConfig();

    // Default mode is 'real' (មនុស្សពិត)
    this.mode = saved.mode || 'real'; // 'real', 'auto', 'manual'
    this.count = saved.count !== undefined ? Number(saved.count) : 0;
    this.isLive = false;
    this.trendDelta = 0;

    // Real Human Viewers Breakdown State
    this.realStats = {
      youtube: 0,
      facebook: 0,
      web: 0,
      total: 0,
      ytStatus: 'idle', // 'idle', 'connecting', 'live', 'not_found'
      fbStatus: 'idle',
      ytTitle: '',
      ytVideoId: '',
      lastUpdated: null
    };

    // YouTube Live Config
    this.ytConfig = {
      videoIdOrUrl: saved.ytVideoIdOrUrl || '',
      apiKey: saved.ytApiKey || '',
      autoRefresh: saved.ytAutoRefresh !== undefined ? !!saved.ytAutoRefresh : true,
      refreshInterval: 12 // seconds
    };

    // Facebook Live Config
    this.fbConfig = {
      videoUrlOrId: saved.fbVideoUrlOrId || '',
      accessToken: saved.fbAccessToken || '',
      autoRefresh: saved.fbAutoRefresh !== undefined ? !!saved.fbAutoRefresh : true,
      refreshInterval: 15 // seconds
    };

    // Simulation Config (Fallback / Testing)
    this.autoConfig = {
      baseCount: saved.baseCount !== undefined ? Number(saved.baseCount) : 150,
      minCount: saved.minCount !== undefined ? Number(saved.minCount) : 10,
      maxCount: saved.maxCount !== undefined ? Number(saved.maxCount) : 2500,
      variance: saved.variance !== undefined ? Number(saved.variance) : 8,
      trend: saved.trend || 'stable',
      updateInterval: saved.updateInterval !== undefined ? Number(saved.updateInterval) : 3.5
    };

    // On-screen overlay badge visual config
    this.overlayConfig = {
      enabled: saved.overlayEnabled !== undefined ? !!saved.overlayEnabled : true,
      style: saved.style || 'glass', // 'glass', 'youtube', 'facebook', 'emerald', 'gold'
      pos: saved.pos || 'top-left', // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
      label: saved.label !== undefined ? saved.label : 'កំពុងទស្សនា',
      format: saved.format || 'number', // 'number', 'compact'
      showDot: saved.showDot !== undefined ? !!saved.showDot : true,
      showEye: saved.showEye !== undefined ? !!saved.showEye : true
    };

    // Timers
    this.realPollTimer = null;
    this.simTimer = null;
    this.isFetchingYt = false;
    this.isFetchingFb = false;

    // Sync to overlay
    this.syncToOverlay();
  }

  loadConfig() {
    try {
      const raw = localStorage.getItem('yt_viewer_config');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('[ViewerManager] Error loading config:', e);
      return {};
    }
  }

  saveConfig() {
    try {
      const data = {
        mode: this.mode,
        count: this.count,
        ytVideoIdOrUrl: this.ytConfig.videoIdOrUrl,
        ytApiKey: this.ytConfig.apiKey,
        ytAutoRefresh: this.ytConfig.autoRefresh,
        fbVideoUrlOrId: this.fbConfig.videoUrlOrId,
        fbAccessToken: this.fbConfig.accessToken,
        fbAutoRefresh: this.fbConfig.autoRefresh,
        baseCount: this.autoConfig.baseCount,
        minCount: this.autoConfig.minCount,
        maxCount: this.autoConfig.maxCount,
        variance: this.autoConfig.variance,
        trend: this.autoConfig.trend,
        updateInterval: this.autoConfig.updateInterval,
        overlayEnabled: this.overlayConfig.enabled,
        style: this.overlayConfig.style,
        pos: this.overlayConfig.pos,
        label: this.overlayConfig.label,
        format: this.overlayConfig.format,
        showDot: this.overlayConfig.showDot,
        showEye: this.overlayConfig.showEye
      };
      localStorage.setItem('yt_viewer_config', JSON.stringify(data));
    } catch (e) {
      console.warn('[ViewerManager] Error saving config:', e);
    }
  }

  syncToOverlay() {
    if (!this.overlayManager || !this.overlayManager.viewerCounter) return;
    this.overlayManager.viewerCounter.enabled = this.overlayConfig.enabled;
    this.overlayManager.viewerCounter.count = this.count;
    this.overlayManager.viewerCounter.pos = this.overlayConfig.pos;
    this.overlayManager.viewerCounter.style = this.overlayConfig.style;
    this.overlayManager.viewerCounter.label = this.overlayConfig.label;
    this.overlayManager.viewerCounter.format = this.overlayConfig.format;
    this.overlayManager.viewerCounter.showDot = this.overlayConfig.showDot;
    this.overlayManager.viewerCounter.showEye = this.overlayConfig.showEye;
  }

  init() {
    this.bindDOM();
    this.renderUI();

    // Start Real Tracking by default
    if (this.mode === 'real') {
      this.startRealTracking();
    } else if (this.mode === 'auto') {
      this.startAutoSimulation();
    }

    // Check initial local web viewers from server
    this.fetchLocalWebViewers();
  }

  bindDOM() {
    // 1. Overlay Toggle Buttons
    const btnToggleViewerOverlay = document.getElementById('btnToggleViewerOverlay');
    if (btnToggleViewerOverlay) {
      btnToggleViewerOverlay.addEventListener('click', () => {
        this.toggleOverlay();
      });
    }

    const btnToggleViewersQuick = document.getElementById('btnToggleViewersQuick');
    if (btnToggleViewersQuick) {
      btnToggleViewersQuick.addEventListener('click', () => {
        this.toggleOverlay();
      });
    }

    const checkViewerOverlayEnabled = document.getElementById('checkViewerOverlayEnabled');
    if (checkViewerOverlayEnabled) {
      checkViewerOverlayEnabled.addEventListener('change', (e) => {
        this.toggleOverlay(e.target.checked);
      });
    }

    // 2. Mode Selector Buttons (Real Viewers / Auto / Manual)
    document.querySelectorAll('[data-viewer-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetMode = btn.dataset.viewerMode;
        this.setMode(targetMode);
      });
    });

    // 3. Real Viewers Connect Buttons & Inputs
    const inputRealYtUrl = document.getElementById('inputRealYtUrl');
    if (inputRealYtUrl) {
      inputRealYtUrl.value = this.ytConfig.videoIdOrUrl;
      inputRealYtUrl.addEventListener('input', (e) => {
        this.ytConfig.videoIdOrUrl = e.target.value.trim();
        this.saveConfig();
      });
    }

    const inputRealYtApiKey = document.getElementById('inputRealYtApiKey');
    if (inputRealYtApiKey) {
      inputRealYtApiKey.value = this.ytConfig.apiKey;
      inputRealYtApiKey.addEventListener('input', (e) => {
        this.ytConfig.apiKey = e.target.value.trim();
        this.saveConfig();
      });
    }

    const btnFetchRealYt = document.getElementById('btnFetchRealYt');
    if (btnFetchRealYt) {
      btnFetchRealYt.addEventListener('click', () => {
        this.fetchRealYouTubeViewers(true);
      });
    }

    const inputRealFbUrl = document.getElementById('inputRealFbUrl');
    if (inputRealFbUrl) {
      inputRealFbUrl.value = this.fbConfig.videoUrlOrId;
      inputRealFbUrl.addEventListener('input', (e) => {
        this.fbConfig.videoUrlOrId = e.target.value.trim();
        this.saveConfig();
      });
    }

    const btnFetchRealFb = document.getElementById('btnFetchRealFb');
    if (btnFetchRealFb) {
      btnFetchRealFb.addEventListener('click', () => {
        this.fetchRealFacebookViewers(true);
      });
    }

    const btnRefreshAllReal = document.getElementById('btnRefreshAllReal');
    if (btnRefreshAllReal) {
      btnRefreshAllReal.addEventListener('click', () => {
        this.refreshAllRealViewers(true);
      });
    }

    // Copy Watch URL for LAN / Wi-Fi viewers
    const btnCopyWatchUrl = document.getElementById('btnCopyWatchUrl');
    if (btnCopyWatchUrl) {
      btnCopyWatchUrl.addEventListener('click', () => {
        const watchUrl = `${window.location.origin}/watch`;
        navigator.clipboard.writeText(watchUrl).then(() => {
          this.showToast(`📋 បានចម្លង Link មើល Live: ${watchUrl}`, 'success');
        }).catch(() => {
          prompt('សូមចម្លង Link សម្រាប់អ្នកមើល Live តាម Wi-Fi/LAN:', watchUrl);
        });
      });
    }

    // 4. Quick Bump Buttons
    document.querySelectorAll('[data-viewer-bump]').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.viewerBump, 10);
        if (!isNaN(delta)) {
          this.bumpCount(delta);
        }
      });
    });

    const btnViewerReset = document.getElementById('btnViewerReset');
    if (btnViewerReset) {
      btnViewerReset.addEventListener('click', () => {
        if (this.mode === 'real') {
          this.realStats.youtube = 0;
          this.realStats.facebook = 0;
          this.setCount(this.realStats.web, true);
        } else {
          this.setCount(0, true);
        }
        this.showToast('🔄 បានកំណត់ចំនួនឡើងវិញ', 'info');
      });
    }

    const inputDirectViewerCount = document.getElementById('inputDirectViewerCount');
    const btnApplyDirectCount = document.getElementById('btnApplyDirectCount');
    if (btnApplyDirectCount && inputDirectViewerCount) {
      btnApplyDirectCount.addEventListener('click', () => {
        const val = parseInt(inputDirectViewerCount.value, 10);
        if (!isNaN(val) && val >= 0) {
          this.setCount(val, true);
          this.showToast(`✅ បានកំណត់ចំនួនទៅជា៖ ${val.toLocaleString('en-US')}`, 'success');
        }
      });
      inputDirectViewerCount.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnApplyDirectCount.click();
      });
    }

    // 5. Auto Simulation Inputs
    const sliderBaseViewers = document.getElementById('sliderBaseViewers');
    const inputBaseViewers = document.getElementById('inputBaseViewers');
    if (sliderBaseViewers && inputBaseViewers) {
      sliderBaseViewers.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        inputBaseViewers.value = val;
        this.autoConfig.baseCount = val;
        if (this.mode === 'auto') this.setCount(val);
        this.saveConfig();
      });
      inputBaseViewers.addEventListener('input', (e) => {
        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
        sliderBaseViewers.value = Math.min(val, 5000);
        this.autoConfig.baseCount = val;
        this.saveConfig();
      });
    }

    const selectViewerTrend = document.getElementById('selectViewerTrend');
    if (selectViewerTrend) {
      selectViewerTrend.addEventListener('change', (e) => {
        this.autoConfig.trend = e.target.value;
        this.saveConfig();
      });
    }

    const sliderViewerVariance = document.getElementById('sliderViewerVariance');
    const labelViewerVariance = document.getElementById('labelViewerVariance');
    if (sliderViewerVariance) {
      sliderViewerVariance.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.autoConfig.variance = val;
        if (labelViewerVariance) labelViewerVariance.textContent = `±${val}%`;
        this.saveConfig();
      });
    }

    // 6. Overlay Appearance
    document.querySelectorAll('[data-viewer-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.overlayConfig.style = btn.dataset.viewerStyle;
        document.querySelectorAll('[data-viewer-style]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.syncToOverlay();
        this.saveConfig();
      });
    });

    const selectViewerPos = document.getElementById('selectViewerPos');
    if (selectViewerPos) {
      selectViewerPos.addEventListener('change', (e) => {
        this.overlayConfig.pos = e.target.value;
        this.syncToOverlay();
        this.saveConfig();
      });
    }

    const inputViewerLabel = document.getElementById('inputViewerLabel');
    if (inputViewerLabel) {
      inputViewerLabel.addEventListener('input', (e) => {
        this.overlayConfig.label = e.target.value;
        this.syncToOverlay();
        this.saveConfig();
      });
    }

    document.querySelectorAll('[data-viewer-label-preset]').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.viewerLabelPreset;
        if (inputViewerLabel) inputViewerLabel.value = val;
        this.overlayConfig.label = val;
        this.syncToOverlay();
        this.saveConfig();
      });
    });

    const selectViewerFormat = document.getElementById('selectViewerFormat');
    if (selectViewerFormat) {
      selectViewerFormat.addEventListener('change', (e) => {
        this.overlayConfig.format = e.target.value;
        this.syncToOverlay();
        this.saveConfig();
      });
    }

    const checkViewerShowDot = document.getElementById('checkViewerShowDot');
    if (checkViewerShowDot) {
      checkViewerShowDot.addEventListener('change', (e) => {
        this.overlayConfig.showDot = e.target.checked;
        this.syncToOverlay();
        this.saveConfig();
      });
    }

    const checkViewerShowEye = document.getElementById('checkViewerShowEye');
    if (checkViewerShowEye) {
      checkViewerShowEye.addEventListener('change', (e) => {
        this.overlayConfig.showEye = e.target.checked;
        this.syncToOverlay();
        this.saveConfig();
      });
    }
  }

  renderUI() {
    // 1. Hero counter
    const viewersHeroCount = document.getElementById('viewersHeroCount');
    if (viewersHeroCount) {
      viewersHeroCount.textContent = this.count.toLocaleString('en-US');
    }

    const metricViewersCount = document.getElementById('metricViewersCount');
    if (metricViewersCount) {
      metricViewersCount.textContent = this.count.toLocaleString('en-US');
    }

    // 2. Real Viewers Breakdown Pills
    const realBreakdownPill = document.getElementById('realBreakdownPill');
    const countRealYt = document.getElementById('countRealYt');
    const countRealFb = document.getElementById('countRealFb');
    const countRealWeb = document.getElementById('countRealWeb');

    if (countRealYt) countRealYt.textContent = this.realStats.youtube.toLocaleString('en-US');
    if (countRealFb) countRealFb.textContent = this.realStats.facebook.toLocaleString('en-US');
    if (countRealWeb) countRealWeb.textContent = this.realStats.web.toLocaleString('en-US');

    const countRealWebBadge = document.getElementById('countRealWebBadge');
    if (countRealWebBadge) countRealWebBadge.textContent = this.realStats.web;

    const textWatchUrl = document.getElementById('textWatchUrl');
    if (textWatchUrl) {
      textWatchUrl.textContent = `${window.location.origin}/watch`;
    }

    const statusYtReal = document.getElementById('statusYtReal');
    if (statusYtReal) {
      if (this.realStats.ytStatus === 'live') {
        statusYtReal.textContent = `🟢 កំពុង Live (${this.realStats.youtube} នាក់)`;
        statusYtReal.style.color = '#4ade80';
      } else if (this.realStats.ytStatus === 'connected') {
        statusYtReal.textContent = `🔵 ភ្ជាប់ជោគជ័យ (${this.realStats.youtube} នាក់)`;
        statusYtReal.style.color = '#38bdf8';
      } else if (this.realStats.ytStatus === 'not_found') {
        statusYtReal.textContent = '⚠️ រកមិនឃើញ Live';
        statusYtReal.style.color = '#f87171';
      } else {
        statusYtReal.textContent = this.ytConfig.videoIdOrUrl ? 'កំពុងភ្ជាប់...' : 'មិនទាន់ភ្ជាប់';
        statusYtReal.style.color = 'var(--text-muted)';
      }
    }

    const badgeViewerTag = document.getElementById('badgeViewerTag');
    if (badgeViewerTag) {
      if (this.mode === 'real') {
        badgeViewerTag.innerHTML = '🛡️ មនុស្សពិតជាក់ស្តែង (Real Viewers)';
        badgeViewerTag.className = 'badge-viewer-tag real';
      } else if (this.mode === 'auto') {
        badgeViewerTag.innerHTML = '🔄 ចលនាស្វ័យប្រវត្តិ (Simulation)';
        badgeViewerTag.className = 'badge-viewer-tag sim';
      } else {
        badgeViewerTag.innerHTML = '✏️ កំណត់ដោយដៃ (Manual)';
        badgeViewerTag.className = 'badge-viewer-tag manual';
      }
    }

    // 3. Mode Buttons & Panels
    document.querySelectorAll('[data-viewer-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.viewerMode === this.mode);
    });

    const modeRealPanel = document.getElementById('modeRealPanel');
    const modeAutoPanel = document.getElementById('modeAutoPanel');
    const modeManualPanel = document.getElementById('modeManualPanel');
    if (modeRealPanel) modeRealPanel.style.display = this.mode === 'real' ? 'block' : 'none';
    if (modeAutoPanel) modeAutoPanel.style.display = this.mode === 'auto' ? 'block' : 'none';
    if (modeManualPanel) modeManualPanel.style.display = this.mode === 'manual' ? 'block' : 'none';

    // 4. Form inputs sync
    const inputRealYtUrl = document.getElementById('inputRealYtUrl');
    if (inputRealYtUrl && !inputRealYtUrl.matches(':focus')) inputRealYtUrl.value = this.ytConfig.videoIdOrUrl;

    const inputRealFbUrl = document.getElementById('inputRealFbUrl');
    if (inputRealFbUrl && !inputRealFbUrl.matches(':focus')) inputRealFbUrl.value = this.fbConfig.videoUrlOrId;

    const sliderBaseViewers = document.getElementById('sliderBaseViewers');
    const inputBaseViewers = document.getElementById('inputBaseViewers');
    if (sliderBaseViewers) sliderBaseViewers.value = Math.min(this.autoConfig.baseCount, 5000);
    if (inputBaseViewers && !inputBaseViewers.matches(':focus')) inputBaseViewers.value = this.autoConfig.baseCount;

    // 5. Appearance inputs
    document.querySelectorAll('[data-viewer-style]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.viewerStyle === this.overlayConfig.style);
    });

    const selectViewerPos = document.getElementById('selectViewerPos');
    if (selectViewerPos) selectViewerPos.value = this.overlayConfig.pos;

    const inputViewerLabel = document.getElementById('inputViewerLabel');
    if (inputViewerLabel && !inputViewerLabel.matches(':focus')) inputViewerLabel.value = this.overlayConfig.label;

    const selectViewerFormat = document.getElementById('selectViewerFormat');
    if (selectViewerFormat) selectViewerFormat.value = this.overlayConfig.format;

    this.updateOverlayButtonsUI();
  }

  updateOverlayButtonsUI() {
    const isEnabled = this.overlayConfig.enabled;

    const btnToggleViewerOverlay = document.getElementById('btnToggleViewerOverlay');
    if (btnToggleViewerOverlay) {
      if (isEnabled) {
        btnToggleViewerOverlay.className = 'btn btn-sm btn-primary active';
        btnToggleViewerOverlay.innerHTML = '👁️ បង្ហាញលើវីដេអូ (ON)';
      } else {
        btnToggleViewerOverlay.className = 'btn btn-sm btn-secondary';
        btnToggleViewerOverlay.innerHTML = '👁️ លាក់ពីវីដេអូ (OFF)';
      }
    }

    const btnToggleViewersQuick = document.getElementById('btnToggleViewersQuick');
    if (btnToggleViewersQuick) {
      btnToggleViewersQuick.classList.toggle('active', isEnabled);
    }

    const checkViewerOverlayEnabled = document.getElementById('checkViewerOverlayEnabled');
    if (checkViewerOverlayEnabled) {
      checkViewerOverlayEnabled.checked = isEnabled;
    }
  }

  toggleOverlay(forcedState = null) {
    if (forcedState !== null) {
      this.overlayConfig.enabled = Boolean(forcedState);
    } else {
      this.overlayConfig.enabled = !this.overlayConfig.enabled;
    }

    this.syncToOverlay();
    this.saveConfig();
    this.updateOverlayButtonsUI();

    if (this.overlayConfig.enabled) {
      this.showToast('👁️ បានបើកបង្ហាញចំនួនអ្នកទស្សនាលើអេក្រង់វីដេអូ Live', 'success');
    } else {
      this.showToast('ដកផ្ទាំងចំនួនអ្នកទស្សនាចេញពីវីដេអូរួចរាល់', 'info');
    }
  }

  setCount(newCount, isUserAction = false) {
    const old = this.count;
    this.count = Math.max(0, Math.round(newCount));
    this.trendDelta = this.count - old;

    this.syncToOverlay();
    this.saveConfig();

    const viewersHeroCount = document.getElementById('viewersHeroCount');
    if (viewersHeroCount) {
      viewersHeroCount.textContent = this.count.toLocaleString('en-US');
    }

    const metricViewersCount = document.getElementById('metricViewersCount');
    if (metricViewersCount) {
      metricViewersCount.textContent = this.count.toLocaleString('en-US');
    }

    const badgeViewerTrend = document.getElementById('badgeViewerTrend');
    if (badgeViewerTrend) {
      if (this.trendDelta > 0) {
        badgeViewerTrend.textContent = `↗ +${this.trendDelta}`;
        badgeViewerTrend.className = 'badge-viewer-trend up';
      } else if (this.trendDelta < 0) {
        badgeViewerTrend.textContent = `↘ ${this.trendDelta}`;
        badgeViewerTrend.className = 'badge-viewer-trend down';
      } else {
        badgeViewerTrend.textContent = '➡️ ថេរ';
        badgeViewerTrend.className = 'badge-viewer-trend';
      }
    }

    this.onCountChange(this.count, this.trendDelta);
  }

  bumpCount(delta) {
    const next = Math.max(0, this.count + delta);
    this.setCount(next, true);
    const sign = delta > 0 ? `+${delta}` : `${delta}`;
    this.showToast(`👁️ ចំនួនអ្នកទស្សនា៖ ${sign} (${this.count.toLocaleString('en-US')})`, 'info');
  }

  setMode(newMode) {
    if (this.mode === newMode) return;
    this.mode = newMode;
    this.saveConfig();

    this.stopAutoSimulation();
    this.stopRealTracking();

    if (this.mode === 'real') {
      this.startRealTracking();
      this.setCount(this.realStats.total);
      this.showToast('🛡️ បានប្តូរទៅ៖ តាមដានមនុស្សពិត ១០០% (Real Human Viewers)', 'success');
    } else if (this.mode === 'auto') {
      this.startAutoSimulation();
      this.showToast('🔄 បានប្តូរទៅ៖ ចលនាស្វ័យប្រវត្តិតាមធម្មជាតិ (Realistic Traffic)', 'info');
    } else if (this.mode === 'manual') {
      this.showToast('✏️ បានប្តូរទៅ៖ កំណត់ដោយដៃ (Manual Control)', 'info');
    }

    this.renderUI();
  }

  // =========================================================================
  // REAL VIEWERS ENGINE (មនុស្សពិតជាក់ស្តែង)
  // =========================================================================

  startRealTracking() {
    this.stopRealTracking();
    // Immediate initial fetch
    this.refreshAllRealViewers(false);

    // Poll every 12 seconds
    this.realPollTimer = setInterval(() => {
      if (this.mode === 'real') {
        this.refreshAllRealViewers(false);
      }
    }, 12000);
  }

  stopRealTracking() {
    if (this.realPollTimer) {
      clearInterval(this.realPollTimer);
      this.realPollTimer = null;
    }
  }

  async refreshAllRealViewers(isManual = false) {
    const promises = [];
    if (this.ytConfig.videoIdOrUrl) {
      promises.push(this.fetchRealYouTubeViewers(isManual));
    }
    if (this.fbConfig.videoUrlOrId) {
      promises.push(this.fetchRealFacebookViewers(isManual));
    }
    promises.push(this.fetchLocalWebViewers());

    await Promise.allSettled(promises);

    // Calculate verified total
    const total = this.realStats.youtube + this.realStats.facebook + this.realStats.web;
    this.realStats.total = total;
    this.realStats.lastUpdated = Date.now();

    if (this.mode === 'real') {
      this.setCount(total);
    }
    this.renderUI();
  }

  async fetchRealYouTubeViewers(isManual = false) {
    const raw = this.ytConfig.videoIdOrUrl;
    if (!raw) {
      if (isManual) this.showToast('⚠️ សូមបញ្ចូល Link វីដេអូ ឬ Channel YouTube ជាមុនសិន!', 'warning');
      return;
    }

    if (this.isFetchingYt) return;
    this.isFetchingYt = true;

    const btn = document.getElementById('btnFetchRealYt');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ កំពុងពិនិត្យ...';
    }

    try {
      let url = `/api/youtube-viewers?videoId=${encodeURIComponent(raw)}`;
      if (this.ytConfig.apiKey) {
        url += `&apiKey=${encodeURIComponent(this.ytConfig.apiKey)}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data && data.ok) {
        this.realStats.youtube = Number(data.concurrentViewers) || 0;
        this.realStats.ytStatus = data.isLive ? 'live' : 'connected';
        if (data.title) this.realStats.ytTitle = data.title;
        if (data.videoId) this.realStats.ytVideoId = data.videoId;

        if (isManual) {
          this.showToast(`🔴 YouTube មនុស្សពិតកំពុងមើល៖ ${this.realStats.youtube} នាក់`, 'success');
        }
      } else {
        this.realStats.ytStatus = 'not_found';
        if (isManual) {
          this.showToast(data.error || 'មិនទាន់រកឃើញមនុស្សពិតលើ YouTube ឡើយ', 'warning');
        }
      }
    } catch (err) {
      console.warn('[YouTube Viewers Error]:', err.message);
      this.realStats.ytStatus = 'error';
    } finally {
      this.isFetchingYt = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔄 ពិនិត្យឡើងវិញ';
      }
    }
  }

  async fetchRealFacebookViewers(isManual = false) {
    const raw = this.fbConfig.videoUrlOrId;
    if (!raw) return;

    if (this.isFetchingFb) return;
    this.isFetchingFb = true;

    try {
      let url = `/api/facebook-viewers?videoUrl=${encodeURIComponent(raw)}`;
      if (this.fbConfig.accessToken) {
        url += `&accessToken=${encodeURIComponent(this.fbConfig.accessToken)}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data && data.ok) {
        this.realStats.facebook = Number(data.concurrentViewers) || 0;
        if (isManual) {
          this.showToast(`🔵 Facebook មនុស្សពិតកំពុងមើល៖ ${this.realStats.facebook} នាក់`, 'success');
        }
      }
    } catch (err) {
      console.warn('[Facebook Viewers Error]:', err.message);
    } finally {
      this.isFetchingFb = false;
    }
  }

  async fetchLocalWebViewers() {
    try {
      const res = await fetch('/api/real-viewers');
      const data = await res.json();
      if (data && data.ok) {
        this.realStats.web = Number(data.webViewers) || 0;
      }
    } catch (e) {}
  }

  handleWebSocketUpdate(data) {
    if (data && data.webViewers !== undefined) {
      this.realStats.web = Number(data.webViewers) || 0;
      const total = this.realStats.youtube + this.realStats.facebook + this.realStats.web;
      this.realStats.total = total;
      if (this.mode === 'real') {
        this.setCount(total);
      }
      this.renderUI();
    }
  }

  // =========================================================================
  // FALLBACK SIMULATION ENGINE
  // =========================================================================

  startAutoSimulation() {
    this.stopAutoSimulation();
    const intervalMs = Math.max(1500, (this.autoConfig.updateInterval || 3.5) * 1000);

    this.simTimer = setInterval(() => {
      if (this.mode !== 'auto') return;

      const base = Math.max(5, this.autoConfig.baseCount || 150);
      const min = Math.max(1, this.autoConfig.minCount || 10);
      const max = Math.max(min + 10, this.autoConfig.maxCount || 3000);
      const variance = (this.autoConfig.variance || 8) / 100;

      const current = this.count || base;
      const stepMax = Math.max(2, Math.round(current * variance));
      let step = Math.floor((Math.random() * 2 - 1) * stepMax);

      if (this.autoConfig.trend === 'growing') {
        step += Math.floor(Math.random() * 5 + 1);
      } else if (this.autoConfig.trend === 'dropping') {
        step -= Math.floor(Math.random() * 4 + 1);
      } else {
        const distFromBase = current - base;
        if (Math.abs(distFromBase) > base * 0.3) {
          step -= Math.sign(distFromBase) * Math.floor(Math.random() * 3 + 1);
        }
      }

      const next = Math.max(min, Math.min(max, current + step));
      this.setCount(next);
    }, intervalMs);
  }

  stopAutoSimulation() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  setLiveState(live) {
    this.isLive = Boolean(live);
    const badgeViewerStatus = document.getElementById('badgeViewerStatus');
    if (badgeViewerStatus) {
      if (this.isLive) {
        badgeViewerStatus.textContent = '🟢 កំពុងផ្សាយ & កំពុងរាប់មនុស្សពិត (Live)';
        badgeViewerStatus.className = 'badge-viewer-status live';
      } else {
        badgeViewerStatus.textContent = '⚪ រង់ចាំ Live (Standby)';
        badgeViewerStatus.className = 'badge-viewer-status standby';
      }
    }
    if (this.mode === 'real') {
      this.refreshAllRealViewers(false);
    }
  }
}

window.ViewerManager = ViewerManager;
