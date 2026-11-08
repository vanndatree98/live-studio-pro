/**
 * Main Studio Application Controller
 * Handles Media Capture, Video File Playback, Orientation (Landscape/Portrait Auto-Detect),
 * Canvas Render Loop, Audio Mixing, WebSocket Streaming, and UI Controls.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Engines
  const filterEngine = new BeautyFilterEngine();
  const overlayManager = new OverlayManager();

  // Elements
  const liveCanvas = document.getElementById('liveCanvas');
  const ctx = liveCanvas.getContext('2d', { alpha: false });
  const canvasContainer = document.getElementById('canvasContainer');
  const hiddenVideo = document.getElementById('hiddenVideo');
  const fileVideo = document.getElementById('fileVideo');

  // Multi-Episode Video Player Elements
  const videoPlayerBar = document.getElementById('videoPlayerBar');
  const inputVideoFile = document.getElementById('inputVideoFile');
  const inputAddMoreVideos = document.getElementById('inputAddMoreVideos');
  const badgeCurrentEpisode = document.getElementById('badgeCurrentEpisode');
  const videoFileName = document.getElementById('videoFileName');
  const btnTogglePlaylist = document.getElementById('btnTogglePlaylist');
  const playlistCountBadge = document.getElementById('playlistCountBadge');
  const playlistDrawer = document.getElementById('playlistDrawer');
  const playlistSummaryText = document.getElementById('playlistSummaryText');
  const playlistItemsContainer = document.getElementById('playlistItemsContainer');
  const btnClearPlaylist = document.getElementById('btnClearPlaylist');
  const selectLoopMode = document.getElementById('selectLoopMode');

  // Video Transport & Navigation Controls
  const btnPrevEpisode = document.getElementById('btnPrevEpisode');
  const btnSeekBack = document.getElementById('btnSeekBack');
  const btnPlayPauseVideo = document.getElementById('btnPlayPauseVideo');
  const btnSeekForward = document.getElementById('btnSeekForward');
  const btnNextEpisode = document.getElementById('btnNextEpisode');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const videoScrubber = document.getElementById('videoScrubber');
  const videoTimeCurrent = document.getElementById('videoTimeCurrent');
  const videoTimeDuration = document.getElementById('videoTimeDuration');
  const sliderVideoVolume = document.getElementById('sliderVideoVolume');
  const checkMonitorAudio = document.getElementById('checkMonitorAudio');

  // Mic & Audio Control Elements
  const btnToggleMic = document.getElementById('btnToggleMic');
  const sliderMicVolume = document.getElementById('sliderMicVolume');

  // Orientation Switch Buttons
  const btnOrientAuto = document.getElementById('btnOrientAuto');
  const btnOrientHoriz = document.getElementById('btnOrientHoriz');
  const btnOrientVert = document.getElementById('btnOrientVert');

  // State
  let activeVideoSource = 'camera'; // 'camera', 'screen', 'file'
  let orientationMode = localStorage.getItem('yt_orientation_mode') || 'auto'; // 'auto', 'horizontal', 'vertical'
  let currentOrientation = 'horizontal'; // 'horizontal' (16:9), 'vertical' (9:16)

  // Multi-Episode Playlist State
  let videoPlaylist = []; // Array of { id, file, name, url, duration }
  let currentEpisodeIndex = -1;
  let loopMode = 'all'; // 'all' (loop playlist), 'single' (loop current), 'none' (play once)

  let currentStream = null;
  let videoTrack = null;
  let audioTrack = null;
  let audioContext = null;
  let audioSourceNode = null;
  let gainNode = null;
  let analyserNode = null;
  let audioDestNode = null;
  let micAnalyserNode = null;

  // File audio nodes
  let fileVideoAudioNode = null;
  let fileVideoGainNode = null;
  let fileVideoMonitorGain = null;

  let isMuted = false;
  let isFlipped = false;

  let isStreaming = false;
  let streamStartTime = 0;
  let streamTimerInterval = null;
  let mediaRecorder = null;
  let ws = null;

  // Stream Settings (saved in localStorage)
  let savedYtChannels = [];
  try {
    savedYtChannels = JSON.parse(localStorage.getItem('yt_channels') || '[]');
  } catch (e) {
    savedYtChannels = [];
  }
  // Filter out any stale dummy keys
  let rawSavedKey = localStorage.getItem('yt_stream_key') || '';
  if (rawSavedKey === 'zmsx-9f3q-9y04-51hb-e3hj') {
    rawSavedKey = '';
    localStorage.removeItem('yt_stream_key');
  }

  if (Array.isArray(savedYtChannels)) {
    savedYtChannels.forEach(ch => {
      if (ch.streamKey === 'zmsx-9f3q-9y04-51hb-e3hj') {
        ch.streamKey = '';
      }
    });
  }

  if (!Array.isArray(savedYtChannels) || savedYtChannels.length === 0) {
    savedYtChannels = [
      {
        id: 'yt_ch_1',
        name: 'ឆានែលទី ១ (YouTube Main)',
        rtmpUrl: localStorage.getItem('yt_rtmp_url') || 'rtmp://a.rtmp.youtube.com/live2',
        streamKey: rawSavedKey,
        enabled: true
      }
    ];
  }

  const streamConfig = {
    targetPlatform: localStorage.getItem('yt_target_platform') || 'youtube', // 'youtube', 'facebook', 'both'
    ytChannels: savedYtChannels,
    rtmpUrl: savedYtChannels[0]?.rtmpUrl || localStorage.getItem('yt_rtmp_url') || 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: savedYtChannels[0]?.streamKey || rawSavedKey || '',
    fbRtmpUrl: localStorage.getItem('fb_rtmp_url') || 'rtmps://live-api-s.facebook.com:443/rtmp/',
    fbStreamKey: localStorage.getItem('fb_stream_key') || '',
    resolution: localStorage.getItem('yt_resolution') || '1080p30',
    bitrate: localStorage.getItem('yt_bitrate') || '3500k',
    audioBitrate: localStorage.getItem('yt_audio_bitrate') || '128k',
    fps: 30,
    cameraDeviceId: localStorage.getItem('yt_camera_id') || '',
    micDeviceId: localStorage.getItem('yt_mic_id') || ''
  };

  // 2. Setup Comment Manager
  const commentManager = new CommentManager(
    overlayManager,
    (pinnedComment) => {
      const box = document.getElementById('pinnedCommentBox');
      const authorEl = document.getElementById('pinnedAuthor');
      const textEl = document.getElementById('pinnedText');
      if (box && authorEl && textEl) {
        box.style.display = 'block';
        authorEl.textContent = pinnedComment.author;
        textEl.textContent = pinnedComment.text;
      }
      showToast(`📌 បានបង្ហាញ Comment របស់ "${pinnedComment.author}" លើអេក្រង់`, 'success');
    },
    () => {
      const box = document.getElementById('pinnedCommentBox');
      if (box) box.style.display = 'none';
      showToast('ដក Comment ចេញពីអេក្រង់រួចរាល់', 'warning');
    }
  );
  window.commentManager = commentManager;
  commentManager.init();

  // 2.5 Setup Background Music (BGM) Manager
  const bgmManager = new BgmManager({
    getAudioContext: () => ensureAudioGraph(),
    getAudioDestNode: () => {
      ensureAudioGraph();
      return audioDestNode;
    },
    getAnalyserNode: () => {
      ensureAudioGraph();
      return analyserNode;
    },
    showToast: (msg, type) => showToast(msg, type)
  });
  window.bgmManager = bgmManager;
  bgmManager.init();

  // 2.6 Setup Live Viewer Counter Manager
  const viewerManager = new ViewerManager({
    overlayManager,
    showToast: (msg, type) => showToast(msg, type),
    onCountChange: (count, trend) => {
      const metricViewersCount = document.getElementById('metricViewersCount');
      if (metricViewersCount) {
        metricViewersCount.textContent = count.toLocaleString('en-US');
      }
    }
  });
  window.viewerManager = viewerManager;
  viewerManager.init();

  // Populate pre-saved settings in UI
  if (document.getElementById('inputRtmpUrl')) {
    document.getElementById('inputRtmpUrl').value = streamConfig.rtmpUrl;
  }
  if (document.getElementById('inputStreamKey')) {
    document.getElementById('inputStreamKey').value = streamConfig.streamKey;
  }
  if (document.getElementById('inputFbRtmpUrl')) {
    document.getElementById('inputFbRtmpUrl').value = streamConfig.fbRtmpUrl;
  }
  if (document.getElementById('inputFbStreamKey')) {
    document.getElementById('inputFbStreamKey').value = streamConfig.fbStreamKey;
  }
  if (document.getElementById('selectResolution')) {
    document.getElementById('selectResolution').value = streamConfig.resolution;
  }
  if (document.getElementById('selectBitrate')) {
    document.getElementById('selectBitrate').value = streamConfig.bitrate;
  }
  if (document.getElementById('selectAudioBitrate')) {
    document.getElementById('selectAudioBitrate').value = streamConfig.audioBitrate;
  }
  if (document.getElementById('selectDefaultOrientation')) {
    document.getElementById('selectDefaultOrientation').value = orientationMode;
  }

  // Setup Platform Selector (YouTube / Facebook / Dual Multi-Stream)
  const btnPlatformYoutube = document.getElementById('btnPlatformYoutube');
  const btnPlatformFacebook = document.getElementById('btnPlatformFacebook');
  const btnPlatformBoth = document.getElementById('btnPlatformBoth');

  function updatePlatformUI(platform) {
    streamConfig.targetPlatform = platform;
    localStorage.setItem('yt_target_platform', platform);

    [btnPlatformYoutube, btnPlatformFacebook, btnPlatformBoth].forEach(btn => {
      if (btn) btn.classList.toggle('active', btn.dataset.platform === platform);
    });

    const activeYtChannels = streamConfig.ytChannels.filter(ch => ch.enabled && ch.streamKey && ch.streamKey.trim() !== '');
    const activeYtCount = activeYtChannels.length;

    // Update Top Navigation Badges & Labels
    const labelPlatformYt = document.getElementById('labelPlatformYt');
    const badgeYtCount = document.getElementById('badgeYtCount');
    const activeChannelsCount = document.getElementById('activeChannelsCount');

    if (labelPlatformYt) {
      labelPlatformYt.textContent = activeYtCount > 1 ? `YouTube (${activeYtCount} ឆានែល)` : 'YouTube';
    }
    if (badgeYtCount) {
      badgeYtCount.textContent = `${activeYtCount}`;
      badgeYtCount.style.display = activeYtCount > 1 ? 'inline-block' : 'none';
    }
    if (activeChannelsCount) {
      const fbActive = (streamConfig.fbStreamKey && streamConfig.fbStreamKey.trim() !== '') ? 1 : 0;
      const totalActive = (platform === 'both')
        ? (activeYtCount + fbActive)
        : (platform === 'facebook' ? fbActive : activeYtCount);
      activeChannelsCount.textContent = `${totalActive}`;
    }

    const liveBtnIcon = document.getElementById('liveBtnIcon');
    const liveBtnText = document.getElementById('liveBtnText');

    if (!isStreaming) {
      if (platform === 'facebook') {
        if (liveBtnIcon) liveBtnIcon.textContent = '🔵';
        if (liveBtnText) liveBtnText.textContent = 'ចាប់ផ្តើម LIVE (Facebook)';
        overlayManager.watermark.text = 'LIVE 🔵 Facebook';
      } else if (platform === 'both') {
        if (liveBtnIcon) liveBtnIcon.textContent = '🔥';
        if (liveBtnText) {
          liveBtnText.textContent = activeYtCount > 1
            ? `ចាប់ផ្តើម LIVE (${activeYtCount} YT + FB)`
            : 'ចាប់ផ្តើម LIVE (YT + FB)';
        }
        overlayManager.watermark.text = activeYtCount > 1
          ? `LIVE 🔥 ${activeYtCount} YT + FB`
          : 'LIVE 🔥 Multi-Stream';
      } else {
        if (liveBtnIcon) liveBtnIcon.textContent = '🔴';
        if (liveBtnText) {
          liveBtnText.textContent = activeYtCount > 1
            ? `ចាប់ផ្តើម LIVE (${activeYtCount} ឆានែល YouTube)`
            : 'ចាប់ផ្តើម LIVE (YouTube)';
        }
        overlayManager.watermark.text = activeYtCount > 1
          ? `LIVE 🔴 ${activeYtCount} CHANNELS`
          : 'LIVE 🔴 YouTube';
      }
    }
  }

  [btnPlatformYoutube, btnPlatformFacebook, btnPlatformBoth].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        updatePlatformUI(btn.dataset.platform);
        const names = {
          youtube: '🔴 YouTube Live',
          facebook: '🔵 Facebook Live',
          both: '🔥 Dual Multi-Stream (YouTube & Facebook Live)'
        };
        showToast(`បានប្តូរទៅផ្សាយលើ៖ ${names[btn.dataset.platform] || btn.dataset.platform}`, 'info');
      });
    }
  });

  updatePlatformUI(streamConfig.targetPlatform);

  // 3. Orientation Management (Landscape 16:9 & Portrait 9:16 Auto-Detect)
  function applyOrientation(orient, isAutoTriggered = false) {
    currentOrientation = orient;
    const isVert = orient === 'vertical';

    // Canvas Container CSS Class
    canvasContainer.classList.toggle('vertical', isVert);

    // Canvas Resolution based on setting and orientation
    const resKey = streamConfig.resolution; // '1080p60', '1080p30', '720p60', '720p30'
    const is1080p = resKey.startsWith('1080');

    if (isVert) {
      liveCanvas.width = is1080p ? 1080 : 720;
      liveCanvas.height = is1080p ? 1920 : 1280;
      document.getElementById('metricRes').textContent = is1080p ? '1080x1920 (Shorts)' : '720x1280 (Shorts)';
    } else {
      liveCanvas.width = is1080p ? 1920 : 1280;
      liveCanvas.height = is1080p ? 1080 : 720;
      document.getElementById('metricRes').textContent = is1080p ? '1080p HD' : '720p HD';
    }

    streamConfig.fps = resKey.endsWith('60') ? 60 : 30;
    document.getElementById('metricFps').textContent = `${streamConfig.fps} FPS`;
    document.getElementById('metricBitrate').textContent = streamConfig.bitrate.replace('k', ' kbps');

    // Update orientation buttons UI
    btnOrientAuto.classList.toggle('active', orientationMode === 'auto');
    btnOrientHoriz.classList.toggle('active', orientationMode === 'horizontal');
    btnOrientVert.classList.toggle('active', orientationMode === 'vertical');

    if (orientationMode === 'auto') {
      btnOrientAuto.textContent = isVert ? '🔄 ស្វ័យប្រវត្តិ (បញ្ឈរ)' : '🔄 ស្វ័យប្រវត្តិ (ផ្តេក)';
    } else {
      btnOrientAuto.textContent = '🔄 ស្វ័យប្រវត្តិ';
    }

    if (isAutoTriggered) {
      showToast(
        isVert
          ? '📱 រកឃើញវីដេអូបញ្ឈរ - ប្តូរទៅទម្រង់បញ្ឈរ (9:16 Shorts) ដោយស្វ័យប្រវត្តិ!'
          : '🖥️ រកឃើញវីដេអូផ្តេក - ប្តូរទៅទម្រង់ផ្តេក (16:9) ដោយស្វ័យប្រវត្តិ!',
        'success'
      );
    }

    if (isStreaming) {
      showToast('⚠️ ការប្តូរទម្រង់ខណៈពេលកំពុង Live អាចធ្វើឱ្យ YouTube/FB បង្ហាញទំហំមិនត្រឹមត្រូវ! ប្រសិនបើខុសទំហំ សូមចុច Stop Live រួច Go Live ឡើងវិញ។', 'warning');
    }
  }

  function checkAutoOrientation(videoEl) {
    if (orientationMode !== 'auto' || !videoEl) return;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return;

    const detected = vh > vw ? 'vertical' : 'horizontal';
    if (detected !== currentOrientation) {
      applyOrientation(detected, true);
    }
  }

  // Orientation Buttons Event Listeners
  btnOrientAuto.addEventListener('click', () => {
    orientationMode = 'auto';
    localStorage.setItem('yt_orientation_mode', 'auto');
    checkAutoOrientation(getActiveVideoElement());
    applyOrientation(currentOrientation);
    showToast('🔄 បានបើកទម្រង់ស្វ័យប្រវត្តិតាមវីដេអូ (Auto-Detect Mode)', 'info');
  });

  btnOrientHoriz.addEventListener('click', () => {
    orientationMode = 'horizontal';
    localStorage.setItem('yt_orientation_mode', 'horizontal');
    applyOrientation('horizontal');
    showToast('🖥️ បានប្តូរទៅទម្រង់ផ្តេក 16:9 (Landscape)', 'info');
  });

  btnOrientVert.addEventListener('click', () => {
    orientationMode = 'vertical';
    localStorage.setItem('yt_orientation_mode', 'vertical');
    applyOrientation('vertical');
    showToast('📱 បានប្តូរទៅទម្រង់បញ្ឈរ 9:16 (Portrait / Shorts)', 'info');
  });

  // Scale Mode Toggle (Fit / Contain with Bokeh Background vs Fill / Crop full screen)
  const btnToggleScaleMode = document.getElementById('btnToggleScaleMode');
  const scaleModeIcon = document.getElementById('scaleModeIcon');
  const scaleModeText = document.getElementById('scaleModeText');
  let currentScaleMode = localStorage.getItem('yt_scale_mode') || 'fit';
  filterEngine.scaleMode = currentScaleMode;

  function updateScaleModeUI() {
    filterEngine.scaleMode = currentScaleMode;
    if (scaleModeIcon && scaleModeText) {
      if (currentScaleMode === 'fill') {
        scaleModeIcon.textContent = '↔️';
        scaleModeText.textContent = 'ពង្រីកពេញ';
      } else {
        scaleModeIcon.textContent = '🔍';
        scaleModeText.textContent = 'សមាមាត្រ';
      }
    }
  }
  updateScaleModeUI();

  if (btnToggleScaleMode) {
    btnToggleScaleMode.addEventListener('click', () => {
      currentScaleMode = currentScaleMode === 'fit' ? 'fill' : 'fit';
      localStorage.setItem('yt_scale_mode', currentScaleMode);
      updateScaleModeUI();
      showToast(
        currentScaleMode === 'fill'
          ? '↔️ បានប្តូរទៅ៖ ពង្រីកពេញអេក្រង់ (Crop / Fill) គ្មានគែមខ្មៅ'
          : '🔍 បានប្តូរទៅ៖ សមាមាត្រដើម (Fit / Contain) មានផ្ទៃព្រាលស្អាត',
        'info'
      );
    });
  }

  // Apply Initial Orientation
  applyOrientation(orientationMode === 'vertical' ? 'vertical' : 'horizontal');

  // 4. Multi-Episode Video Playlist & Player Management (ផ្ទុកវីដេអូច្រើនភាគ និងបញ្ជាការចាក់)
  
  // A. File Input Handlers (Support Multiple Files & Append)
  inputVideoFile.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addVideosToPlaylist(e.target.files, false); // false = replace with new batch
      e.target.value = '';
    }
  });

  if (inputAddMoreVideos) {
    inputAddMoreVideos.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        addVideosToPlaylist(e.target.files, true); // true = append to playlist
        e.target.value = '';
      }
    });
  }

  function addVideosToPlaylist(files, append = false) {
    if (!files || files.length === 0) return;

    if (!append) {
      // Clear previous video object URLs to release memory
      videoPlaylist.forEach(item => {
        try { URL.revokeObjectURL(item.url); } catch (e) {}
      });
      videoPlaylist = [];
      currentEpisodeIndex = -1;
    }

    const startIndex = videoPlaylist.length;
    let addedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      videoPlaylist.push({
        id: `ep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        file,
        name: file.name,
        url,
        duration: 0
      });
      addedCount++;
    }

    updatePlaylistBadges();
    renderPlaylistDrawer();

    activeVideoSource = 'file';
    document.getElementById('selectVideoSource').value = 'file';
    videoPlayerBar.style.display = 'flex';

    if (!append || currentEpisodeIndex === -1) {
      playEpisode(startIndex, true);
    }

    showToast(`🎬 បានផ្ទុក ${addedCount} ភាគវីដេអូដោយជោគជ័យ!`, 'success');
  }

  async function playEpisode(index, autoPlay = true) {
    if (index < 0 || index >= videoPlaylist.length) return;

    currentEpisodeIndex = index;
    const item = videoPlaylist[index];

    fileVideo.src = item.url;
    fileVideo.loop = (loopMode === 'single');
    fileVideo.muted = false; // Must remain false so Web Audio receives audio data

    updatePlaylistBadges();
    renderPlaylistDrawer();

    fileVideo.onloadedmetadata = () => {
      checkAutoOrientation(fileVideo);
      videoTimeDuration.textContent = formatTime(fileVideo.duration);
      item.duration = fileVideo.duration;
      renderPlaylistDrawer();
    };

    // Prepare Web Audio routing FIRST so audio NEVER plays through computer speakers
    setupFileAudioProcessing();

    if (autoPlay) {
      try {
        ensureAudioGraph();
        fileVideo.muted = false;
        await fileVideo.play();
        playPauseIcon.textContent = '⏸️';
      } catch (err) {
        console.warn('Playback notice:', err);
        playPauseIcon.textContent = '▶️';
      }
    }

    showToast(`🎬 កំពុងចាក់ភាគទី ${index + 1}/${videoPlaylist.length}៖ ${item.name}`, 'info');
  }

  function playNextEpisode() {
    if (videoPlaylist.length === 0) return;
    const nextIdx = currentEpisodeIndex + 1;
    if (nextIdx < videoPlaylist.length) {
      playEpisode(nextIdx, true);
    } else {
      if (loopMode === 'all') {
        playEpisode(0, true);
        showToast('🔁 បានវិលជុំត្រឡប់មកភាគទី 1 វិញ (Playlist Looped)', 'info');
      } else {
        fileVideo.pause();
        playPauseIcon.textContent = '▶️';
        showToast('🏁 បានចាក់ចប់គ្រប់ភាគទាំងអស់ (Finished all episodes)', 'info');
      }
    }
  }

  function playPrevEpisode() {
    if (videoPlaylist.length === 0) return;
    if (fileVideo.currentTime > 3) {
      fileVideo.currentTime = 0;
      return;
    }
    const prevIdx = currentEpisodeIndex - 1;
    if (prevIdx >= 0) {
      playEpisode(prevIdx, true);
    } else {
      playEpisode(videoPlaylist.length - 1, true); // loop around to last
    }
  }

  function seekRelative(seconds) {
    if (!fileVideo.duration) return;
    fileVideo.currentTime = Math.max(0, Math.min(fileVideo.duration, fileVideo.currentTime + seconds));
  }

  function removeEpisode(index) {
    if (index < 0 || index >= videoPlaylist.length) return;
    const removed = videoPlaylist.splice(index, 1)[0];
    try { URL.revokeObjectURL(removed.url); } catch (e) {}

    if (videoPlaylist.length === 0) {
      clearPlaylist(false);
      return;
    }

    if (index === currentEpisodeIndex) {
      const newIdx = Math.min(index, videoPlaylist.length - 1);
      playEpisode(newIdx, !fileVideo.paused);
    } else if (index < currentEpisodeIndex) {
      currentEpisodeIndex--;
    }

    updatePlaylistBadges();
    renderPlaylistDrawer();
    showToast(`🗑️ បានលុបភាគ៖ ${removed.name}`, 'warning');
  }

  function clearPlaylist(confirmUser = true) {
    if (confirmUser && !confirm('តើអ្នកពិតជាចង់សម្អាតបញ្ជីភាគវីដេអូទាំងអស់មែនទេ?')) return;

    videoPlaylist.forEach(item => {
      try { URL.revokeObjectURL(item.url); } catch (e) {}
    });
    videoPlaylist = [];
    currentEpisodeIndex = -1;

    fileVideo.pause();
    fileVideo.src = '';
    playPauseIcon.textContent = '▶️';
    videoTimeCurrent.textContent = '00:00';
    videoTimeDuration.textContent = '00:00';
    videoScrubber.value = 0;

    updatePlaylistBadges();
    renderPlaylistDrawer();
    showToast('🗑️ បានសម្អាតបញ្ជីភាគវីដេអូរួចរាល់', 'info');
  }

  function updatePlaylistBadges() {
    const total = videoPlaylist.length;
    const current = currentEpisodeIndex >= 0 ? currentEpisodeIndex + 1 : 0;

    if (badgeCurrentEpisode) {
      badgeCurrentEpisode.textContent = `ភាគ ${current}/${total}`;
    }
    if (playlistCountBadge) {
      playlistCountBadge.textContent = String(total);
    }
    if (playlistSummaryText) {
      playlistSummaryText.textContent = `${total} ភាគ`;
    }
    if (videoFileName) {
      if (currentEpisodeIndex >= 0 && videoPlaylist[currentEpisodeIndex]) {
        videoFileName.textContent = videoPlaylist[currentEpisodeIndex].name;
        videoFileName.title = videoPlaylist[currentEpisodeIndex].name;
      } else {
        videoFileName.textContent = 'មិនទាន់បានជ្រើសរើសវីដេអូ';
        videoFileName.title = '';
      }
    }
  }

  function renderPlaylistDrawer() {
    if (!playlistItemsContainer) return;
    playlistItemsContainer.innerHTML = '';

    if (videoPlaylist.length === 0) {
      playlistItemsContainer.innerHTML = '<div class="playlist-empty-notice">មិនទាន់មានវីដេអូនៅឡើយទេ។ សូមចុច «ផ្ទុកវីដេអូច្រើនភាគ» ដើម្បីបញ្ចូល!</div>';
      return;
    }

    videoPlaylist.forEach((item, idx) => {
      const isCurrent = idx === currentEpisodeIndex;
      const row = document.createElement('div');
      row.className = `playlist-item ${isCurrent ? 'active' : ''}`;
      row.title = `ចុចដើម្បីចាក់៖ ${item.name}`;

      const durStr = item.duration ? ` (${formatTime(item.duration)})` : '';

      row.innerHTML = `
        <div class="playlist-item-left">
          <span class="playlist-item-index">#${idx + 1}</span>
          <span class="playlist-item-name">${item.name}</span>
          ${isCurrent ? '<span class="playlist-item-status">▶️ កំពុងចាក់</span>' : ''}
        </div>
        <div class="playlist-item-right">
          <span class="video-time">${durStr}</span>
          <button class="playlist-item-btn-remove" type="button" title="លុបភាគនេះ">✖</button>
        </div>
      `;

      row.addEventListener('click', () => {
        if (currentEpisodeIndex !== idx || fileVideo.paused) {
          playEpisode(idx, true);
        }
      });

      const btnRemove = row.querySelector('.playlist-item-btn-remove');
      if (btnRemove) {
        btnRemove.addEventListener('click', (e) => {
          e.stopPropagation();
          removeEpisode(idx);
        });
      }

      playlistItemsContainer.appendChild(row);
    });
  }

  // B. Control Buttons & Event Listeners
  if (btnTogglePlaylist && playlistDrawer) {
    btnTogglePlaylist.addEventListener('click', () => {
      const isHidden = playlistDrawer.style.display === 'none';
      playlistDrawer.style.display = isHidden ? 'flex' : 'none';
      btnTogglePlaylist.classList.toggle('btn-primary', isHidden);
      btnTogglePlaylist.classList.toggle('btn-secondary', !isHidden);
    });
  }

  if (btnClearPlaylist) {
    btnClearPlaylist.addEventListener('click', () => {
      clearPlaylist(true);
    });
  }

  if (selectLoopMode) {
    selectLoopMode.addEventListener('change', (e) => {
      loopMode = e.target.value;
      fileVideo.loop = (loopMode === 'single');
      const modeNames = {
        all: '🔁 បានកំណត់វិលជុំគ្រប់ភាគ (Loop All Episodes)',
        single: '🔂 បានកំណត់វិលជុំភាគនេះ (Loop Current Episode)',
        none: '➡️ បានកំណត់ចាក់ចប់ឈប់ (Play Once)'
      };
      showToast(modeNames[loopMode] || 'បានប្តូររបៀបវិលជុំ', 'info');
    });
  }

  if (btnPrevEpisode) {
    btnPrevEpisode.addEventListener('click', () => playPrevEpisode());
  }

  if (btnNextEpisode) {
    btnNextEpisode.addEventListener('click', () => playNextEpisode());
  }

  if (btnSeekBack) {
    btnSeekBack.addEventListener('click', () => seekRelative(-10));
  }

  if (btnSeekForward) {
    btnSeekForward.addEventListener('click', () => seekRelative(10));
  }

  btnPlayPauseVideo.addEventListener('click', async () => {
    if (videoPlaylist.length === 0) {
      inputVideoFile.click();
      return;
    }
    ensureAudioGraph();
    if (fileVideo.paused) {
      try {
        fileVideo.muted = false;
        await fileVideo.play();
        playPauseIcon.textContent = '⏸️';
      } catch (err) {
        console.warn('Play error:', err);
      }
    } else {
      fileVideo.pause();
      playPauseIcon.textContent = '▶️';
    }
  });

  // Native end of video event: advances to next episode based on loop mode
  fileVideo.onended = () => {
    if (loopMode === 'single') {
      fileVideo.currentTime = 0;
      fileVideo.play();
    } else {
      playNextEpisode();
    }
  };

  fileVideo.addEventListener('timeupdate', () => {
    if (!fileVideo.duration) return;
    const pct = (fileVideo.currentTime / fileVideo.duration) * 100;
    videoScrubber.value = pct;
    videoTimeCurrent.textContent = formatTime(fileVideo.currentTime);
    videoTimeDuration.textContent = formatTime(fileVideo.duration);
  });

  videoScrubber.addEventListener('input', () => {
    if (!fileVideo.duration) return;
    fileVideo.currentTime = (videoScrubber.value / 100) * fileVideo.duration;
  });

  sliderVideoVolume.addEventListener('input', (e) => {
    const vol = e.target.value / 100;
    if (fileVideoGainNode) fileVideoGainNode.gain.value = vol;
    if (fileVideoMonitorGain && checkMonitorAudio && checkMonitorAudio.checked) {
      fileVideoMonitorGain.gain.value = vol;
    }
  });

  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Central Audio Graph Initializer (Guarantees singleton AudioContext & live audio clock)
  function ensureAudioGraph() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    if (!audioDestNode) {
      audioDestNode = audioContext.createMediaStreamDestination();
    }
    if (!analyserNode) {
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 64;
      updateAudioVuMeter();
    }

    // Pure digital zero buffer (zero noise, zero buzzing, pure silence keepalive)
    if (!window.__silentAudioCarrier) {
      try {
        const sampleRate = audioContext.sampleRate || 48000;
        const silentBuffer = audioContext.createBuffer(2, sampleRate * 2, sampleRate);
        const silentSource = audioContext.createBufferSource();
        silentSource.buffer = silentBuffer;
        silentSource.loop = true;
        silentSource.connect(audioDestNode);
        silentSource.start();
        window.__silentAudioCarrier = silentSource;
      } catch (e) {}
    }

    return audioContext;
  }

  function setupFileAudioProcessing() {
    try {
      ensureAudioGraph();

      if (!fileVideoAudioNode) {
        fileVideoAudioNode = audioContext.createMediaElementSource(fileVideo);
        fileVideoGainNode = audioContext.createGain();
        fileVideoGainNode.gain.value = (sliderVideoVolume ? sliderVideoVolume.value : 100) / 100;

        // Broadcast node: routes directly into live stream for YouTube Live & VU meter
        fileVideoAudioNode.connect(fileVideoGainNode);
        fileVideoGainNode.connect(audioDestNode);
        if (analyserNode) {
          fileVideoGainNode.connect(analyserNode);
        }

        // Headphone monitor channel (muted by default to avoid room echo!)
        fileVideoMonitorGain = audioContext.createGain();
        fileVideoMonitorGain.gain.value = (checkMonitorAudio && checkMonitorAudio.checked)
          ? fileVideoGainNode.gain.value
          : 0;

        fileVideoAudioNode.connect(fileVideoMonitorGain);
        fileVideoMonitorGain.connect(audioContext.destination);

        if (checkMonitorAudio) {
          checkMonitorAudio.addEventListener('change', (e) => {
            if (fileVideoMonitorGain) {
              fileVideoMonitorGain.gain.value = e.target.checked
                ? (sliderVideoVolume.value / 100)
                : 0;
              showToast(e.target.checked ? '🎧 បានបើកសម្លេងក្នុងកាស' : '🔇 បានបិទសម្លេងមិនឱ្យឮមកក្រៅ', 'info');
            }
          });
        }
      }
    } catch (e) {
      console.warn('[File Audio setup]', e);
    }
  }

  function getActiveVideoElement() {
    if (activeVideoSource === 'file') {
      if (fileVideo.src && fileVideo.readyState >= 1) {
        return fileVideo;
      }
    }
    if (activeVideoSource === 'link') {
      if (fileVideo.src && fileVideo.readyState >= 1) {
        return fileVideo;
      }
    }
    return hiddenVideo;
  }

  // 5. Setup WebSocket Connection
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Connected to Studio Server');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('[WS Parse error]', e);
      }
    };

    ws.onclose = () => {
      console.warn('[WS] Connection closed. Retrying in 3s...');
      if (isStreaming) {
        stopLiveStream(false);
      }
      setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WS Error]', err);
    };
  }

  initWebSocket();

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'connected':
        console.log('[Server]:', msg.message);
        if (window.viewerManager && msg.webViewers !== undefined) {
          window.viewerManager.handleWebSocketUpdate(msg);
        }
        break;
      case 'real_viewers_update':
        if (window.viewerManager) {
          window.viewerManager.handleWebSocketUpdate(msg);
        }
        break;
      case 'stream_started':
        showToast(msg.message, 'success');
        setLiveUIState(true);
        break;
      case 'stream_stats':
        if (msg.stats) {
          const statsMatch = msg.stats.match(/fps=\s*([\d\.]+).*bitrate=\s*([\d\.]+\w+)/);
          if (statsMatch) {
            document.getElementById('metricFps').textContent = `${Math.round(parseFloat(statsMatch[1]))} FPS`;
            document.getElementById('metricBitrate').textContent = statsMatch[2];
          }
        }
        break;
      case 'stream_warning':
        console.warn('[Server Warning]:', msg.message);
        if (msg.message.includes('Cannot open connection') || msg.message.includes('Connection refused')) {
          showToast('⚠️ ការតភ្ជាប់ទៅ YouTube មិនបានជោគជ័យ! សូមសាកល្បងប្តូរទៅប្រើ RTMPS (Port 443) ក្នុង Settings', 'error');
        }
        break;
      case 'stream_stopped':
        showToast(msg.message, 'warning');
        setLiveUIState(false);
        break;
      case 'stream_error':
        showToast(`⚠️ ${msg.message}`, 'error');
        setLiveUIState(false);
        break;
    }
  }

  // 6. Initialize Camera & Audio
  async function initCamera(deviceId = null) {
    try {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
      }

      const videoConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: streamConfig.fps }
      };

      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      }

      const audioConstraints = {
        deviceId: streamConfig.micDeviceId ? { exact: streamConfig.micDeviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        });
      } catch (mediaErr) {
        console.warn('[Camera Init] Failed with audio, attempting video-only fallback:', mediaErr);
        // Fallback: try video only (e.g., if microphone is missing, disconnected, or blocked)
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });
        showToast('⚠️ មិនអាចបើកមីក្រូហ្វូនបានទេ! កំពុងប្រើប្រាស់តែកាមេរ៉ា', 'warning');
      }

      currentStream = stream;
      videoTrack = stream.getVideoTracks()[0];
      audioTrack = stream.getAudioTracks()[0];

      hiddenVideo.srcObject = stream;
      await hiddenVideo.play();

      hiddenVideo.onloadedmetadata = () => {
        if (activeVideoSource === 'camera') {
          checkAutoOrientation(hiddenVideo);
        }
      };

      setupAudioProcessing(stream);
      await enumerateDevices();
      showToast('📷 កាមេរ៉ា និងមីក្រូហ្វូនដំណើរការរួចរាល់', 'success');

    } catch (err) {
      console.error('[Camera Init Error]', err);
      showToast(`កំហុសកាមេរ៉ា៖ ${err.message}`, 'error');
      drawFallbackCanvas('សូមអនុញ្ញាតបើក Camera/Mic (Please Allow Camera/Mic)');
    }
  }

  // 7. Audio Graph Setup with VU Meter & Guaranteed Audio Clock
  function setupAudioProcessing(stream) {
    try {
      ensureAudioGraph();

      if (stream && stream.getAudioTracks().length > 0) {
        if (audioSourceNode) {
          try { audioSourceNode.disconnect(); } catch (e) {}
        }
        audioSourceNode = audioContext.createMediaStreamSource(stream);

        if (!gainNode) {
          gainNode = audioContext.createGain();
        }
        gainNode.gain.value = isMuted ? 0 : ((sliderMicVolume ? sliderMicVolume.value : 100) / 100);

        audioSourceNode.connect(gainNode);
        gainNode.connect(analyserNode);
        gainNode.connect(audioDestNode);

        // Connect mic analyser for smart auto-ducking BGM
        if (!micAnalyserNode) {
          micAnalyserNode = audioContext.createAnalyser();
          micAnalyserNode.fftSize = 64;
        }
        try {
          audioSourceNode.connect(micAnalyserNode);
          if (bgmManager) {
            bgmManager.setMicAnalyser(micAnalyserNode);
          }
        } catch (e) {}
      }

      // Reconnect file audio to live broadcast & analyser if loaded
      if (fileVideoGainNode && audioDestNode) {
        try {
          fileVideoGainNode.connect(audioDestNode);
          if (analyserNode) {
            fileVideoGainNode.connect(analyserNode);
          }
        } catch (e) {}
      }

      // Reconnect BGM to live broadcast & analyser if initialized
      if (bgmManager) {
        bgmManager.reconnectNodes();
      }
    } catch (e) {
      console.warn('[Audio setup issue]', e);
    }
  }

  let vuDataArray = null;
  function updateAudioVuMeter() {
    if (!analyserNode) return;
    if (!vuDataArray || vuDataArray.length !== analyserNode.frequencyBinCount) {
      vuDataArray = new Uint8Array(analyserNode.frequencyBinCount);
    }
    analyserNode.getByteFrequencyData(vuDataArray);

    let sum = 0;
    for (let i = 0; i < vuDataArray.length; i++) {
      sum += vuDataArray[i];
    }
    const avg = sum / vuDataArray.length;
    const percent = Math.min(100, Math.round((avg / 128) * 100));

    const bar = document.getElementById('audioVuBar');
    if (bar) {
      // Reflects true audio broadcast levels (both mic and video file)
      bar.style.width = `${percent}%`;
    }

    requestAnimationFrame(updateAudioVuMeter);
  }

  // 8. Device Enumeration
  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoSelect = document.getElementById('selectCameraDevice');
      const micSelect = document.getElementById('selectMicDevice');

      if (!videoSelect || !micSelect) return;

      videoSelect.innerHTML = '';
      micSelect.innerHTML = '';

      let camIndex = 1;
      let micIndex = 1;

      devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;

        if (device.kind === 'videoinput') {
          option.text = device.label || `Camera ${camIndex++}`;
          if (device.deviceId === streamConfig.cameraDeviceId) option.selected = true;
          videoSelect.appendChild(option);
        } else if (device.kind === 'audioinput') {
          option.text = device.label || `Microphone ${micIndex++}`;
          if (device.deviceId === streamConfig.micDeviceId) option.selected = true;
          micSelect.appendChild(option);
        }
      });
    } catch (e) {
      console.warn('Device enumeration failed', e);
    }
  }

  // 9. Video Source Selector Event (Webcam / Screen Share / Video File)
  const selectVideoSource = document.getElementById('selectVideoSource');
  if (selectVideoSource) {
    selectVideoSource.addEventListener('change', async (e) => {
      const val = e.target.value;
      activeVideoSource = val;

      // Hide all source-specific panels first
      const linkSourceBar = document.getElementById('linkSourceBar');
      if (linkSourceBar) linkSourceBar.style.display = 'none';

      if (val === 'file') {
        if (linkControlsRow) linkControlsRow.style.display = 'none';
        videoPlayerBar.style.display = 'flex';
        if (videoPlaylist.length === 0 || !fileVideo.src) {
          inputVideoFile.click();
        } else {
          ensureAudioGraph();
          if (fileVideo.paused) {
            try {
              fileVideo.muted = false;
              fileVideo.play();
              playPauseIcon.textContent = '⏸️';
            } catch (e) {}
          }
          checkAutoOrientation(fileVideo);
        }
        showToast('📂 បានប្តូរទៅប្រភពវីដេអូច្រើនភាគ (Video Playlist)', 'success');

      } else if (val === 'link') {
        // Show link source panel
        videoPlayerBar.style.display = 'none';
        if (linkSourceBar) linkSourceBar.style.display = 'flex';
        // Stop camera to save resources
        if (currentStream) {
          currentStream.getVideoTracks().forEach(t => t.stop());
        }
        if (fileVideo.src) {
          ensureAudioGraph();
          setupFileAudioProcessing();
          fileVideo.play().catch(() => {});
          if (linkControlsRow) linkControlsRow.style.display = 'flex';
        } else if (checkAutoConnectLink && checkAutoConnectLink.checked && inputLinkUrl && inputLinkUrl.value.trim()) {
          loadLinkSource(inputLinkUrl.value.trim());
        }
        showToast('🔗 បានប្តូរទៅប្រភពវីដេអូពី Link (YouTube / Facebook / TV URL)', 'success');

      } else if (val === 'screen') {
        videoPlayerBar.style.display = 'none';
        if (linkControlsRow) linkControlsRow.style.display = 'none';
        fileVideo.pause();

        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: streamConfig.fps } },
            audio: true
          });

          if (currentStream) {
            currentStream.getVideoTracks().forEach(t => t.stop());
          }

          const newVideoTrack = screenStream.getVideoTracks()[0];
          videoTrack = newVideoTrack;
          hiddenVideo.srcObject = screenStream;
          await hiddenVideo.play();

          hiddenVideo.onloadedmetadata = () => {
            checkAutoOrientation(hiddenVideo);
          };

          newVideoTrack.onended = () => {
            selectVideoSource.value = 'camera';
            activeVideoSource = 'camera';
            initCamera(streamConfig.cameraDeviceId);
          };

          showToast('🖥️ បានប្តូរទៅចែករំលែកអេក្រង់ (Screen Share)', 'success');
        } catch (err) {
          selectVideoSource.value = 'camera';
          activeVideoSource = 'camera';
          showToast('បានបោះបង់ការចែករំលែកអេក្រង់', 'warning');
        }

      } else {
        if (linkControlsRow) linkControlsRow.style.display = 'none';
        videoPlayerBar.style.display = 'none';
        fileVideo.pause();
        await initCamera(streamConfig.cameraDeviceId);
      }
    });
  }

  // 9.5 Link Source Logic (YouTube / Facebook / TV / Direct URL)
  const linkSourceBar = document.getElementById('linkSourceBar');
  const inputLinkUrl = document.getElementById('inputLinkUrl');
  const btnPasteLink = document.getElementById('btnPasteLink');
  const checkAutoConnectLink = document.getElementById('checkAutoConnectLink');
  const checkAutoReconnectLink = document.getElementById('checkAutoReconnectLink');
  const selectLinkQuality = document.getElementById('selectLinkQuality');
  const btnLoadLink = document.getElementById('btnLoadLink');
  const btnClearLink = document.getElementById('btnClearLink');
  const linkSourceStatus = document.getElementById('linkSourceStatus');
  const linkControlsRow = document.getElementById('linkControlsRow');
  const btnLinkPlayPause = document.getElementById('btnLinkPlayPause');
  const linkPlayIcon = document.getElementById('linkPlayIcon');
  const linkPlayText = document.getElementById('linkPlayText');
  const btnToggleLinkAudio = document.getElementById('btnToggleLinkAudio');
  const linkAudioIcon = document.getElementById('linkAudioIcon');
  const linkAudioText = document.getElementById('linkAudioText');
  const sliderLinkVolume = document.getElementById('sliderLinkVolume');
  const linkVolumeText = document.getElementById('linkVolumeText');

  let isLinkAudioMuted = false;
  let autoReconnectTimer = null;
  let autoReconnectAttempts = 0;

  // Restore saved preferences
  if (checkAutoConnectLink) {
    checkAutoConnectLink.checked = localStorage.getItem('yt_auto_connect_link') !== 'false';
    checkAutoConnectLink.addEventListener('change', (e) => {
      localStorage.setItem('yt_auto_connect_link', e.target.checked ? 'true' : 'false');
      showToast(e.target.checked ? '⚡ បានបើកភ្ជាប់ស្វ័យប្រវត្តិ (Auto-Connect ON)' : '⚡ បានបិទភ្ជាប់ស្វ័យប្រវត្តិ', 'info');
    });
  }

  if (checkAutoReconnectLink) {
    checkAutoReconnectLink.checked = localStorage.getItem('yt_auto_reconnect_link') !== 'false';
    checkAutoReconnectLink.addEventListener('change', (e) => {
      localStorage.setItem('yt_auto_reconnect_link', e.target.checked ? 'true' : 'false');
      showToast(e.target.checked ? '🔁 បានបើកភ្ជាប់ឡើងវិញពេលដាច់ (Auto-Reconnect ON)' : '🔁 បានបិទភ្ជាប់ឡើងវិញ', 'info');
    });
  }

  // Restore last used Link URL if available
  const savedLastUrl = localStorage.getItem('yt_last_link_url') || '';
  if (savedLastUrl && inputLinkUrl && !inputLinkUrl.value) {
    inputLinkUrl.value = savedLastUrl;
  }

  function showLinkStatus(msg, type = 'info') {
    if (!linkSourceStatus) return;
    linkSourceStatus.style.display = 'block';
    linkSourceStatus.className = `link-source-status link-status-${type}`;
    linkSourceStatus.textContent = msg;
  }

  function hideLinkStatus() {
    if (linkSourceStatus) linkSourceStatus.style.display = 'none';
  }

  function updateLinkAudioUI() {
    const vol = sliderLinkVolume ? parseInt(sliderLinkVolume.value, 10) : 100;
    if (linkVolumeText) linkVolumeText.textContent = `${vol}%`;

    const gainVal = isLinkAudioMuted ? 0 : (vol / 100);

    // Stream broadcast gain
    if (fileVideoGainNode) {
      fileVideoGainNode.gain.value = vol / 100;
    }
    // Speaker/headphone monitor gain
    if (fileVideoMonitorGain) {
      fileVideoMonitorGain.gain.value = gainVal;
    }

    if (btnToggleLinkAudio) {
      if (isLinkAudioMuted) {
        btnToggleLinkAudio.className = 'btn btn-sm btn-secondary';
        if (linkAudioIcon) linkAudioIcon.textContent = '🔇';
        if (linkAudioText) linkAudioText.textContent = 'សម្លេងកាស៖ បិទ';
      } else {
        btnToggleLinkAudio.className = 'btn btn-sm btn-primary';
        if (linkAudioIcon) linkAudioIcon.textContent = '🔊';
        if (linkAudioText) linkAudioText.textContent = 'សម្លេងកាស៖ បើក';
      }
    }
  }

  async function loadLinkSource(url) {
    if (!url || !url.trim()) {
      showLinkStatus('⚠️ សូមបញ្ចូល URL វីដេអូជាមុនសិន!', 'error');
      return;
    }

    const rawUrl = url.trim();
    const chosenQuality = selectLinkQuality ? selectLinkQuality.value : '720';
    if (btnLoadLink) btnLoadLink.disabled = true;

    // Save as last URL
    localStorage.setItem('yt_last_link_url', rawUrl);

    // Detect platform
    const isYT = rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be') || rawUrl.startsWith('@');
    const isFB = rawUrl.includes('facebook.com') || rawUrl.includes('fb.watch');

    const qualityLabelMap = {
      '1080': '1080p Full HD',
      '720': '720p HD',
      '480': '480p SD',
      '360': '360p',
      'auto': 'Auto Best'
    };
    const qName = qualityLabelMap[chosenQuality] || chosenQuality;

    if (isYT || isFB) {
      showLinkStatus(`⏳ កំពុងទាញយកវីដេអូ [${qName}] + សម្លេង...`, 'info');
    } else {
      showLinkStatus(`⏳ កំពុងភ្ជាប់ទៅកាន់ Link [${qName}]...`, 'info');
    }

    try {
      // Call server API to resolve the URL and wrap in local Same-Origin proxy with quality parameter
      const apiResp = await fetch(`/api/resolve-link?url=${encodeURIComponent(rawUrl)}&quality=${encodeURIComponent(chosenQuality)}`);
      const result = await apiResp.json();

      if (!result.ok) {
        if (result.error === 'ytdlp_unavailable') {
          showLinkStatus('❌ មិនអាច download yt-dlp.exe បានទេ! សូមពិនិត្យ Internet connection រួចចាប់ server ឡើងវិញ', 'error');
        } else if (result.error === 'facebook_login_protected' || result.error === 'facebook_auth_required') {
          if (linkSourceStatus) {
            linkSourceStatus.style.display = 'block';
            linkSourceStatus.className = 'link-source-status link-status-warning';
            linkSourceStatus.innerHTML = `
              <div style="display:flex; flex-direction:column; gap:6px;">
                <span>🔵 <strong>Facebook បានចាក់សោរវីដេអូនេះ (Facebook Login Wall):</strong> វីដេអូ Facebook នេះត្រូវការ Login ឬជា Live ក្នុង Page/Group ដែលមានការការពារ។</span>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <span>👉 <strong>ដំណោះស្រាយល្អបំផុត ១០០%៖</strong> បើកវីដេអូនេះលើ Browser Tab រួចចុច៖</span>
                  <button type="button" class="btn btn-sm btn-primary" id="btnSwitchToScreenShare" style="padding:4px 12px; font-size:11px; font-weight:600;">
                    🖥️ ចែករំលែកអេក្រង់ (Screen Share Tab)
                  </button>
                </div>
              </div>
            `;
            const btnSwitch = document.getElementById('btnSwitchToScreenShare');
            if (btnSwitch) {
              btnSwitch.addEventListener('click', () => {
                const selectSrc = document.getElementById('selectVideoSource');
                if (selectSrc) {
                  selectSrc.value = 'screen';
                  selectSrc.dispatchEvent(new Event('change'));
                }
              });
            }
          }
        } else {
          showLinkStatus(`❌ ${result.message || result.error || 'Could not resolve video URL'}`, 'error');
        }
        if (btnLoadLink) btnLoadLink.disabled = false;
        return;
      }

      const playUrl = result.streamUrl;
      const isLive = result.isLive || false;
      const title = result.title || rawUrl;
      const platform = result.platform || 'direct';

      showLinkStatus(`⏳ ${isLive ? '📡 Live Stream' : '🎬 Video'} [${qName}] រកឃើញ! កំពុងបើកចាក់...`, 'info');

      // Stop camera if running
      if (currentStream && activeVideoSource === 'link') {
        currentStream.getVideoTracks().forEach(t => t.stop());
      }

      // Ensure AudioContext is running
      ensureAudioGraph();

      // Reset auto reconnect attempts on successful resolution
      autoReconnectAttempts = 0;

      // Configure fileVideo element
      fileVideo.loop = (loopMode === 'single');
      fileVideo.muted = false; // Must be false so Web Audio receives audio data
      fileVideo.crossOrigin = 'anonymous';

      // Detect video dimensions as soon as metadata is available
      const onLinkVideoReady = () => {
        if (fileVideo.videoWidth > 0 && fileVideo.videoHeight > 0) {
          checkAutoOrientation(fileVideo);
        }
      };
      fileVideo.addEventListener('loadedmetadata', onLinkVideoReady, { once: true });
      fileVideo.addEventListener('canplay', onLinkVideoReady, { once: true });
      fileVideo.addEventListener('playing', onLinkVideoReady, { once: true });

      fileVideo.src = playUrl;

      // Setup audio graph routing (broadcast + speaker monitor)
      setupFileAudioProcessing();

      // Ensure speaker monitor is unmuted and set to full volume
      isLinkAudioMuted = false;
      if (checkMonitorAudio) checkMonitorAudio.checked = true;
      updateLinkAudioUI();

      try {
        await fileVideo.play();
        if (linkPlayIcon) linkPlayIcon.textContent = '⏸️';
        if (linkPlayText) linkPlayText.textContent = 'ផ្អាក';
      } catch (playErr) {
        console.warn('Autoplay waiting for interaction:', playErr);
        if (linkPlayIcon) linkPlayIcon.textContent = '▶️';
        if (linkPlayText) linkPlayText.textContent = 'ចាក់';
      }

      activeVideoSource = 'link';
      checkAutoOrientation(fileVideo);

      // Show link controls row (play/pause, volume, audio toggle)
      if (linkControlsRow) linkControlsRow.style.display = 'flex';

      const platformEmoji = platform === 'youtube' ? '📺' : platform === 'facebook' ? '🔵' : '📡';
      const liveLabel = isLive ? ' (🔴 LIVE)' : '';
      showLinkStatus(
        `✅ ${platformEmoji} កំពុងចាក់ [${qName}]${liveLabel}៖ ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`,
        'success'
      );
      showToast(`${platformEmoji} ▶️ កំពុងចាក់ [${qName}]${liveLabel}! សម្លេងឮក្នុងកុំព្យូទ័រ + ចូល Live`, 'success');

    } catch (err) {
      console.error('[Link Source Error]:', err);
      showLinkStatus(`❌ មិនអាចចាក់បានទេ! (${err.message})`, 'error');
    } finally {
      if (btnLoadLink) btnLoadLink.disabled = false;
    }
  }

  // Auto-Reconnect Watchdog on video stream errors or drops
  fileVideo.addEventListener('error', () => {
    if (activeVideoSource === 'link' && checkAutoReconnectLink && checkAutoReconnectLink.checked) {
      const url = inputLinkUrl ? inputLinkUrl.value.trim() : '';
      if (url && autoReconnectAttempts < 10) {
        autoReconnectAttempts++;
        const delaySec = Math.min(3 * autoReconnectAttempts, 15);
        showLinkStatus(`⏳ វីដេអូ Live ដាច់ - កំពុងភ្ជាប់ឡើងវិញដោយស្វ័យប្រវត្តិ (${autoReconnectAttempts}/10) ក្នុង ${delaySec} វិនាទី...`, 'warning');
        clearTimeout(autoReconnectTimer);
        autoReconnectTimer = setTimeout(() => {
          loadLinkSource(url);
        }, delaySec * 1000);
      }
    }
  });

  // Link Bar Event Listeners
  if (btnLoadLink) {
    btnLoadLink.addEventListener('click', () => {
      const url = inputLinkUrl ? inputLinkUrl.value : '';
      loadLinkSource(url);
    });
  }

  // Quick Paste Button: One-click clipboard paste & auto-connect
  if (btnPasteLink) {
    btnPasteLink.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          inputLinkUrl.value = text.trim();
          showToast('📋 បានបិទភ្ជាប់ Link ពី Clipboard', 'info');
          if (checkAutoConnectLink && checkAutoConnectLink.checked) {
            loadLinkSource(text.trim());
          }
        } else {
          showToast('Clipboard គ្មាន Link វីដេអូទេ', 'warning');
        }
      } catch (e) {
        inputLinkUrl.focus();
        showToast('សូមចុច Ctrl+V លើប្រអប់ Link', 'info');
      }
    });
  }

  // Quality dropdown change: auto reload with newly selected quality if a link is currently active
  if (selectLinkQuality) {
    selectLinkQuality.addEventListener('change', () => {
      const url = inputLinkUrl ? inputLinkUrl.value.trim() : '';
      if (url && (activeVideoSource === 'link' || fileVideo.src)) {
        loadLinkSource(url);
      }
    });
  }

  if (inputLinkUrl) {
    inputLinkUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        loadLinkSource(inputLinkUrl.value);
      }
    });

    // Auto-connect upon paste (Ctrl+V / right-click Paste)
    inputLinkUrl.addEventListener('paste', () => {
      setTimeout(() => {
        const val = inputLinkUrl.value.trim();
        if (val && checkAutoConnectLink && checkAutoConnectLink.checked) {
          showToast('⚡ បានរកឃើញ Link - កំពុងភ្ជាប់ដោយស្វ័យប្រវត្តិ...', 'info');
          loadLinkSource(val);
        }
      }, 150);
    });

    inputLinkUrl.addEventListener('input', () => {
      hideLinkStatus();
    });
  }

  if (btnClearLink) {
    btnClearLink.addEventListener('click', () => {
      if (inputLinkUrl) inputLinkUrl.value = '';
      fileVideo.pause();
      fileVideo.src = '';
      if (linkControlsRow) linkControlsRow.style.display = 'none';
      hideLinkStatus();
      showToast('🗑️ បានលុប Link ចេញរួចរាល់', 'info');
    });
  }

  if (btnLinkPlayPause) {
    btnLinkPlayPause.addEventListener('click', async () => {
      if (!fileVideo.src) return;
      ensureAudioGraph();
      if (fileVideo.paused) {
        try {
          await fileVideo.play();
          if (linkPlayIcon) linkPlayIcon.textContent = '⏸️';
          if (linkPlayText) linkPlayText.textContent = 'ផ្អាក';
        } catch (e) {}
      } else {
        fileVideo.pause();
        if (linkPlayIcon) linkPlayIcon.textContent = '▶️';
        if (linkPlayText) linkPlayText.textContent = 'ចាក់';
      }
    });
  }

  if (btnToggleLinkAudio) {
    btnToggleLinkAudio.addEventListener('click', () => {
      isLinkAudioMuted = !isLinkAudioMuted;
      updateLinkAudioUI();
      showToast(isLinkAudioMuted ? '🔇 បានបិទសម្លេងក្នុងកុំព្យូទ័រ' : '🔊 បានបើកសម្លេងក្នុងកុំព្យូទ័រ', 'info');
    });
  }

  if (sliderLinkVolume) {
    sliderLinkVolume.addEventListener('input', () => {
      updateLinkAudioUI();
    });
  }

  // 10. Main Program Loop (Target FPS Render with Frame Throttling to save CPU/GPU)
  let lastRenderTimestamp = 0;
  function renderLoop(timestamp) {
    requestAnimationFrame(renderLoop);

    const targetFps = streamConfig.fps || 30;
    const frameInterval = 1000 / targetFps;

    // Frame pacing / throttle: skip extra frames on high-refresh monitors (60Hz, 120Hz, 144Hz)
    if (timestamp && lastRenderTimestamp) {
      const elapsed = timestamp - lastRenderTimestamp;
      if (elapsed < frameInterval - 1.5) {
        return;
      }
    }
    lastRenderTimestamp = timestamp || performance.now();

    const width = liveCanvas.width;
    const height = liveCanvas.height;
    const activeVid = getActiveVideoElement();

    // A. Render Video with Beauty Engine
    if (activeVid && activeVid.readyState >= 1) {
      if (orientationMode === 'auto' && activeVid.videoWidth > 0 && activeVid.videoHeight > 0) {
        const detected = activeVid.videoHeight > activeVid.videoWidth ? 'vertical' : 'horizontal';
        if (detected !== currentOrientation) {
          applyOrientation(detected, true);
        }
      }
      filterEngine.render(ctx, activeVid, width, height, isFlipped && activeVideoSource === 'camera');
    } else {
      drawFallbackCanvas('សូមផ្ទុកវីដេអូ ឬបើកកាមេរ៉ា (Load Video or Enable Camera)');
    }

    // B. Render Overlays (Lower third, ticker, watermark, promo, pinned comment)
    overlayManager.render(ctx, width, height);
  }

  function drawFallbackCanvas(message) {
    const w = liveCanvas.width;
    const h = liveCanvas.height;
    ctx.fillStyle = '#11141c';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 36px "Kantumruy Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, w / 2, h / 2);
    ctx.textAlign = 'left';
  }

  // 11. Streaming Actions (Go Live / Stop Live)
  const btnToggleLive = document.getElementById('btnToggleLive');
  if (btnToggleLive) {
    btnToggleLive.addEventListener('click', () => {
      if (isStreaming) {
        if (confirm('តើអ្នកប្រាកដជាចង់បញ្ឈប់ការផ្សាយផ្ទាល់ (Stop Live) មែនទេ?')) {
          stopLiveStream(true);
        }
      } else {
        startLiveStream();
      }
    });
  }

  async function startLiveStream() {
    const platform = streamConfig.targetPlatform || 'youtube';

    const activeYtChannels = streamConfig.ytChannels.filter(ch => ch.enabled && ch.streamKey && ch.streamKey.trim() !== '');

    if ((platform === 'youtube' || platform === 'both') && activeYtChannels.length === 0) {
      showToast('⚠️ សូមបញ្ចូល Stream Key យ៉ាងហោចណាស់មួយឆានែល YouTube!', 'error');
      openSettingsModal();
      if (typeof switchSettingsTab === 'function') switchSettingsTab('yt');
      return;
    }

    if ((platform === 'facebook' || platform === 'both') && (!streamConfig.fbStreamKey || streamConfig.fbStreamKey.trim() === '')) {
      showToast('⚠️ សូមបញ្ចូល Facebook Stream Key ជាមុនសិន!', 'error');
      openSettingsModal();
      if (typeof switchSettingsTab === 'function') switchSettingsTab('fb');
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showToast('⚠️ មិនអាចតភ្ជាប់ទៅ Server បានទេ! កំពុងព្យាយាមតភ្ជាប់ឡើងវិញ...', 'error');
      return;
    }

    // Ensure Audio Processing & Keepalive Carrier is active
    ensureAudioGraph();
    setupAudioProcessing(currentStream);

    const canvasFps = streamConfig.fps || 30;
    const canvasStream = liveCanvas.captureStream(canvasFps);

    // Combine video track and live audio track into unified MediaStream (prevents Chromium track-dropping bug)
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioDestNode && audioDestNode.stream.getAudioTracks().length > 0) {
      tracks.push(audioDestNode.stream.getAudioTracks()[0]);
    } else if (audioTrack) {
      tracks.push(audioTrack);
    }

    const combinedStream = new MediaStream(tracks);
    console.log('[Live Stream Combined Tracks]:', combinedStream.getTracks().map(t => `${t.kind}: active`));

    // Prioritize hardware-accelerated H.264 over software VP8/VP9 to prevent browser lag & CPU spikes
    const mimeTypes = [
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    if (!selectedMime) {
      showToast('MediaRecorder មិនគាំទ្រទ្រង់ទ្រាយវីដេអូនេះទេ', 'error');
      return;
    }

    try {
      const bitrateBps = parseInt(streamConfig.bitrate, 10) * 1000 || 3500000;
      mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMime,
        videoBitsPerSecond: bitrateBps
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('[MediaRecorder Error]:', event.error);
        showToast('⚠️ កំហុសក្នុងដំណើរការថតកូដវីដេអូ (MediaRecorder Error)', 'error');
        stopLiveStream(true);
      };

      ws.send(JSON.stringify({
        type: 'start_stream',
        targetPlatform: platform,
        ytChannels: streamConfig.ytChannels,
        rtmpUrl: streamConfig.rtmpUrl,
        streamKey: activeYtChannels[0]?.streamKey || streamConfig.streamKey,
        fbRtmpUrl: streamConfig.fbRtmpUrl,
        fbStreamKey: streamConfig.fbStreamKey,
        fps: streamConfig.fps,
        bitrate: streamConfig.bitrate,
        audioBitrate: streamConfig.audioBitrate || '128k'
      }));

      // Send media chunks every 500ms for responsive live delivery
      mediaRecorder.start(500);
      setLiveUIState(true);

    } catch (err) {
      console.error('[Start Stream Error]', err);
      showToast(`កំហុសពេលចាប់ផ្តើម Live: ${err.message}`, 'error');
      setLiveUIState(false);
    }
  }

  function stopLiveStream(notifyBackend = true) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {}
    }

    if (notifyBackend && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop_stream' }));
    }

    setLiveUIState(false);
  }

  function setLiveUIState(live) {
    isStreaming = live;
    const pill = document.getElementById('streamStatusPill');
    const statusText = document.getElementById('streamStatusText');
    const timerEl = document.getElementById('streamTimer');

    if (live) {
      pill.className = 'live-status-pill live';
      statusText.textContent = 'ON AIR (កំពុង Live)';
      btnToggleLive.innerHTML = '⏹️ បញ្ឈប់ LIVE (Stop Stream)';
      btnToggleLive.classList.add('is-live');

      streamStartTime = Date.now();
      clearInterval(streamTimerInterval);
      streamTimerInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - streamStartTime) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        timerEl.textContent = `${h}:${m}:${s}`;
      }, 1000);

    } else {
      pill.className = 'live-status-pill offline';
      statusText.textContent = 'OFFLINE (មិនទាន់ Live)';
      btnToggleLive.innerHTML = '🔴 ចាប់ផ្តើម LIVE (Go Live)';
      btnToggleLive.classList.remove('is-live');

      clearInterval(streamTimerInterval);
      timerEl.textContent = '00:00:00';
    }

    if (window.viewerManager) {
      window.viewerManager.setLiveState(live);
    }
  }

  // 12. Beauty Filter UI Bindings
  const sliders = [
    { id: 'filterSmooth', key: 'smooth', labelId: 'valSmooth', unit: '%' },
    { id: 'filterBrightness', key: 'brightness', labelId: 'valBrightness', unit: '%' },
    { id: 'filterContrast', key: 'contrast', labelId: 'valContrast', unit: '%' },
    { id: 'filterSaturation', key: 'saturation', labelId: 'valSaturation', unit: '%' },
    { id: 'filterWarmth', key: 'warmth', labelId: 'valWarmth', unit: '%', prefix: true },
    { id: 'filterRosy', key: 'rosy', labelId: 'valRosy', unit: '%' }
  ];

  sliders.forEach(({ id, key, labelId, unit, prefix }) => {
    const el = document.getElementById(id);
    const label = document.getElementById(labelId);
    if (!el) return;

    el.addEventListener('input', (e) => {
      const val = e.target.value;
      filterEngine.setParam(key, val);
      if (label) {
        label.textContent = (prefix && val > 0 ? '+' : '') + val + unit;
      }
    });
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const presetName = btn.dataset.preset;
      const res = filterEngine.applyPreset(presetName);
      if (res) {
        syncSliderUI(res);
        showToast(`✨ បានជ្រើសរើសស្ទាយ៖ ${btn.textContent.trim()}`, 'success');
      }
    });
  });

  function syncSliderUI(settings) {
    sliders.forEach(({ id, key, labelId, unit, prefix }) => {
      const el = document.getElementById(id);
      const label = document.getElementById(labelId);
      if (el && settings[key] !== undefined) {
        el.value = settings[key];
        if (label) {
          const val = settings[key];
          label.textContent = (prefix && val > 0 ? '+' : '') + val + unit;
        }
      }
    });
  }

  const btnResetBeauty = document.getElementById('btnResetBeauty');
  if (btnResetBeauty) {
    btnResetBeauty.addEventListener('click', () => {
      const res = filterEngine.reset();
      syncSliderUI(res);
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.preset-btn[data-preset="natural"]')?.classList.add('active');
      showToast('🔄 បានកំណត់តម្រងដើមឡើងវិញ', 'success');
    });
  }

  // 13. Overlays UI Bindings
  const checkLowerThird = document.getElementById('checkLowerThird');
  const inputL3Title = document.getElementById('inputL3Title');
  const inputL3Subtitle = document.getElementById('inputL3Subtitle');

  if (checkLowerThird) {
    checkLowerThird.addEventListener('change', (e) => {
      overlayManager.lowerThird.enabled = e.target.checked;
    });
  }
  if (inputL3Title) {
    inputL3Title.addEventListener('input', (e) => {
      overlayManager.lowerThird.title = e.target.value;
    });
  }
  if (inputL3Subtitle) {
    inputL3Subtitle.addEventListener('input', (e) => {
      overlayManager.lowerThird.subtitle = e.target.value;
    });
  }

  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      overlayManager.lowerThird.style = btn.dataset.style;
    });
  });

  const checkTicker = document.getElementById('checkTicker');
  const inputTickerText = document.getElementById('inputTickerText');
  const selectTickerSpeed = document.getElementById('selectTickerSpeed');
  const selectTickerBg = document.getElementById('selectTickerBg');

  if (checkTicker) {
    checkTicker.addEventListener('change', (e) => {
      overlayManager.ticker.enabled = e.target.checked;
    });
  }
  if (inputTickerText) {
    inputTickerText.addEventListener('input', (e) => {
      overlayManager.ticker.text = e.target.value;
    });
  }
  if (selectTickerSpeed) {
    selectTickerSpeed.addEventListener('change', (e) => {
      overlayManager.ticker.speed = parseFloat(e.target.value);
    });
  }
  if (selectTickerBg) {
    selectTickerBg.addEventListener('change', (e) => {
      overlayManager.ticker.bg = e.target.value;
    });
  }

  const checkWatermark = document.getElementById('checkWatermark');
  const inputWatermarkText = document.getElementById('inputWatermarkText');
  const selectWatermarkPos = document.getElementById('selectWatermarkPos');

  if (checkWatermark) {
    checkWatermark.addEventListener('change', (e) => {
      overlayManager.watermark.enabled = e.target.checked;
    });
  }
  if (inputWatermarkText) {
    inputWatermarkText.addEventListener('input', (e) => {
      overlayManager.watermark.text = e.target.value;
    });
  }
  if (selectWatermarkPos) {
    selectWatermarkPos.addEventListener('change', (e) => {
      overlayManager.watermark.pos = e.target.value;
    });
  }

  // 13. Overlays UI Bindings - Promo & Product Carousel (1-5) with Left-Right Slide Motion
  const checkPromoCard = document.getElementById('checkPromoCard');
  const selectPromoPos = document.getElementById('selectPromoPos');
  const selectPromoSlideDir = document.getElementById('selectPromoSlideDir');
  const selectPromoTheme = document.getElementById('selectPromoTheme');
  const checkPromoAutoRotate = document.getElementById('checkPromoAutoRotate');
  const selectPromoInterval = document.getElementById('selectPromoInterval');
  const textCurrentLiveProduct = document.getElementById('textCurrentLiveProduct');
  const badgeProductCount = document.getElementById('badgeProductCount');
  const btnPrevPromo = document.getElementById('btnPrevPromo');
  const btnNextPromo = document.getElementById('btnNextPromo');
  const btnAddProduct = document.getElementById('btnAddProduct');
  const btnDeleteCurrentProduct = document.getElementById('btnDeleteCurrentProduct');
  const promoPillsList = document.getElementById('promoPillsList');
  const editorCurrentTitle = document.getElementById('editorCurrentTitle');
  const checkItemEnabled = document.getElementById('checkItemEnabled');
  const inputProductImage = document.getElementById('inputProductImage');
  const btnRemoveProductImage = document.getElementById('btnRemoveProductImage');
  const imgProductPreview = document.getElementById('imgProductPreview');
  const placeholderProductThumb = document.getElementById('placeholderProductThumb');
  const inputPromoBadge = document.getElementById('inputPromoBadge');
  const inputPromoTitle = document.getElementById('inputPromoTitle');
  const inputPromoPrice = document.getElementById('inputPromoPrice');
  const inputPromoDesc = document.getElementById('inputPromoDesc');

  let editingPromoIndex = 0;

  // Restore saved Promo items if available and re-hydrate images
  const savedPromoItems = localStorage.getItem('yt_promo_items');
  if (savedPromoItems) {
    try {
      const parsed = JSON.parse(savedPromoItems);
      if (Array.isArray(parsed) && parsed.length > 0) {
        overlayManager.promo.items = parsed;
        overlayManager.promo.items.forEach(item => {
          if (item.imageUrl) {
            const img = new Image();
            img.onload = () => { item.image = img; };
            img.src = item.imageUrl;
          }
        });
      }
    } catch (e) {}
  }

  const savedPromoPos = localStorage.getItem('yt_promo_pos');
  if (savedPromoPos && selectPromoPos) {
    overlayManager.promo.pos = savedPromoPos;
    selectPromoPos.value = savedPromoPos;
  }

  const savedSlideDir = localStorage.getItem('yt_promo_slide_dir');
  if (savedSlideDir && selectPromoSlideDir) {
    overlayManager.promo.slideDirection = savedSlideDir;
    selectPromoSlideDir.value = savedSlideDir;
  }

  const savedTheme = localStorage.getItem('yt_promo_theme');
  if (savedTheme && selectPromoTheme) {
    overlayManager.promo.themeStyle = savedTheme;
    selectPromoTheme.value = savedTheme;
  }

  const savedAutoRotate = localStorage.getItem('yt_promo_auto_rotate');
  if (savedAutoRotate !== null && checkPromoAutoRotate) {
    const isAuto = savedAutoRotate === 'true';
    overlayManager.promo.autoRotate = isAuto;
    checkPromoAutoRotate.checked = isAuto;
  }

  const savedInterval = localStorage.getItem('yt_promo_interval');
  if (savedInterval && selectPromoInterval) {
    overlayManager.promo.rotateInterval = parseInt(savedInterval, 10);
    selectPromoInterval.value = savedInterval;
  }

  function savePromoItemsToStorage() {
    localStorage.setItem('yt_promo_items', JSON.stringify(overlayManager.promo.items));
  }

  function renderPromoPills() {
    if (!promoPillsList) return;
    promoPillsList.innerHTML = '';

    const items = overlayManager.promo.items || [];
    if (badgeProductCount) {
      badgeProductCount.textContent = `${items.length} ផលិតផល`;
    }

    items.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `promo-pill ${idx === editingPromoIndex ? 'active' : ''} ${!item.enabled ? 'disabled-item' : ''}`;
      btn.dataset.promoIndex = String(idx);
      btn.title = `ចុចដើម្បីកែប្រែ ឬចាក់ផ្សាយលើ Live៖ ${item.title || `ផលិតផល #${idx + 1}`}`;

      const shortTitle = item.title ? item.title.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu, '').trim() : `ផលិតផលទី ${idx + 1}`;
      const displayLabel = shortTitle.length > 12 ? shortTitle.slice(0, 11) + '...' : shortTitle;

      btn.innerHTML = `
        <span class="pill-number">#${idx + 1}</span>
        <span class="pill-label">${displayLabel || `ផលិតផលទី ${idx + 1}`}</span>
      `;

      btn.addEventListener('click', () => {
        loadProductToEditor(idx);
        overlayManager.switchPromoItem(idx);
        showToast(`🎯 បានប្តូរទៅបង្ហាញផលិតផលទី ${idx + 1} លើ Live`, 'success');
      });

      promoPillsList.appendChild(btn);
    });
  }

  function updatePillsUI() {
    const pills = document.querySelectorAll('.promo-pill');
    pills.forEach(pill => {
      const idx = parseInt(pill.dataset.promoIndex, 10);
      pill.classList.toggle('active', idx === editingPromoIndex);
      const item = overlayManager.promo.items[idx];
      if (item) {
        pill.classList.toggle('disabled-item', !item.enabled);
        const labelEl = pill.querySelector('.pill-label');
        if (labelEl) {
          const shortTitle = item.title ? item.title.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu, '').trim() : `ផលិតផលទី ${idx + 1}`;
          labelEl.textContent = shortTitle.length > 12 ? shortTitle.slice(0, 11) + '...' : (shortTitle || `ផលិតផលទី ${idx + 1}`);
        }
      }
    });

    if (badgeProductCount && overlayManager.promo.items) {
      badgeProductCount.textContent = `${overlayManager.promo.items.length} ផលិតផល`;
    }
  }

  function addNewProduct() {
    const total = overlayManager.promo.items.length;
    const newNum = total + 1;
    const newItem = {
      id: Date.now(),
      badge: `🔥 ផលិតផល #${newNum}`,
      title: `🔥 ផលិតផលទី ${newNum}៖ ឈ្មោះផលិតផលថ្មី`,
      price: '$0.00',
      desc: '📦 ដឹកជញ្ជូនឥតគិតថ្លៃ | Inbox ឬខល 012 345 678',
      enabled: true,
      image: null,
      imageUrl: null
    };
    overlayManager.promo.items.push(newItem);
    savePromoItemsToStorage();
    renderPromoPills();
    loadProductToEditor(total);
    overlayManager.switchPromoItem(total);
    showToast(`➕ បានបន្ថែមផលិតផលទី ${newNum} ជោគជ័យ!`, 'success');
  }

  if (btnAddProduct) {
    btnAddProduct.addEventListener('click', addNewProduct);
  }

  function deleteCurrentProduct() {
    if (!overlayManager.promo.items || overlayManager.promo.items.length <= 1) {
      showToast('⚠️ ត្រូវមានផលិតផលយ៉ាងហោចណាស់ ១ ក្នុងបញ្ជី!', 'warning');
      return;
    }

    const idx = editingPromoIndex;
    const name = overlayManager.promo.items[idx]?.title || `#${idx + 1}`;

    if (!confirm(`តើអ្នកប្រាកដជាចង់លុប "${name}" ចេញពីបញ្ជីមែនទេ?`)) {
      return;
    }

    overlayManager.promo.items.splice(idx, 1);

    if (editingPromoIndex >= overlayManager.promo.items.length) {
      editingPromoIndex = overlayManager.promo.items.length - 1;
    }
    if (overlayManager.promo.currentIndex >= overlayManager.promo.items.length) {
      overlayManager.promo.currentIndex = overlayManager.promo.items.length - 1;
    }
    overlayManager.promo.nextIndex = overlayManager.promo.currentIndex;

    savePromoItemsToStorage();
    renderPromoPills();
    loadProductToEditor(editingPromoIndex);
    overlayManager.switchPromoItem(editingPromoIndex);
    showToast(`🗑️ បានលុបផលិតផលចេញរួចរាល់`, 'info');
  }

  if (btnDeleteCurrentProduct) {
    btnDeleteCurrentProduct.addEventListener('click', deleteCurrentProduct);
  }

  function loadProductToEditor(idx) {
    if (idx < 0 || idx >= overlayManager.promo.items.length) return;
    editingPromoIndex = idx;
    const item = overlayManager.promo.items[idx];

    if (editorCurrentTitle) editorCurrentTitle.textContent = `📝 កែប្រែព័ត៌មាន៖ ផលិតផលទី ${idx + 1}`;
    if (checkItemEnabled) checkItemEnabled.checked = item.enabled !== false;
    if (inputPromoBadge) inputPromoBadge.value = item.badge || `🔥 ផលិតផល #${idx + 1}`;
    if (inputPromoTitle) inputPromoTitle.value = item.title || '';
    if (inputPromoPrice) inputPromoPrice.value = item.price || '';
    if (inputPromoDesc) inputPromoDesc.value = item.desc || '';

    // Load Product Image Preview
    if (item.imageUrl) {
      if (imgProductPreview) {
        imgProductPreview.src = item.imageUrl;
        imgProductPreview.style.display = 'block';
      }
      if (placeholderProductThumb) placeholderProductThumb.style.display = 'none';
      if (btnRemoveProductImage) btnRemoveProductImage.style.display = 'inline-block';
    } else {
      if (imgProductPreview) {
        imgProductPreview.src = '';
        imgProductPreview.style.display = 'none';
      }
      if (placeholderProductThumb) placeholderProductThumb.style.display = 'block';
      if (btnRemoveProductImage) btnRemoveProductImage.style.display = 'none';
    }

    updatePillsUI();
  }

  function saveEditorToProduct() {
    const item = overlayManager.promo.items[editingPromoIndex];
    if (!item) return;

    if (checkItemEnabled) item.enabled = checkItemEnabled.checked;
    if (inputPromoBadge) item.badge = inputPromoBadge.value;
    if (inputPromoTitle) item.title = inputPromoTitle.value;
    if (inputPromoPrice) item.price = inputPromoPrice.value;
    if (inputPromoDesc) item.desc = inputPromoDesc.value;

    savePromoItemsToStorage();
    updatePillsUI();
  }

  function processAndResizeImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const tempImg = new Image();
      tempImg.onload = () => {
        const maxDim = 256;
        let w = tempImg.width;
        let h = tempImg.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const cctx = canvas.getContext('2d');
        cctx.drawImage(tempImg, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        callback(dataUrl);
      };
      tempImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  if (inputProductImage) {
    inputProductImage.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      processAndResizeImage(file, (dataUrl) => {
        const item = overlayManager.promo.items[editingPromoIndex];
        if (!item) return;

        item.imageUrl = dataUrl;
        const img = new Image();
        img.onload = () => {
          item.image = img;
        };
        img.src = dataUrl;

        if (imgProductPreview) {
          imgProductPreview.src = dataUrl;
          imgProductPreview.style.display = 'block';
        }
        if (placeholderProductThumb) placeholderProductThumb.style.display = 'none';
        if (btnRemoveProductImage) btnRemoveProductImage.style.display = 'inline-block';

        savePromoItemsToStorage();
        showToast(`📷 បានផ្ទុករូបភាពសម្រាប់ផលិតផលទី ${editingPromoIndex + 1} ជោគជ័យ!`, 'success');
      });
    });
  }

  if (btnRemoveProductImage) {
    btnRemoveProductImage.addEventListener('click', () => {
      const item = overlayManager.promo.items[editingPromoIndex];
      if (!item) return;

      item.imageUrl = null;
      item.image = null;
      if (inputProductImage) inputProductImage.value = '';

      if (imgProductPreview) {
        imgProductPreview.src = '';
        imgProductPreview.style.display = 'none';
      }
      if (placeholderProductThumb) placeholderProductThumb.style.display = 'block';
      btnRemoveProductImage.style.display = 'none';

      savePromoItemsToStorage();
      showToast(`🗑️ បានលុបរូបភាពផលិតផលចេញ`, 'info');
    });
  }

  renderPromoPills();
  loadProductToEditor(0);

  if (checkPromoCard) {
    checkPromoCard.addEventListener('change', (e) => {
      overlayManager.promo.enabled = e.target.checked;
      showToast(e.target.checked ? '🛍️ បានបើកផ្ទាំងផលិតផលលើ Live' : 'បានបិទផ្ទាំងផលិតផលលើ Live', e.target.checked ? 'success' : 'warning');
    });
  }

  if (selectPromoPos) {
    selectPromoPos.addEventListener('change', (e) => {
      overlayManager.promo.pos = e.target.value;
      localStorage.setItem('yt_promo_pos', e.target.value);
    });
  }

  if (selectPromoSlideDir) {
    selectPromoSlideDir.addEventListener('change', (e) => {
      overlayManager.promo.slideDirection = e.target.value;
      localStorage.setItem('yt_promo_slide_dir', e.target.value);
      showToast(`🔄 ទិសដៅចលនាស្លាយ៖ ${e.target.options[e.target.selectedIndex].text}`, 'info');
    });
  }

  if (selectPromoTheme) {
    selectPromoTheme.addEventListener('change', (e) => {
      overlayManager.promo.themeStyle = e.target.value;
      localStorage.setItem('yt_promo_theme', e.target.value);
      showToast(`🎨 ពណ៌ស្ទាយបដា៖ ${e.target.options[e.target.selectedIndex].text}`, 'info');
    });
  }

  if (checkPromoAutoRotate) {
    checkPromoAutoRotate.addEventListener('change', (e) => {
      overlayManager.promo.autoRotate = e.target.checked;
      localStorage.setItem('yt_promo_auto_rotate', String(e.target.checked));
      showToast(e.target.checked ? '🔄 បានបើកប្តូរផលិតផលស្វ័យប្រវត្តិ (Auto Rotate)' : '⏸️ បានបិទប្តូរស្វ័យប្រវត្តិ', 'info');
    });
  }

  if (selectPromoInterval) {
    selectPromoInterval.addEventListener('change', (e) => {
      overlayManager.promo.rotateInterval = parseInt(e.target.value, 10);
      localStorage.setItem('yt_promo_interval', e.target.value);
      showToast(`⏱️ ល្បឿនផ្លាស់ប្តូរ៖ ${e.target.options[e.target.selectedIndex].text}`, 'info');
    });
  }

  if (btnPrevPromo) {
    btnPrevPromo.addEventListener('click', () => {
      overlayManager.prevPromoItem();
      const target = overlayManager.promo.nextIndex !== undefined ? overlayManager.promo.nextIndex : overlayManager.promo.currentIndex;
      loadProductToEditor(target);
    });
  }

  if (btnNextPromo) {
    btnNextPromo.addEventListener('click', () => {
      overlayManager.nextPromoItem();
      const target = overlayManager.promo.nextIndex !== undefined ? overlayManager.promo.nextIndex : overlayManager.promo.currentIndex;
      loadProductToEditor(target);
    });
  }

  if (checkItemEnabled) checkItemEnabled.addEventListener('change', saveEditorToProduct);
  if (inputPromoBadge) inputPromoBadge.addEventListener('input', saveEditorToProduct);
  if (inputPromoTitle) inputPromoTitle.addEventListener('input', saveEditorToProduct);
  if (inputPromoPrice) inputPromoPrice.addEventListener('input', saveEditorToProduct);
  if (inputPromoDesc) inputPromoDesc.addEventListener('input', saveEditorToProduct);

  setInterval(() => {
    if (textCurrentLiveProduct && overlayManager.promo) {
      const curr = (overlayManager.promo.currentIndex || 0) + 1;
      const total = overlayManager.promo.items ? overlayManager.promo.items.length : 5;
      textCurrentLiveProduct.textContent = `កំពុងបង្ហាញលើ Live៖ ផលិតផល #${curr}/${total}`;
    }
  }, 350);

  const promoPresetSamples = {
    general: [
      { id: 1, badge: '🔥 ផលិតផល #1', title: '🔥 ផលិតផលទី ១៖ ឈុតប្រូម៉ូសិនពិសេស', price: '$19.99 (បញ្ចុះ 50%)', desc: '📦 ដឹកជញ្ជូនឥតគិតថ្លៃ | Inbox ឬខល 012 345 678', enabled: true },
      { id: 2, badge: '⚡ ផលិតផល #2', title: '⚡ ផលិតផលទី ២៖ ស្មាតហ្វូនស៊េរីថ្មី Pro', price: '$299.00 (ថែម Case + កាស)', desc: '🎁 ធានា ១ ឆ្នាំពេញពីក្រុមហ៊ុន | មានស្តុកស្រាប់', enabled: true },
      { id: 3, badge: '💎 ផលិតផល #3', title: '💎 ផលិតផលទី ៣៖ នាឡិកាដៃ Smart Watch', price: '$45.00 (បញ្ចុះតម្លៃ 30%)', desc: '💧 មិនជ្រាបទឹក វាស់ចង្វាក់បេះដូង និងកីឡា', enabled: true },
      { id: 4, badge: '🎧 ផលិតផល #4', title: '🎧 ផលិតផលទី ៤៖ កាសប៊្លូធូសឥតខ្សែ ANC', price: '$25.00 (សម្លេងបាសបុកពិរោះ)', desc: '🔋 ថ្មកាន់ ៣៦ ម៉ោង កាត់បន្ថយសម្លេងរំខាន', enabled: true },
      { id: 5, badge: '🎁 ផលិតផល #5', title: '🎁 ផលិតផលទី ៥៖ កាតាបស្ពាយការពារទឹក', price: '$15.00 (ទិញ ១ ថែម ១)', desc: '🎒 គុណភាពខ្ពស់ ប្រើបានយូរ ទាន់សម័យ', enabled: true }
    ],
    tech: [
      { id: 1, badge: '📱 TECH #1', title: '📱 iPhone 16 Pro Max 256GB Titanium', price: '$1,299.00 (Free Case & ស្រ្គីន)', desc: '🚀 បន្ទះឈីប A18 Pro កាមេរ៉ា 48MP Zoom 5x', enabled: true },
      { id: 2, badge: '💻 TECH #2', title: '💻 MacBook Air 15" M3 16GB/512GB', price: '$1,399.00 (បញ្ចុះ $100 ថ្ងៃនេះ)', desc: '🔋 ថ្មកាន់ ១៨ ម៉ោង អេក្រង់ Liquid Retina', enabled: true },
      { id: 3, badge: '📱 TECH #3', title: '📱 iPad Pro 11" M4 Ultra Thin', price: '$999.00 (ថែម Apple Pencil Pro)', desc: '✨ អេក្រង់ Tandem OLED កម្រាស់ស្តើង 5.3mm', enabled: true },
      { id: 4, badge: '🎧 TECH #4', title: '🎧 AirPods Pro 2 USB-C ANC', price: '$229.00 (ធានា ១ ឆ្នាំពេញ)', desc: '🔇 កាត់បន្ថយសម្លេងរំខានទ្វេដង និង Spatial Audio', enabled: true },
      { id: 5, badge: '⌚ TECH #5', title: '⌚ Apple Watch Series 10 Jet Black', price: '$429.00 (មានខ្សែថែម ២ ឈុត)', desc: '❤️ វាស់ដំណេកដកដង្ហើម និងសាកថ្មលឿនបំផុត', enabled: true }
    ],
    fashion: [
      { id: 1, badge: '👗 FASHION #1', title: '👗 រ៉ូបនារីម៉ូតថ្មីឆ្នាំ 2026 Premium', price: '$28.00 (បញ្ចុះ 40%)', desc: '✨ សាច់ក្រណាត់ទន់ត្រជាក់ ស្រួលពាក់ ទាន់សម័យ', enabled: true },
      { id: 2, badge: '👕 FASHION #2', title: '👕 អាវយឺត Cotton Original Oversize', price: '$12.00 (ទិញ ២ ថែម ១)', desc: '🧵 កប្បាសធម្មជាតិ ១០០% មិនបែកព្រុយ មិនរួញ', enabled: true },
      { id: 3, badge: '👖 FASHION #3', title: '👖 ខោខូវប៊យ Denim Slim-Fit', price: '$22.00 (ហ្វ្រីដឹកជញ្ជូន)', desc: '👖 ម៉ូតស្អាត យឺតស្រួលស្លៀក មានគ្រប់ទំហំ 28-36', enabled: true },
      { id: 4, badge: '👟 FASHION #4', title: '👟 ស្បែកជើង Sneaker Unisex Running', price: '$35.00 (បញ្ចុះ 50% ស្តុកចុងក្រោយ)', desc: '☁️ ទម្ងន់ស្រាល បាតទន់ ដើរមិនឈឺជើង', enabled: true },
      { id: 5, badge: '👜 FASHION #5', title: '👜 កាបូបយួរដៃស្បែកប្រណិត Luxury', price: '$39.00 (Free កាបូបតូច ១)', desc: '💎 ស្បែក PU គុណភាពខ្ពស់ មិនរបក ធន់រឹងមាំ', enabled: true }
    ],
    food: [
      { id: 1, badge: '🍔 FOOD #1', title: '🍔 ឈុតបឺហ្គឺរសាច់គោ Premium Double Beef', price: '$6.50 (ថែមដំឡូងបារាំង & កូកា)', desc: '🥩 សាច់គោអូស្ត្រាលីទន់ឆ្ងាញ់ ឈីសរលាយ', enabled: true },
      { id: 2, badge: '🍕 FOOD #2', title: '🍕 ភីហ្សាគ្រឿងសមុទ្រ Seafood Lovers L', price: '$12.99 (ទិញ ១ ថែម ១ ថ្ងៃនេះ)', desc: '🦐 បង្គា មឹក ក្តាមស្រស់ៗ ឈីស Mozzarella ណែនៗ', enabled: true },
      { id: 3, badge: '🍗 FOOD #3', title: '🍗 ឈុតមាន់បំពងស្រួយបែបកូរ៉េ 8 ដុំ', price: '$8.00 (ជ្រើសរើសទឹកជ្រលក់បាន)', desc: '🔥 ស្រួយខាងក្រៅ ទន់ខាងក្នុង ហឹរផ្អែមឈ្ងុយឆ្ងាញ់', enabled: true },
      { id: 4, badge: '☕ FOOD #4', title: '☕ កាហ្វេទឹកដោះគោទឹកកក Signature Iced', price: '$2.25 (ទិញ ៣ កែវហ្វ្រីដឹក)', desc: '🌿 គ្រាប់កាហ្វេអារ៉ាប៊ីកាឈ្ងុយដិត ក្លិនឈ្ងុយពិសេស', enabled: true },
      { id: 5, badge: '🧋 FOOD #5', title: '🧋 តែគុជ Brown Sugar Boba Fresh Milk', price: '$2.50 (គុជស្វិតផ្អែមឈ្ងុយ)', desc: '🥛 ទឹកដោះគោស្រស់ 100% ស្ករត្នោតធម្មជាតិ', enabled: true }
    ]
  };

  function applyPromoPresetSample(presetKey) {
    const sample = promoPresetSamples[presetKey];
    if (!sample) return;
    overlayManager.promo.items = JSON.parse(JSON.stringify(sample));
    savePromoItemsToStorage();
    renderPromoPills();
    editingPromoIndex = 0;
    loadProductToEditor(0);
    overlayManager.switchPromoItem(0);
    showToast(`🏬 បានបញ្ចូលគំរូផលិតផលជោគជ័យ!`, 'success');
  }

  document.getElementById('btnSampleGeneral')?.addEventListener('click', () => applyPromoPresetSample('general'));
  document.getElementById('btnSampleTech')?.addEventListener('click', () => applyPromoPresetSample('tech'));
  document.getElementById('btnSampleFashion')?.addEventListener('click', () => applyPromoPresetSample('fashion'));
  document.getElementById('btnSampleFood')?.addEventListener('click', () => applyPromoPresetSample('food'));

  // 13.5 Thumbnail Cover & Standby Screen UI Bindings (រូបភាពគ្រប Thumbnail)
  const checkThumbnailCover = document.getElementById('checkThumbnailCover');
  const btnToggleCoverQuick = document.getElementById('btnToggleCoverQuick');
  const coverQuickIcon = document.getElementById('coverQuickIcon');
  const coverQuickText = document.getElementById('coverQuickText');
  const inputThumbnailFile = document.getElementById('inputThumbnailFile');
  const btnRemoveThumbnailImage = document.getElementById('btnRemoveThumbnailImage');
  const placeholderThumbnail = document.getElementById('placeholderThumbnail');
  const imgThumbnailPreview = document.getElementById('imgThumbnailPreview');
  const checkCoverShowText = document.getElementById('checkCoverShowText');
  const inputCoverTitle = document.getElementById('inputCoverTitle');
  const inputCoverSubtitle = document.getElementById('inputCoverSubtitle');
  const selectCoverMode = document.getElementById('selectCoverMode');
  const sliderCoverDarkness = document.getElementById('sliderCoverDarkness');
  const labelCoverDarkness = document.getElementById('labelCoverDarkness');
  const btnExportThumbnail = document.getElementById('btnExportThumbnail');

  const coverPresetData = {
    starting: {
      title: '🔴 ការផ្សាយផ្ទាល់នឹងចាប់ផ្តើមឆាប់ៗ...',
      subtitle: 'សូមរង់ចាំបន្តិច! សូមកុំភ្លេចជួយ Like & Share ម្នាក់មួយ'
    },
    brb: {
      title: '☕ កំពុងសម្រាកបន្តិច (Be Right Back)',
      subtitle: 'នឹងត្រឡប់មកវិញក្នុងពេលបន្តិចទៀតនេះ...'
    },
    podcast: {
      title: '🎙️ កម្មវិធីជជែកកម្សាន្តផ្ទាល់ (Live Podcast)',
      subtitle: 'សូមចូលរួមបញ្ចេញមតិ និងសួរសំណួរក្នុង Chat'
    },
    shop: {
      title: '🛍️ ផ្សាយផ្ទាល់បញ្ចុះតម្លៃពិសេស (Mega Sale)',
      subtitle: 'ទំនិញគុណភាពខ្ពស់ តម្លៃសមរម្យ កុំភ្លេច Inbox កុម្ម៉ង់ឥឡូវនេះ'
    },
    gaming: {
      title: '🎮 ការផ្សាយផ្ទាល់កម្សាន្តហ្គេម (Gaming Live)',
      subtitle: 'សូមស្វាគមន៍! រីករាយទស្សនាទាំងអស់គ្នា (Enjoy the Stream)'
    }
  };

  function updateCoverStateUI() {
    const isCoverEnabled = overlayManager.thumbnailCover && overlayManager.thumbnailCover.enabled;
    if (checkThumbnailCover) checkThumbnailCover.checked = isCoverEnabled;

    if (btnToggleCoverQuick) {
      btnToggleCoverQuick.classList.toggle('active-cover', isCoverEnabled);
      if (coverQuickText) {
        coverQuickText.textContent = isCoverEnabled ? 'បាំងរូបគ្រប (Standby ON)' : 'បង្ហាញរូបគ្រប (Cover)';
      }
      if (coverQuickIcon) {
        coverQuickIcon.textContent = isCoverEnabled ? '🛑' : '🖼️';
      }
    }
  }

  if (checkThumbnailCover) {
    checkThumbnailCover.addEventListener('change', (e) => {
      overlayManager.thumbnailCover.enabled = e.target.checked;
      updateCoverStateUI();
      if (e.target.checked) {
        showToast('🖼️ បានបើកបង្ហាញរូបភាពគ្រប (Standby Screen) លើ Live', 'success');
      } else {
        showToast('🎬 បានបិទរូបគ្រប — កំពុងបង្ហាញ Live ធម្មតា', 'info');
      }
    });
  }

  if (btnToggleCoverQuick) {
    btnToggleCoverQuick.addEventListener('click', () => {
      overlayManager.thumbnailCover.enabled = !overlayManager.thumbnailCover.enabled;
      updateCoverStateUI();
      if (overlayManager.thumbnailCover.enabled) {
        showToast('🖼️ បានបើកបង្ហាញរូបភាពគ្រប (Standby Screen) លើ Live', 'success');
      } else {
        showToast('🎬 បានបិទរូបគ្រប — កំពុងបង្ហាញ Live ធម្មតា', 'info');
      }
    });
  }

  document.querySelectorAll('[data-cover-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-cover-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const presetKey = btn.dataset.coverPreset;
      overlayManager.thumbnailCover.preset = presetKey;
      localStorage.setItem('yt_cover_preset', presetKey);

      const data = coverPresetData[presetKey];
      if (data) {
        if (inputCoverTitle) {
          inputCoverTitle.value = data.title;
          overlayManager.thumbnailCover.title = data.title;
          localStorage.setItem('yt_cover_title', data.title);
        }
        if (inputCoverSubtitle) {
          inputCoverSubtitle.value = data.subtitle;
          overlayManager.thumbnailCover.subtitle = data.subtitle;
          localStorage.setItem('yt_cover_subtitle', data.subtitle);
        }
      }
      showToast(`🎨 បានជ្រើសរើសស្ទាយ Standby៖ ${btn.textContent.trim()}`, 'success');
    });
  });

  if (inputThumbnailFile) {
    inputThumbnailFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          overlayManager.thumbnailCover.image = img;
          overlayManager.thumbnailCover.imageUrl = event.target.result;

          if (imgThumbnailPreview) {
            imgThumbnailPreview.src = event.target.result;
            imgThumbnailPreview.style.display = 'block';
          }
          if (placeholderThumbnail) {
            placeholderThumbnail.style.display = 'none';
          }
          if (btnRemoveThumbnailImage) {
            btnRemoveThumbnailImage.style.display = 'inline-block';
          }
          showToast('📷 បានផ្ទុករូបភាព Thumbnail ផ្ទាល់ខ្លួនជោគជ័យ!', 'success');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnRemoveThumbnailImage) {
    btnRemoveThumbnailImage.addEventListener('click', () => {
      overlayManager.thumbnailCover.image = null;
      overlayManager.thumbnailCover.imageUrl = null;
      if (inputThumbnailFile) inputThumbnailFile.value = '';

      if (imgThumbnailPreview) {
        imgThumbnailPreview.src = '';
        imgThumbnailPreview.style.display = 'none';
      }
      if (placeholderThumbnail) {
        placeholderThumbnail.style.display = 'block';
      }
      btnRemoveThumbnailImage.style.display = 'none';
      showToast('🗑️ បានលុបរូបភាព Thumbnail ចេញ (ត្រឡប់ទៅប្រើពណ៌ស្ទាយ Gradient ដើម)', 'info');
    });
  }

  if (checkCoverShowText) {
    checkCoverShowText.addEventListener('change', (e) => {
      overlayManager.thumbnailCover.showText = e.target.checked;
    });
  }

  if (inputCoverTitle) {
    inputCoverTitle.addEventListener('input', (e) => {
      overlayManager.thumbnailCover.title = e.target.value;
      localStorage.setItem('yt_cover_title', e.target.value);
    });
  }

  if (inputCoverSubtitle) {
    inputCoverSubtitle.addEventListener('input', (e) => {
      overlayManager.thumbnailCover.subtitle = e.target.value;
      localStorage.setItem('yt_cover_subtitle', e.target.value);
    });
  }

  if (selectCoverMode) {
    selectCoverMode.addEventListener('change', (e) => {
      overlayManager.thumbnailCover.mode = e.target.value;
      localStorage.setItem('yt_cover_mode', e.target.value);
    });
  }

  if (sliderCoverDarkness) {
    sliderCoverDarkness.addEventListener('input', (e) => {
      overlayManager.thumbnailCover.darkness = parseFloat(e.target.value) / 100;
      if (labelCoverDarkness) {
        labelCoverDarkness.textContent = `${e.target.value}%`;
      }
      localStorage.setItem('yt_cover_darkness', e.target.value);
    });
  }

  function exportThumbnailHD() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1920;
    exportCanvas.height = 1080;
    const expCtx = exportCanvas.getContext('2d');

    expCtx.imageSmoothingEnabled = true;
    expCtx.imageSmoothingQuality = 'high';

    const originalMode = overlayManager.thumbnailCover.mode;
    overlayManager.thumbnailCover.mode = 'fullscreen';

    overlayManager.drawThumbnailCover(expCtx, 1920, 1080);

    overlayManager.thumbnailCover.mode = originalMode;

    exportCanvas.toBlob((blob) => {
      if (!blob) {
        showToast('⚠️ មិនអាចទាញយករូបភាពបានទេ', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `live-thumbnail-1920x1080-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('📥 បានទាញយករូប Thumbnail HD (1920x1080 PNG) រួចរាល់!', 'success');
    }, 'image/png', 0.95);
  }

  if (btnExportThumbnail) {
    btnExportThumbnail.addEventListener('click', exportThumbnailHD);
  }

  // Restore saved Cover settings
  const savedCoverPreset = localStorage.getItem('yt_cover_preset');
  const savedCoverTitle = localStorage.getItem('yt_cover_title');
  const savedCoverSubtitle = localStorage.getItem('yt_cover_subtitle');
  const savedCoverMode = localStorage.getItem('yt_cover_mode');
  const savedCoverDarkness = localStorage.getItem('yt_cover_darkness');

  if (savedCoverPreset) {
    overlayManager.thumbnailCover.preset = savedCoverPreset;
    document.querySelectorAll('[data-cover-preset]').forEach(b => {
      b.classList.toggle('active', b.dataset.coverPreset === savedCoverPreset);
    });
  }
  if (savedCoverTitle !== null && inputCoverTitle) {
    overlayManager.thumbnailCover.title = savedCoverTitle;
    inputCoverTitle.value = savedCoverTitle;
  }
  if (savedCoverSubtitle !== null && inputCoverSubtitle) {
    overlayManager.thumbnailCover.subtitle = savedCoverSubtitle;
    inputCoverSubtitle.value = savedCoverSubtitle;
  }
  if (savedCoverMode && selectCoverMode) {
    overlayManager.thumbnailCover.mode = savedCoverMode;
    selectCoverMode.value = savedCoverMode;
  }
  if (savedCoverDarkness !== null && sliderCoverDarkness) {
    overlayManager.thumbnailCover.darkness = parseFloat(savedCoverDarkness) / 100;
    sliderCoverDarkness.value = savedCoverDarkness;
    if (labelCoverDarkness) labelCoverDarkness.textContent = `${savedCoverDarkness}%`;
  }
  updateCoverStateUI();

  const btnDismissPinned = document.getElementById('btnDismissPinned');
  if (btnDismissPinned) {
    btnDismissPinned.addEventListener('click', () => {
      commentManager.dismissPinned();
    });
  }

  const btnSimulateComment = document.getElementById('btnSimulateComment');
  if (btnSimulateComment) {
    btnSimulateComment.addEventListener('click', () => {
      commentManager.simulateOne();
    });
  }

  const btnAutoSimulate = document.getElementById('btnAutoSimulate');
  if (btnAutoSimulate) {
    btnAutoSimulate.addEventListener('click', () => {
      const isAuto = commentManager.toggleAutoSimulator();
      btnAutoSimulate.textContent = isAuto ? '⏹️ បញ្ឈប់ Auto' : '▶️ តេស្តស្វ័យប្រវត្ត (Auto Stream Chat)';
      btnAutoSimulate.classList.toggle('active', isAuto);
      showToast(isAuto ? 'បានបើកដំណើរការ Auto Chat Simulator' : 'បានបញ្ឈប់ Auto Simulator', 'warning');
    });
  }

  const btnTabSimulator = document.getElementById('btnTabSimulator');
  const btnTabYoutubeApi = document.getElementById('btnTabYoutubeApi');
  const panelSimulator = document.getElementById('panelSimulator');
  const panelYoutubeApi = document.getElementById('panelYoutubeApi');

  if (btnTabSimulator && btnTabYoutubeApi && panelSimulator && panelYoutubeApi) {
    btnTabSimulator.addEventListener('click', () => {
      btnTabSimulator.classList.add('active');
      btnTabYoutubeApi.classList.remove('active');
      panelSimulator.style.display = 'block';
      panelYoutubeApi.style.display = 'none';
    });

    btnTabYoutubeApi.addEventListener('click', () => {
      btnTabYoutubeApi.classList.add('active');
      btnTabSimulator.classList.remove('active');
      panelYoutubeApi.style.display = 'block';
      panelSimulator.style.display = 'none';
    });
  }

  const btnConnectYtChat = document.getElementById('btnConnectYtChat');
  if (btnConnectYtChat) {
    btnConnectYtChat.addEventListener('click', async () => {
      const inputVideoId = document.getElementById('inputYtVideoId');
      const inputApiKey = document.getElementById('inputYtApiKey');
      const videoId = inputVideoId ? inputVideoId.value.trim() : '';
      const apiKey = inputApiKey ? inputApiKey.value.trim() : '';

      if (!videoId) {
        showToast('⚠️ សូមបញ្ចូល YouTube Video ID', 'error');
        return;
      }

      showToast('កំពុងភ្ជាប់ទៅ YouTube Live Chat...', 'warning');
      await commentManager.startYouTubeChatPolling(videoId, apiKey, (status) => {
        if (status.ok) {
          showToast('🔗 បានភ្ជាប់ទៅ YouTube Live Chat ដោយជោគជ័យ!', 'success');
        } else {
          showToast(`កំហុសតភ្ជាប់ YouTube Chat: ${status.error}`, 'error');
        }
      });
    });
  }

  const inputSearchChat = document.getElementById('inputSearchChat');
  if (inputSearchChat) {
    inputSearchChat.addEventListener('input', (e) => {
      commentManager.renderCommentsList(e.target.value);
    });
  }

  const checkBadWordsFilter = document.getElementById('checkBadWordsFilter');
  if (checkBadWordsFilter) {
    checkBadWordsFilter.addEventListener('change', (e) => {
      commentManager.filterBadWords = e.target.checked;
      showToast(e.target.checked ? '🛡️ Auto Filter បានបើក' : 'Auto Filter បានបិទ', 'warning');
    });
  }

  const inputManualComment = document.getElementById('inputManualComment');
  const btnSendManualComment = document.getElementById('btnSendManualComment');

  function sendManual() {
    if (!inputManualComment) return;
    const text = inputManualComment.value.trim();
    if (!text) return;
    const c = commentManager.addComment('🎤 Host (អ្នកផ្សាយផ្ទាល់)', text, '👑');
    commentManager.pinComment(c.id);
    inputManualComment.value = '';
  }

  if (btnSendManualComment) {
    btnSendManualComment.addEventListener('click', sendManual);
  }
  if (inputManualComment) {
    inputManualComment.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendManual();
    });
  }

  // 14. Quick Controls: Flip, Mic, Fullscreen, Screenshot
  const btnQuickFlip = document.getElementById('btnQuickFlip');
  if (btnQuickFlip) {
    btnQuickFlip.addEventListener('click', () => {
      isFlipped = !isFlipped;
      showToast(isFlipped ? '🔄 បានត្រឡប់កាមេរ៉ាផ្តេក (Horizontal Flip On)' : 'កាមេរ៉ាធម្មតា (Flip Off)', 'success');
    });
  }

  if (btnToggleMic) {
    btnToggleMic.addEventListener('click', () => {
      isMuted = !isMuted;
      if (gainNode) {
        gainNode.gain.value = isMuted ? 0 : (sliderMicVolume.value / 100);
      }
      btnToggleMic.innerHTML = isMuted ? '🔇' : '🎙️';
      showToast(isMuted ? '🔇 បានបិទសម្លេង (Mic Muted)' : '🎙️ បានបើកសម្លេង (Mic Unmuted)', isMuted ? 'warning' : 'success');
    });
  }

  if (sliderMicVolume) {
    sliderMicVolume.addEventListener('input', (e) => {
      if (!isMuted && gainNode) {
        gainNode.gain.value = e.target.value / 100;
      }
    });
  }

  const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        if (canvasContainer && canvasContainer.requestFullscreen) {
          canvasContainer.requestFullscreen().catch(err => {
            alert(`Fullscreen Error: ${err.message}`);
          });
        }
      } else {
        document.exitFullscreen();
      }
    });
  }

  const btnCaptureSnap = document.getElementById('btnCaptureSnap');
  if (btnCaptureSnap) {
    btnCaptureSnap.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `live-snapshot-${Date.now()}.png`;
      link.href = liveCanvas.toDataURL('image/png');
      link.click();
      showToast('📸 បានថតរូបអេក្រង់រួចរាល់ (Snapshot Saved)', 'success');
    });
  }

  // 15. Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const inputStreamKey = document.getElementById('inputStreamKey');

  if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsModal);
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);
  if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettingsModal);

  // Settings Modal Navigation Tabs (YouTube / Facebook / Quality & Devices)
  const tabSettingsYt = document.getElementById('tabSettingsYt');
  const tabSettingsFb = document.getElementById('tabSettingsFb');
  const tabSettingsDevice = document.getElementById('tabSettingsDevice');

  const paneSettingsYt = document.getElementById('paneSettingsYt');
  const paneSettingsFb = document.getElementById('paneSettingsFb');
  const paneSettingsDevice = document.getElementById('paneSettingsDevice');

  function switchSettingsTab(tabName) {
    [tabSettingsYt, tabSettingsFb, tabSettingsDevice].forEach(t => {
      if (t) t.classList.remove('active');
    });
    [paneSettingsYt, paneSettingsFb, paneSettingsDevice].forEach(p => {
      if (p) p.style.display = 'none';
    });

    if (tabName === 'yt' && tabSettingsYt && paneSettingsYt) {
      tabSettingsYt.classList.add('active');
      paneSettingsYt.style.display = 'flex';
    } else if (tabName === 'fb' && tabSettingsFb && paneSettingsFb) {
      tabSettingsFb.classList.add('active');
      paneSettingsFb.style.display = 'flex';
    } else if (tabName === 'device' && tabSettingsDevice && paneSettingsDevice) {
      tabSettingsDevice.classList.add('active');
      paneSettingsDevice.style.display = 'flex';
    }
  }
  window.switchSettingsTab = switchSettingsTab;

  if (tabSettingsYt) tabSettingsYt.addEventListener('click', () => switchSettingsTab('yt'));
  if (tabSettingsFb) tabSettingsFb.addEventListener('click', () => switchSettingsTab('fb'));
  if (tabSettingsDevice) tabSettingsDevice.addEventListener('click', () => switchSettingsTab('device'));

  function openSettingsModal() {
    if (settingsModal) settingsModal.style.display = 'flex';
    // Default open active tab matching current platform
    if (streamConfig.targetPlatform === 'facebook') {
      switchSettingsTab('fb');
    } else {
      switchSettingsTab('yt');
    }
  }
  function closeSettingsModal() {
    if (settingsModal) settingsModal.style.display = 'none';
  }

  // 15.1 Multi-Channel YouTube Manager Logic
  const ytChannelsList = document.getElementById('ytChannelsList');
  const btnAddYtChannel = document.getElementById('btnAddYtChannel');
  const btnQuickManageChannels = document.getElementById('btnQuickManageChannels');

  if (btnQuickManageChannels) {
    btnQuickManageChannels.addEventListener('click', () => {
      openSettingsModal();
      switchSettingsTab('yt');
    });
  }

  function renderYtChannels() {
    if (!ytChannelsList) return;

    if (!Array.isArray(streamConfig.ytChannels) || streamConfig.ytChannels.length === 0) {
      streamConfig.ytChannels = [
        {
          id: 'yt_ch_1',
          name: 'ឆានែលទី ១ (YouTube Main)',
          rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: '',
          enabled: true
        }
      ];
    }

    let html = '';
    streamConfig.ytChannels.forEach((ch, idx) => {
      const isRtmps = (ch.rtmpUrl || '').startsWith('rtmps');
      html += `
        <div class="yt-ch-card ${ch.enabled ? 'enabled' : 'disabled'}" data-index="${idx}">
          <div class="yt-ch-card-header">
            <div class="yt-ch-header-left">
              <span class="yt-ch-badge">#${idx + 1}</span>
              <input type="text" class="form-input form-input-sm yt-ch-name-input" data-index="${idx}" value="${ch.name || `ឆានែល #${idx + 1}`}" placeholder="ឈ្មោះឆានែល">
            </div>
            <div class="yt-ch-header-right">
              <label class="switch-container switch-sm" title="បើក/បិទការផ្សាយលើឆានែលនេះ">
                <input type="checkbox" class="yt-ch-toggle-check" data-index="${idx}" ${ch.enabled ? 'checked' : ''}>
                <span class="switch-slider"></span>
              </label>
              <span class="yt-ch-status-label">${ch.enabled ? '🟢 បើក Live' : '⚪ បិទ'}</span>
              ${streamConfig.ytChannels.length > 1 ? `
                <button type="button" class="btn-del-channel" data-index="${idx}" title="លុបឆានែលនេះចេញ">🗑️</button>
              ` : ''}
            </div>
          </div>
          <div class="yt-ch-card-body">
            <div class="form-group mb-2">
              <label class="form-label" style="margin-bottom:4px; font-size:12px;">
                <span class="required">Stream Key:</span>
                <small class="text-muted">(ពី YouTube Studio)</small>
              </label>
              <div class="password-wrapper">
                <input type="password" class="form-input form-input-sm yt-ch-key-input" data-index="${idx}" value="${ch.streamKey || ''}" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx">
                <button type="button" class="btn-toggle-eye btn-toggle-ch-eye" data-index="${idx}">👁️</button>
              </div>
            </div>
            <div class="yt-ch-protocol-row">
              <span style="font-size:11px; color:var(--text-muted);">Server URL:</span>
              <div class="url-preset-chips mini">
                <button type="button" class="chip-btn chip-sm ${!isRtmps ? 'active' : ''}" data-action="set-url" data-index="${idx}" data-url="rtmp://a.rtmp.youtube.com/live2">📡 RTMP 1935</button>
                <button type="button" class="chip-btn chip-sm ${isRtmps ? 'active' : ''}" data-action="set-url" data-index="${idx}" data-url="rtmps://a.rtmps.youtube.com/live2">🔒 RTMPS 443</button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    ytChannelsList.innerHTML = html;

    // Attach listeners
    ytChannelsList.querySelectorAll('.yt-ch-name-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.index, 10);
        if (streamConfig.ytChannels[i]) {
          streamConfig.ytChannels[i].name = e.target.value.trim();
        }
      });
    });

    ytChannelsList.querySelectorAll('.yt-ch-key-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.index, 10);
        if (streamConfig.ytChannels[i]) {
          streamConfig.ytChannels[i].streamKey = e.target.value.trim();
          if (i === 0) {
            streamConfig.streamKey = streamConfig.ytChannels[i].streamKey;
            localStorage.setItem('yt_stream_key', streamConfig.streamKey);
          }
        }
        saveYtChannelsToStorage();
        updatePlatformUI(streamConfig.targetPlatform);
      });
    });

    ytChannelsList.querySelectorAll('.yt-ch-toggle-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const i = parseInt(e.target.dataset.index, 10);
        if (streamConfig.ytChannels[i]) {
          streamConfig.ytChannels[i].enabled = e.target.checked;
          const card = chk.closest('.yt-ch-card');
          if (card) card.classList.toggle('enabled', e.target.checked);
          const statusLbl = card ? card.querySelector('.yt-ch-status-label') : null;
          if (statusLbl) {
            statusLbl.textContent = e.target.checked ? '🟢 បើក Live' : '⚪ បិទ';
          }
        }
        saveYtChannelsToStorage();
        updatePlatformUI(streamConfig.targetPlatform);
      });
    });

    ytChannelsList.querySelectorAll('.btn-toggle-ch-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.index, 10);
        const card = btn.closest('.yt-ch-card');
        const inp = card ? card.querySelector('.yt-ch-key-input') : null;
        if (inp) {
          const isPass = inp.type === 'password';
          inp.type = isPass ? 'text' : 'password';
          btn.textContent = isPass ? '🙈' : '👁️';
        }
      });
    });

    ytChannelsList.querySelectorAll('[data-action="set-url"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.index, 10);
        const url = btn.dataset.url;
        if (streamConfig.ytChannels[i]) {
          streamConfig.ytChannels[i].rtmpUrl = url;
          if (i === 0) {
            streamConfig.rtmpUrl = url;
            localStorage.setItem('yt_rtmp_url', url);
          }
        }
        saveYtChannelsToStorage();
        renderYtChannels();
      });
    });

    ytChannelsList.querySelectorAll('.btn-del-channel').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.index, 10);
        if (streamConfig.ytChannels.length <= 1) {
          showToast('មិនអាចលុបឆានែលចុងក្រោយបានទេ!', 'warning');
          return;
        }
        const chName = streamConfig.ytChannels[i]?.name || `ឆានែល #${i + 1}`;
        if (confirm(`តើអ្នកពិតជាចង់លុប "${chName}" មែនទេ?`)) {
          streamConfig.ytChannels.splice(i, 1);
          saveYtChannelsToStorage();
          renderYtChannels();
          updatePlatformUI(streamConfig.targetPlatform);
          showToast(`🗑️ បានលុប "${chName}" រួចរាល់`, 'info');
        }
      });
    });
  }

  function saveYtChannelsToStorage() {
    localStorage.setItem('yt_channels', JSON.stringify(streamConfig.ytChannels));
    if (streamConfig.ytChannels[0]) {
      streamConfig.streamKey = streamConfig.ytChannels[0].streamKey || '';
      streamConfig.rtmpUrl = streamConfig.ytChannels[0].rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2';
      localStorage.setItem('yt_stream_key', streamConfig.streamKey);
      localStorage.setItem('yt_rtmp_url', streamConfig.rtmpUrl);
    }
  }

  if (btnAddYtChannel) {
    btnAddYtChannel.addEventListener('click', () => {
      const nextNum = streamConfig.ytChannels.length + 1;
      streamConfig.ytChannels.push({
        id: 'yt_ch_' + Date.now(),
        name: `ឆានែលទី ${nextNum} (YouTube)`,
        rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
        streamKey: '',
        enabled: true
      });
      saveYtChannelsToStorage();
      renderYtChannels();
      updatePlatformUI(streamConfig.targetPlatform);
      showToast(`➕ បានបន្ថែមឆានែលទី ${nextNum} រួចរាល់! សូមបញ្ចូល Stream Key`, 'success');
    });
  }

  renderYtChannels();

  const btnToggleFbStreamKey = document.getElementById('btnToggleFbStreamKey');
  const inputFbStreamKey = document.getElementById('inputFbStreamKey');
  if (btnToggleFbStreamKey && inputFbStreamKey) {
    btnToggleFbStreamKey.addEventListener('click', () => {
      const isPassword = inputFbStreamKey.type === 'password';
      inputFbStreamKey.type = isPassword ? 'text' : 'password';
      btnToggleFbStreamKey.textContent = isPassword ? '🙈' : '👁️';
    });
  }

  // Facebook RTMP / RTMPS Quick Switchers
  const btnFbUrlRtmps = document.getElementById('btnFbUrlRtmps');
  const btnFbUrlRtmp = document.getElementById('btnFbUrlRtmp');
  const inputFbRtmpUrl = document.getElementById('inputFbRtmpUrl');

  if (btnFbUrlRtmps && btnFbUrlRtmp && inputFbRtmpUrl) {
    if (streamConfig.fbRtmpUrl.startsWith('rtmp://')) {
      btnFbUrlRtmp.classList.add('active');
      btnFbUrlRtmps.classList.remove('active');
    } else {
      btnFbUrlRtmps.classList.add('active');
      btnFbUrlRtmp.classList.remove('active');
    }

    btnFbUrlRtmps.addEventListener('click', () => {
      inputFbRtmpUrl.value = 'rtmps://live-api-s.facebook.com:443/rtmp/';
      streamConfig.fbRtmpUrl = inputFbRtmpUrl.value;
      localStorage.setItem('fb_rtmp_url', streamConfig.fbRtmpUrl);
      btnFbUrlRtmps.classList.add('active');
      btnFbUrlRtmp.classList.remove('active');
      showToast('🔒 បានជ្រើសរើស Facebook RTMPS Port 443 (លំនាំដើម)', 'info');
    });

    btnFbUrlRtmp.addEventListener('click', () => {
      inputFbRtmpUrl.value = 'rtmp://live-api-s.facebook.com:80/rtmp/';
      streamConfig.fbRtmpUrl = inputFbRtmpUrl.value;
      localStorage.setItem('fb_rtmp_url', streamConfig.fbRtmpUrl);
      btnFbUrlRtmp.classList.add('active');
      btnFbUrlRtmps.classList.remove('active');
      showToast('📡 បានជ្រើសរើស Facebook RTMP Port 80', 'info');
    });
  }

  // Instant Auto-Save for Keys
  if (inputStreamKey) {
    inputStreamKey.addEventListener('input', (e) => {
      streamConfig.streamKey = e.target.value.trim();
      localStorage.setItem('yt_stream_key', streamConfig.streamKey);
    });
  }

  if (inputFbStreamKey) {
    inputFbStreamKey.addEventListener('input', (e) => {
      streamConfig.fbStreamKey = e.target.value.trim();
      localStorage.setItem('fb_stream_key', streamConfig.fbStreamKey);
    });
  }

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
    saveYtChannelsToStorage();
    updatePlatformUI(streamConfig.targetPlatform);

    if (inputFbRtmpUrl) streamConfig.fbRtmpUrl = inputFbRtmpUrl.value.trim();
    if (inputFbStreamKey) streamConfig.fbStreamKey = inputFbStreamKey.value.trim();

    streamConfig.resolution = document.getElementById('selectResolution').value;
    streamConfig.bitrate = document.getElementById('selectBitrate').value;
    if (document.getElementById('selectAudioBitrate')) {
      streamConfig.audioBitrate = document.getElementById('selectAudioBitrate').value;
      localStorage.setItem('yt_audio_bitrate', streamConfig.audioBitrate);
    }
    if (document.getElementById('selectDefaultOrientation')) {
      orientationMode = document.getElementById('selectDefaultOrientation').value;
      localStorage.setItem('yt_orientation_mode', orientationMode);
      if (orientationMode !== 'auto') {
        currentOrientation = orientationMode;
      }
    }
    streamConfig.cameraDeviceId = document.getElementById('selectCameraDevice').value;
    streamConfig.micDeviceId = document.getElementById('selectMicDevice').value;

    localStorage.setItem('yt_rtmp_url', streamConfig.rtmpUrl);
    localStorage.setItem('yt_stream_key', streamConfig.streamKey);
    localStorage.setItem('fb_rtmp_url', streamConfig.fbRtmpUrl);
    localStorage.setItem('fb_stream_key', streamConfig.fbStreamKey);
    localStorage.setItem('yt_resolution', streamConfig.resolution);
    localStorage.setItem('yt_bitrate', streamConfig.bitrate);
    localStorage.setItem('yt_camera_id', streamConfig.cameraDeviceId);
    localStorage.setItem('yt_mic_id', streamConfig.micDeviceId);

    applyOrientation(currentOrientation);
    closeSettingsModal();
    showToast('💾 បានរក្សាទុកការកំណត់រួចរាល់ (Settings Saved)', 'success');

    if (activeVideoSource === 'camera') {
      initCamera(streamConfig.cameraDeviceId);
    }
  });
}

  // Tab Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panelId = btn.dataset.tab;
      document.getElementById(panelId)?.classList.add('active');
    });
  });

  // 16. Toast Notification
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;

    toast.className = `toast-notification show ${type}`;
    toast.textContent = message;

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      toast.className = 'toast-notification';
    }, 3500);
  }
  window.showToast = showToast;

  // 17. Start Studio! (Start render loop immediately so UI and overlays render without delay)
  renderLoop();
  initCamera().catch(err => {
    console.warn('[Camera auto-init notice]', err);
  });
});
