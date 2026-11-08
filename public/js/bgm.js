/**
 * Background Music (BGM) & Audio Mixer Manager
 * Supports loading multiple MP3, WAV, OGG, AAC, and audio files.
 * Routes audio through Web Audio API to Live Stream (audioDestNode) & Local Headphones (destination).
 * Includes Auto-Ducking when speaking into Mic, Playlist Queue, Loop Modes, and Demo Melodies generator.
 */

class BgmManager {
  constructor(options = {}) {
    this.getAudioContext = options.getAudioContext || (() => null);
    this.getAudioDestNode = options.getAudioDestNode || (() => null);
    this.getAnalyserNode = options.getAnalyserNode || (() => null);
    this.showToast = options.showToast || ((msg) => console.log(msg));

    // Audio & Playlist State
    this.playlist = []; // Array of { id, name, file, url, format, sizeStr, duration, isDemo }
    this.currentIndex = -1;
    this.isPlaying = false;
    this.loopMode = localStorage.getItem('yt_bgm_loop_mode') || 'all'; // 'all', 'single', 'shuffle', 'none'
    this.volume = parseFloat(localStorage.getItem('yt_bgm_volume') ?? '0.35'); // Default 35% stream volume
    this.monitorEnabled = localStorage.getItem('yt_bgm_monitor') !== 'false'; // Default ON for local listening
    this.monitorVolume = parseFloat(localStorage.getItem('yt_bgm_monitor_vol') ?? '0.35');
    this.autoDucking = localStorage.getItem('yt_bgm_auto_ducking') !== 'false'; // Default ON

    // Web Audio Nodes
    this.audioContext = null;
    this.audioDestNode = null;
    this.analyserNode = null;
    this.bgmAudio = null;
    this.bgmSourceNode = null;
    this.bgmBroadcastGain = null;
    this.bgmMonitorGain = null;
    this.micAnalyserNode = null;

    // Auto-Ducking parameters
    this.isDucking = false;
    this.duckTimeout = null;
    this.duckFactor = 0.25; // Reduce to 25% of current volume during speech
    this.duckThreshold = 14; // Mic volume trigger threshold
    this.duckReleaseDelay = 750; // ms to return to normal after speech stops

    // Scrubber update state
    this.isScrubbing = false;

    // Bound handlers
    this._onTimeUpdate = this.onTimeUpdate.bind(this);
    this._onEnded = this.onEnded.bind(this);
    this._onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this._onError = this.onError.bind(this);
  }

  init() {
    this.bgmAudio = document.getElementById('bgmAudio');
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio();
      this.bgmAudio.id = 'bgmAudio';
      this.bgmAudio.preload = 'auto';
      document.body.appendChild(this.bgmAudio);
    }

    this.bgmAudio.addEventListener('timeupdate', this._onTimeUpdate);
    this.bgmAudio.addEventListener('ended', this._onEnded);
    this.bgmAudio.addEventListener('loadedmetadata', this._onLoadedMetadata);
    this.bgmAudio.addEventListener('error', this._onError);

    this.bindUI();
    this.renderPlaylistUI();
    this.updateNowPlayingUI();
    this.startDuckingLoop();
  }

  /**
   * Initialize Web Audio nodes once AudioContext is available
   */
  ensureAudioNodes() {
    try {
      if (!this.audioContext) {
        this.audioContext = this.getAudioContext();
      }
      if (!this.audioContext) return false;

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      this.audioDestNode = this.getAudioDestNode();
      this.analyserNode = this.getAnalyserNode();

      // Only create MediaElementSource once per audio element
      if (!this.bgmSourceNode && this.bgmAudio) {
        this.bgmSourceNode = this.audioContext.createMediaElementSource(this.bgmAudio);

        // 1. Live Broadcast Gain (Mixed into RTMP stream for YouTube / Facebook Live)
        this.bgmBroadcastGain = this.audioContext.createGain();
        this.bgmBroadcastGain.gain.setValueAtTime(this.volume, this.audioContext.currentTime);

        // 2. Local Monitor Gain (For streamer to hear in headphones / speakers)
        this.bgmMonitorGain = this.audioContext.createGain();
        const initialMonVal = this.monitorEnabled ? this.monitorVolume : 0;
        this.bgmMonitorGain.gain.setValueAtTime(initialMonVal, this.audioContext.currentTime);

        // Route: Audio -> Broadcast Gain -> AudioDestNode (Live Stream)
        this.bgmSourceNode.connect(this.bgmBroadcastGain);
        if (this.audioDestNode) {
          this.bgmBroadcastGain.connect(this.audioDestNode);
        }
        if (this.analyserNode) {
          this.bgmBroadcastGain.connect(this.analyserNode);
        }

        // Route: Audio -> Monitor Gain -> AudioContext Destination (Headphones / Speakers)
        this.bgmSourceNode.connect(this.bgmMonitorGain);
        this.bgmMonitorGain.connect(this.audioContext.destination);

        console.log('[BGM] Web Audio mixing graph initialized successfully.');
      } else {
        // Reconnect if destination or analyser nodes became available later
        this.reconnectNodes();
      }

      return true;
    } catch (err) {
      console.warn('[BGM] Error setting up audio nodes:', err);
      return false;
    }
  }

  reconnectNodes() {
    try {
      this.audioDestNode = this.getAudioDestNode();
      this.analyserNode = this.getAnalyserNode();

      if (this.bgmBroadcastGain && this.audioDestNode) {
        try { this.bgmBroadcastGain.disconnect(); } catch (e) {}
        this.bgmBroadcastGain.connect(this.audioDestNode);
        if (this.analyserNode) {
          this.bgmBroadcastGain.connect(this.analyserNode);
        }
      }
    } catch (e) {}
  }

  setMicAnalyser(node) {
    this.micAnalyserNode = node;
  }

  /**
   * Intelligent Auto-Ducking loop: Monitors mic input volume
   * and smoothly reduces BGM volume when streamer speaks.
   */
  startDuckingLoop() {
    const checkDucking = () => {
      if (this.autoDucking && this.micAnalyserNode && this.bgmBroadcastGain && this.isPlaying) {
        const bufferLength = this.micAnalyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.micAnalyserNode.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;

        if (avg >= this.duckThreshold) {
          // Streamer is speaking! Duck BGM immediately with quick smooth ramp
          if (!this.isDucking) {
            this.isDucking = true;
            this.applyDuckingGain(true);
          }
          if (this.duckTimeout) {
            clearTimeout(this.duckTimeout);
            this.duckTimeout = null;
          }
        } else if (this.isDucking) {
          // Streamer stopped speaking; wait release delay before restoring volume
          if (!this.duckTimeout) {
            this.duckTimeout = setTimeout(() => {
              this.isDucking = false;
              this.applyDuckingGain(false);
              this.duckTimeout = null;
            }, this.duckReleaseDelay);
          }
        }
      }
      requestAnimationFrame(checkDucking);
    };

    requestAnimationFrame(checkDucking);
  }

  applyDuckingGain(duck) {
    if (!this.bgmBroadcastGain || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    const targetBroadcast = duck ? (this.volume * this.duckFactor) : this.volume;
    const targetMonitor = this.monitorEnabled
      ? (duck ? (this.monitorVolume * this.duckFactor) : this.monitorVolume)
      : 0;

    // Smooth gain transition (200ms on duck, 400ms on restore)
    const timeConstant = duck ? 0.08 : 0.25;
    this.bgmBroadcastGain.gain.setTargetAtTime(targetBroadcast, now, timeConstant);
    if (this.bgmMonitorGain) {
      this.bgmMonitorGain.gain.setTargetAtTime(targetMonitor, now, timeConstant);
    }

    // Update Ducking visual indicator
    const duckBadge = document.getElementById('bgmDuckingBadge');
    if (duckBadge) {
      duckBadge.style.display = duck ? 'inline-flex' : 'none';
    }
  }

  /**
   * Load multiple MP3, WAV or audio files
   */
  async loadFiles(fileList, append = false) {
    if (!fileList || fileList.length === 0) return;

    this.ensureAudioNodes();

    const allowedExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'weba'];
    const newTracks = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const name = file.name;
      const ext = name.split('.').pop().toLowerCase();

      // Basic validation
      if (!allowedExts.includes(ext) && !file.type.startsWith('audio/')) {
        continue;
      }

      const id = 'bgm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const url = URL.createObjectURL(file);
      const format = ext.toUpperCase() || 'AUDIO';
      const sizeStr = this.formatFileSize(file.size);

      newTracks.push({
        id,
        name: this.cleanSongTitle(name),
        rawName: name,
        file,
        url,
        format,
        sizeStr,
        duration: 0,
        isDemo: false
      });
    }

    if (newTracks.length === 0) {
      this.showToast('⚠️ មិនមានហ្វាលចម្រៀង MP3 ឬ WAV ត្រឹមត្រូវទេ', 'warning');
      return;
    }

    if (append) {
      this.playlist.push(...newTracks);
      this.showToast(`➕ បានបន្ថែមចម្រៀង ${newTracks.length} បទទៀតចូលក្នុងបញ្ជី`, 'success');
    } else {
      // Clear old object URLs
      this.playlist.forEach(t => {
        if (t.url && !t.isDemo) URL.revokeObjectURL(t.url);
      });
      this.playlist = newTracks;
      this.currentIndex = 0;
      this.showToast(`🎵 បានផ្ទុកចម្រៀងចំនួន ${newTracks.length} បទរួចរាល់!`, 'success');
    }

    // Auto-probe durations in background
    this.probeDurations(newTracks);

    this.renderPlaylistUI();
    this.updateNowPlayingUI();

    // If it was empty or replaced, auto-load first track into player
    if (!this.isPlaying && this.currentIndex >= 0 && this.playlist[this.currentIndex]) {
      this.prepareTrack(this.currentIndex, false);
    }
  }

  cleanSongTitle(filename) {
    // Strip extension and unnecessary underscores/dashes for beautiful display
    return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  }

  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return mb.toFixed(1) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }

  probeDurations(tracks) {
    tracks.forEach(track => {
      const probeAudio = new Audio();
      probeAudio.preload = 'metadata';
      probeAudio.src = track.url;
      probeAudio.onloadedmetadata = () => {
        track.duration = probeAudio.duration || 0;
        this.renderPlaylistUI();
        if (this.currentIndex >= 0 && this.playlist[this.currentIndex]?.id === track.id) {
          this.updateNowPlayingUI();
        }
      };
    });
  }

  /**
   * Procedural Audio Synthesizer: Generates 3 Royalty-Free Chill / Lo-Fi Demo Melodies
   * without needing external files, encoded as real 16-bit PCM WAV blobs.
   */
  async generateDemoTracks() {
    this.showToast('⏳ កំពុងបង្កើតភ្លេងគំរូ Chill & Relax ឥតគិតថ្លៃ...', 'info');

    try {
      const sampleRate = 44100;
      const demoConfigs = [
        {
          name: '🎵 Chill Lo-Fi Lounge (ភ្លេងគំរូ)',
          format: 'WAV',
          bpm: 80,
          rootFreq: 130.81, // C3
          scale: [0, 4, 7, 11, 14], // Major 7/9 lush chords
          type: 'lofi',
          durationSec: 12
        },
        {
          name: '☕ Acoustic Coffeehouse (ភ្លេងគំរូ)',
          format: 'WAV',
          bpm: 96,
          rootFreq: 146.83, // D3
          scale: [0, 3, 7, 10, 14], // Minor 7/9 smooth coffee chords
          type: 'acoustic',
          durationSec: 10
        },
        {
          name: '✨ Ethereal Dream Pad (ភ្លេងគំរូ)',
          format: 'WAV',
          bpm: 65,
          rootFreq: 110.00, // A2
          scale: [0, 5, 7, 12, 16], // Dreamy ambient pentatonic
          type: 'ambient',
          durationSec: 14
        }
      ];

      const newDemoTracks = [];

      for (const cfg of demoConfigs) {
        const totalSamples = Math.floor(sampleRate * cfg.durationSec);
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
          2,
          totalSamples,
          sampleRate
        );

        // Synth logic based on cfg
        const numChords = 4;
        const chordDuration = cfg.durationSec / numChords;

        for (let c = 0; c < numChords; c++) {
          const startTime = c * chordDuration;
          const chordOffset = [0, 5, 7, 3][c % 4];

          cfg.scale.forEach((interval, noteIdx) => {
            const freq = cfg.rootFreq * Math.pow(2, (interval + chordOffset) / 12);
            const osc = offlineCtx.createOscillator();
            const gain = offlineCtx.createGain();

            // Warm tone
            osc.type = cfg.type === 'lofi' ? 'triangle' : (cfg.type === 'acoustic' ? 'sine' : 'triangle');
            osc.frequency.setValueAtTime(freq, startTime);

            // Natural ADSR envelope
            const noteStart = startTime + (cfg.type === 'acoustic' ? noteIdx * 0.12 : 0);
            gain.gain.setValueAtTime(0.0001, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.12 / (noteIdx + 1), noteStart + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.0001, startTime + chordDuration - 0.05);

            osc.connect(gain);
            gain.connect(offlineCtx.destination);

            osc.start(noteStart);
            osc.stop(startTime + chordDuration);
          });
        }

        const renderedBuffer = await offlineCtx.startRendering();
        const wavBlob = this.audioBufferToWav(renderedBuffer);
        const url = URL.createObjectURL(wavBlob);

        newDemoTracks.push({
          id: 'demo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name: cfg.name,
          rawName: cfg.name + '.wav',
          file: null,
          url,
          format: 'WAV',
          sizeStr: this.formatFileSize(wavBlob.size),
          duration: cfg.durationSec,
          isDemo: true
        });
      }

      this.playlist.push(...newDemoTracks);
      if (this.currentIndex === -1) {
        this.currentIndex = 0;
        this.prepareTrack(0, false);
      }

      this.renderPlaylistUI();
      this.updateNowPlayingUI();
      this.showToast('✨ បានបង្កើតភ្លេងគំរូចំនួន 3 បទជោគជ័យ! អ្នកអាចចុច Play បានភ្លាមៗ', 'success');

    } catch (err) {
      console.error('[BGM Demo Generator Error]:', err);
      this.showToast('មិនអាចបង្កើតភ្លេងគំរូបានទេ៖ ' + err.message, 'error');
    }
  }

  /**
   * Convert AudioBuffer into standard 16-bit PCM RIFF WAV Blob
   */
  audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // Write RIFF identifier & file length
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');

    // Write fmt subchunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1 size
    view.setUint16(20, format, true); // audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // Write data subchunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave left and right channels & clamp to 16-bit PCM
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][i];
        // Clamp [-1, 1]
        sample = Math.max(-1, Math.min(1, sample));
        // Scale to 16-bit integer
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Prepare a track without necessarily starting playback
   */
  prepareTrack(index, autoPlay = true) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    const track = this.playlist[index];

    this.ensureAudioNodes();
    this.bgmAudio.src = track.url;
    this.bgmAudio.loop = (this.loopMode === 'single');

    if (autoPlay) {
      this.playTrack(index);
    } else {
      this.updateNowPlayingUI();
      this.renderPlaylistUI();
    }
  }

  /**
   * Play track at specified index
   */
  async playTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;

    this.ensureAudioNodes();

    if (this.currentIndex !== index || !this.bgmAudio.src) {
      this.currentIndex = index;
      const track = this.playlist[index];
      this.bgmAudio.src = track.url;
      this.bgmAudio.loop = (this.loopMode === 'single');
    }

    try {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      await this.bgmAudio.play();
      this.isPlaying = true;
      this.updateNowPlayingUI();
      this.renderPlaylistUI();
    } catch (err) {
      console.warn('[BGM Play Error]:', err);
      this.isPlaying = false;
      this.updateNowPlayingUI();
      this.showToast('⚠️ សូមចុច Play ម្តងទៀតដើម្បីអនុញ្ញាតសម្លេង', 'warning');
    }
  }

  /**
   * Toggle Play / Pause
   */
  async togglePlayPause() {
    if (this.playlist.length === 0) {
      // Trigger file selector or demo prompt
      const input = document.getElementById('inputBgmFiles');
      if (input) input.click();
      return;
    }

    this.ensureAudioNodes();

    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }

    if (this.bgmAudio.paused || !this.isPlaying) {
      await this.playTrack(this.currentIndex);
    } else {
      this.bgmAudio.pause();
      this.isPlaying = false;
      this.updateNowPlayingUI();
      this.renderPlaylistUI();
    }
  }

  nextTrack() {
    if (this.playlist.length === 0) return;

    let nextIdx = this.currentIndex + 1;

    if (this.loopMode === 'shuffle') {
      if (this.playlist.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * this.playlist.length);
        } while (nextIdx === this.currentIndex);
      }
    } else if (nextIdx >= this.playlist.length) {
      if (this.loopMode === 'all') {
        nextIdx = 0;
      } else {
        // No loop / stop at end
        this.stop();
        return;
      }
    }

    this.playTrack(nextIdx);
  }

  prevTrack() {
    if (this.playlist.length === 0) return;

    // If already played more than 3 seconds, replay current song first
    if (this.bgmAudio.currentTime > 3) {
      this.bgmAudio.currentTime = 0;
      return;
    }

    let prevIdx = this.currentIndex - 1;
    if (prevIdx < 0) {
      prevIdx = this.playlist.length - 1;
    }

    this.playTrack(prevIdx);
  }

  stop() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
    this.isPlaying = false;
    this.updateNowPlayingUI();
    this.renderPlaylistUI();
  }

  seek(seconds) {
    if (!this.bgmAudio) return;
    this.bgmAudio.currentTime = seconds;
  }

  setVolume(vol) {
    // vol: 0 to 1
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('yt_bgm_volume', this.volume.toString());

    if (this.bgmBroadcastGain && this.audioContext) {
      const now = this.audioContext.currentTime;
      const target = this.isDucking ? (this.volume * this.duckFactor) : this.volume;
      this.bgmBroadcastGain.gain.setTargetAtTime(target, now, 0.05);
    }

    // Sync volume sliders
    const sliderTab = document.getElementById('sliderBgmVolume');
    const sliderQuick = document.getElementById('quickBgmVolume');
    const valBadge = document.getElementById('labelBgmVolumeVal');

    const pct = Math.round(this.volume * 100);
    if (sliderTab) sliderTab.value = pct;
    if (sliderQuick) sliderQuick.value = pct;
    if (valBadge) valBadge.textContent = `${pct}%`;
  }

  setMonitor(enabled, vol = null) {
    this.monitorEnabled = !!enabled;
    localStorage.setItem('yt_bgm_monitor', this.monitorEnabled.toString());

    if (vol !== null) {
      this.monitorVolume = Math.max(0, Math.min(1, vol));
      localStorage.setItem('yt_bgm_monitor_vol', this.monitorVolume.toString());
    }

    if (this.bgmMonitorGain && this.audioContext) {
      const now = this.audioContext.currentTime;
      const target = this.monitorEnabled
        ? (this.isDucking ? (this.monitorVolume * this.duckFactor) : this.monitorVolume)
        : 0;
      this.bgmMonitorGain.gain.setTargetAtTime(target, now, 0.05);
    }

    const checkMonitor = document.getElementById('checkBgmMonitor');
    const sliderMon = document.getElementById('sliderBgmMonitorVol');
    const monValBadge = document.getElementById('labelBgmMonitorVal');

    if (checkMonitor) checkMonitor.checked = this.monitorEnabled;
    if (sliderMon) {
      sliderMon.disabled = !this.monitorEnabled;
      sliderMon.value = Math.round(this.monitorVolume * 100);
    }
    if (monValBadge) {
      monValBadge.textContent = this.monitorEnabled ? `${Math.round(this.monitorVolume * 100)}%` : 'បិទ (Muted)';
    }
  }

  setAutoDucking(enabled) {
    this.autoDucking = !!enabled;
    localStorage.setItem('yt_bgm_auto_ducking', this.autoDucking.toString());

    if (!this.autoDucking && this.isDucking) {
      this.isDucking = false;
      this.applyDuckingGain(false);
    }

    const checkDuck = document.getElementById('checkBgmAutoDucking');
    if (checkDuck) checkDuck.checked = this.autoDucking;

    this.showToast(this.autoDucking ? '🎙️ បានបើកមុខងារបន្ថយភ្លេងស្វ័យប្រវត្តពេលនិយាយ' : '🔇 បានបិទមុខងារ Auto-Ducking', 'info');
  }

  setLoopMode(mode) {
    const valid = ['all', 'single', 'shuffle', 'none'];
    if (!valid.includes(mode)) return;
    this.loopMode = mode;
    localStorage.setItem('yt_bgm_loop_mode', mode);

    if (this.bgmAudio) {
      this.bgmAudio.loop = (mode === 'single');
    }

    document.querySelectorAll('.bgm-loop-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.loop === mode);
    });

    const labels = {
      all: '🔁 វិលជុំទាំងអស់ (Loop All)',
      single: '🔂 វិលជុំមួយបទ (Loop One)',
      shuffle: '🔀 ចាក់ចៃដន្យ (Shuffle)',
      none: '⏹️ ចាក់ចប់ឈប់ (No Loop)'
    };
    this.showToast(`របៀបចាក់ភ្លេង៖ ${labels[mode]}`, 'info');
  }

  removeTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    const removed = this.playlist[index];

    if (removed.url && !removed.isDemo) {
      URL.revokeObjectURL(removed.url);
    }

    const wasPlayingCurrent = (this.currentIndex === index);
    this.playlist.splice(index, 1);

    if (this.playlist.length === 0) {
      this.stop();
      this.currentIndex = -1;
      if (this.bgmAudio) this.bgmAudio.src = '';
    } else if (wasPlayingCurrent) {
      if (index >= this.playlist.length) {
        this.currentIndex = 0;
      }
      this.prepareTrack(this.currentIndex, this.isPlaying);
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    }

    this.renderPlaylistUI();
    this.updateNowPlayingUI();
    this.showToast(`🗑️ បានលុបបទ "${removed.name}" ចេញពីបញ្ជី`, 'warning');
  }

  moveTrack(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.playlist.length) return;
    if (toIndex < 0 || toIndex >= this.playlist.length) return;

    const currentTrackId = this.playlist[this.currentIndex]?.id;
    const item = this.playlist.splice(fromIndex, 1)[0];
    this.playlist.splice(toIndex, 0, item);

    // Update currentIndex
    this.currentIndex = this.playlist.findIndex(t => t.id === currentTrackId);

    this.renderPlaylistUI();
  }

  clearPlaylist() {
    if (this.playlist.length === 0) return;
    if (!confirm('តើអ្នកពិតជាចង់សម្អាតបញ្ជីចម្រៀងអមទាំងអស់មែនទេ? (Clear all songs?)')) return;

    this.stop();
    this.playlist.forEach(t => {
      if (t.url && !t.isDemo) URL.revokeObjectURL(t.url);
    });
    this.playlist = [];
    this.currentIndex = -1;
    if (this.bgmAudio) this.bgmAudio.src = '';

    this.renderPlaylistUI();
    this.updateNowPlayingUI();
    this.showToast('🗑️ បានសម្អាតបញ្ជីចម្រៀងអមទាំងអស់រួចរាល់', 'info');
  }

  // Audio Event Listeners
  onTimeUpdate() {
    if (this.isScrubbing) return;
    const cur = this.bgmAudio.currentTime || 0;
    const dur = this.bgmAudio.duration || (this.playlist[this.currentIndex]?.duration || 0);

    const scrubber = document.getElementById('bgmScrubber');
    const curLabel = document.getElementById('bgmTimeCurrent');
    const durLabel = document.getElementById('bgmTimeDuration');

    if (scrubber && dur > 0) {
      scrubber.value = ((cur / dur) * 100).toFixed(1);
    }
    if (curLabel) curLabel.textContent = this.formatTime(cur);
    if (durLabel && dur > 0) durLabel.textContent = this.formatTime(dur);
  }

  onEnded() {
    if (this.loopMode === 'single') {
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.play();
    } else {
      this.nextTrack();
    }
  }

  onLoadedMetadata() {
    if (this.currentIndex >= 0 && this.playlist[this.currentIndex]) {
      this.playlist[this.currentIndex].duration = this.bgmAudio.duration || 0;
      this.updateNowPlayingUI();
      this.renderPlaylistUI();
    }
  }

  onError(e) {
    console.warn('[BGM Audio Error]:', e);
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // UI Updates & Rendering
  updateNowPlayingUI() {
    const track = this.playlist[this.currentIndex];
    const isPlaying = this.isPlaying && !this.bgmAudio.paused;

    // 1. Play / Pause icons
    const iconMain = document.getElementById('bgmPlayPauseIcon');
    const iconQuick = document.getElementById('quickBgmIcon');
    if (iconMain) iconMain.textContent = isPlaying ? '⏸️' : '▶️';
    if (iconQuick) iconQuick.textContent = isPlaying ? '⏸️' : '🎵';

    // 2. Title & Status
    const titleEl = document.getElementById('bgmCurrentTitle');
    const statusEl = document.getElementById('bgmCurrentStatus');
    const badgeFormat = document.getElementById('bgmFormatBadge');
    const quickTitle = document.getElementById('quickBgmTitle');

    if (track) {
      if (titleEl) titleEl.textContent = track.name;
      if (statusEl) {
        statusEl.textContent = isPlaying ? '🎵 កំពុងចាក់លើ Live' : '⏸️ បានផ្អាក (Paused)';
        statusEl.className = 'bgm-status-pill ' + (isPlaying ? 'playing' : 'paused');
      }
      if (badgeFormat) {
        badgeFormat.textContent = track.format;
        badgeFormat.style.display = 'inline-block';
        badgeFormat.className = 'badge-format ' + track.format.toLowerCase();
      }
      if (quickTitle) {
        quickTitle.textContent = (isPlaying ? '▶ ' : '') + track.name;
        quickTitle.title = track.name;
      }
    } else {
      if (titleEl) titleEl.textContent = 'មិនទាន់មានចម្រៀង (No Music Loaded)';
      if (statusEl) {
        statusEl.textContent = '⏹️ គ្មានចម្រៀង';
        statusEl.className = 'bgm-status-pill empty';
      }
      if (badgeFormat) badgeFormat.style.display = 'none';
      if (quickTitle) quickTitle.textContent = 'ភ្លេងអម BGM (គ្មាន)';
    }

    // 3. Audio Equalizer Wave Animation
    const waveEl = document.getElementById('bgmWaveAnimation');
    if (waveEl) {
      waveEl.classList.toggle('active', isPlaying);
    }
    const quickGroup = document.getElementById('quickBgmGroup');
    if (quickGroup) {
      quickGroup.classList.toggle('playing', isPlaying);
    }

    // 4. Time display
    const cur = this.bgmAudio?.currentTime || 0;
    const dur = this.bgmAudio?.duration || (track?.duration || 0);
    const curLabel = document.getElementById('bgmTimeCurrent');
    const durLabel = document.getElementById('bgmTimeDuration');
    if (curLabel) curLabel.textContent = this.formatTime(cur);
    if (durLabel) durLabel.textContent = this.formatTime(dur);

    // 5. Total count summary
    const countBadge = document.getElementById('bgmTotalCountBadge');
    if (countBadge) countBadge.textContent = `${this.playlist.length} បទ`;
  }

  renderPlaylistUI() {
    const container = document.getElementById('bgmPlaylistItems');
    if (!container) return;

    if (this.playlist.length === 0) {
      container.innerHTML = `
        <div class="bgm-empty-state">
          <div class="empty-icon">🎵</div>
          <h4>មិនទាន់មានចម្រៀងអមនៅឡើយទេ</h4>
          <p>ផ្ទុកហ្វាល MP3, WAV ច្រើនបទ ឬចុចបង្កើត «ភ្លេងគំរូ Chill & Relax» ដើម្បីចាក់អមពេល Live</p>
          <div class="empty-actions">
            <label class="btn btn-primary btn-sm" style="cursor:pointer;">
              📂 ផ្ទុកចម្រៀង MP3 / WAV ពីកុំព្យូទ័រ
              <input type="file" id="inputBgmEmpty" multiple accept="audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/flac,audio/*" style="display:none;">
            </label>
            <button type="button" class="btn btn-secondary btn-sm" id="btnGenDemoEmpty">
              ✨ បង្កើតភ្លេងគំរូ Chill & Relax
            </button>
          </div>
        </div>
      `;

      const inputEmpty = document.getElementById('inputBgmEmpty');
      if (inputEmpty) {
        inputEmpty.addEventListener('change', (e) => this.loadFiles(e.target.files));
      }
      const btnDemoEmpty = document.getElementById('btnGenDemoEmpty');
      if (btnDemoEmpty) {
        btnDemoEmpty.addEventListener('click', () => this.generateDemoTracks());
      }
      return;
    }

    let html = '';
    this.playlist.forEach((track, idx) => {
      const isCurrent = (idx === this.currentIndex);
      const isCurrentPlaying = isCurrent && this.isPlaying;

      html += `
        <div class="bgm-item ${isCurrent ? 'active' : ''}" data-index="${idx}">
          <div class="bgm-item-left">
            <button type="button" class="btn-play-item" data-action="play" data-index="${idx}" title="${isCurrentPlaying ? 'ផ្អាក' : 'ចាក់'}">
              ${isCurrentPlaying ? '⏸️' : '▶️'}
            </button>
            <span class="bgm-item-num">#${idx + 1}</span>
            <div class="bgm-item-meta">
              <span class="bgm-item-title" title="${track.rawName}">${track.name}</span>
              <div class="bgm-item-sub">
                <span class="badge-format ${track.format.toLowerCase()}">${track.format}</span>
                <span class="bgm-item-size">${track.sizeStr}</span>
                <span class="bgm-item-dur">${track.duration ? this.formatTime(track.duration) : '--:--'}</span>
                ${track.isDemo ? '<span class="badge-demo">✨ គំរូ</span>' : ''}
              </div>
            </div>
          </div>
          <div class="bgm-item-right">
            ${isCurrentPlaying ? '<div class="mini-eq-bars"><span></span><span></span><span></span></div>' : ''}
            <button type="button" class="btn-item-action" data-action="up" data-index="${idx}" title="រំកិលឡើងលើ" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
            <button type="button" class="btn-item-action" data-action="down" data-index="${idx}" title="រំកិលចុះក្រោម" ${idx === this.playlist.length - 1 ? 'disabled' : ''}>⬇️</button>
            <button type="button" class="btn-item-action delete" data-action="delete" data-index="${idx}" title="លុបចេញពីបញ្ជី">🗑️</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Attach row events
    container.querySelectorAll('.bgm-item').forEach(row => {
      const idx = parseInt(row.dataset.index, 10);

      row.addEventListener('click', (e) => {
        // If clicking directly on action buttons, let them handle it
        if (e.target.closest('button')) return;
        this.playTrack(idx);
      });

      const playBtn = row.querySelector('[data-action="play"]');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (idx === this.currentIndex && this.isPlaying) {
            this.bgmAudio.pause();
            this.isPlaying = false;
            this.updateNowPlayingUI();
            this.renderPlaylistUI();
          } else {
            this.playTrack(idx);
          }
        });
      }

      const upBtn = row.querySelector('[data-action="up"]');
      if (upBtn) {
        upBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.moveTrack(idx, idx - 1);
        });
      }

      const downBtn = row.querySelector('[data-action="down"]');
      if (downBtn) {
        downBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.moveTrack(idx, idx + 1);
        });
      }

      const delBtn = row.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeTrack(idx);
        });
      }
    });
  }

  bindUI() {
    // 1. File Inputs
    const inputFiles = document.getElementById('inputBgmFiles');
    const inputAddMore = document.getElementById('inputBgmAddMore');

    if (inputFiles) {
      inputFiles.addEventListener('change', (e) => {
        this.loadFiles(e.target.files, false);
        e.target.value = '';
      });
    }
    if (inputAddMore) {
      inputAddMore.addEventListener('change', (e) => {
        this.loadFiles(e.target.files, true);
        e.target.value = '';
      });
    }

    // 2. Drag & Drop Zone
    const dropZone = document.getElementById('bgmDropZone');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove('drag-over');
        });
      });
      dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
          this.loadFiles(e.dataTransfer.files, this.playlist.length > 0);
        }
      });
    }

    // 3. Main Transport Buttons
    const btnPlayPause = document.getElementById('btnBgmPlayPause');
    const btnPrev = document.getElementById('btnBgmPrev');
    const btnNext = document.getElementById('btnBgmNext');
    const btnStop = document.getElementById('btnBgmStop');

    if (btnPlayPause) btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    if (btnPrev) btnPrev.addEventListener('click', () => this.prevTrack());
    if (btnNext) btnNext.addEventListener('click', () => this.nextTrack());
    if (btnStop) btnStop.addEventListener('click', () => this.stop());

    // 4. Quick Mini-Player Bar
    const btnQuickPlay = document.getElementById('btnQuickBgmPlay');
    const quickTitle = document.getElementById('quickBgmTitle');
    const quickGroup = document.getElementById('quickBgmGroup');
    const btnQuickOpenTab = document.getElementById('btnQuickOpenBgmTab');

    if (btnQuickPlay) {
      btnQuickPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlayPause();
      });
    }

    const openBgmTab = () => {
      const tabBtn = document.querySelector('.tab-btn[data-tab="tab-bgm"]');
      if (tabBtn) tabBtn.click();
    };

    if (quickTitle) quickTitle.addEventListener('click', openBgmTab);
    if (btnQuickOpenTab) btnQuickOpenTab.addEventListener('click', openBgmTab);

    // 5. Volume Sliders
    const sliderTab = document.getElementById('sliderBgmVolume');
    const sliderQuick = document.getElementById('quickBgmVolume');

    if (sliderTab) {
      sliderTab.value = Math.round(this.volume * 100);
      sliderTab.addEventListener('input', (e) => this.setVolume(e.target.value / 100));
    }
    if (sliderQuick) {
      sliderQuick.value = Math.round(this.volume * 100);
      sliderQuick.addEventListener('input', (e) => this.setVolume(e.target.value / 100));
    }

    const valBadge = document.getElementById('labelBgmVolumeVal');
    if (valBadge) valBadge.textContent = `${Math.round(this.volume * 100)}%`;

    // 6. Monitor Audio Toggle & Slider
    const checkMonitor = document.getElementById('checkBgmMonitor');
    const sliderMon = document.getElementById('sliderBgmMonitorVol');
    const monValBadge = document.getElementById('labelBgmMonitorVal');

    if (checkMonitor) {
      checkMonitor.checked = this.monitorEnabled;
      checkMonitor.addEventListener('change', (e) => {
        this.setMonitor(e.target.checked);
        this.showToast(e.target.checked ? '🎧 បានបើកសម្លេងភ្លេងក្នុងកាស' : '🔇 បានបិទសម្លេងក្នុងកាស (តែនៅឮលើ Live ដដែល)', 'info');
      });
    }
    if (sliderMon) {
      sliderMon.value = Math.round(this.monitorVolume * 100);
      sliderMon.disabled = !this.monitorEnabled;
      sliderMon.addEventListener('input', (e) => {
        this.setMonitor(this.monitorEnabled, e.target.value / 100);
      });
    }
    if (monValBadge) {
      monValBadge.textContent = this.monitorEnabled ? `${Math.round(this.monitorVolume * 100)}%` : 'បិទ (Muted)';
    }

    // 7. Auto-Ducking Checkbox
    const checkDuck = document.getElementById('checkBgmAutoDucking');
    if (checkDuck) {
      checkDuck.checked = this.autoDucking;
      checkDuck.addEventListener('change', (e) => this.setAutoDucking(e.target.checked));
    }

    // 8. Loop Mode Buttons
    document.querySelectorAll('.bgm-loop-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.loop === this.loopMode);
      btn.addEventListener('click', () => {
        this.setLoopMode(btn.dataset.loop);
      });
    });

    // 9. Scrubber Slider
    const scrubber = document.getElementById('bgmScrubber');
    if (scrubber) {
      scrubber.addEventListener('mousedown', () => { this.isScrubbing = true; });
      scrubber.addEventListener('touchstart', () => { this.isScrubbing = true; });

      scrubber.addEventListener('input', (e) => {
        const pct = parseFloat(e.target.value) / 100;
        const dur = this.bgmAudio?.duration || 0;
        const curLabel = document.getElementById('bgmTimeCurrent');
        if (curLabel && dur > 0) {
          curLabel.textContent = this.formatTime(pct * dur);
        }
      });

      const onScrubEnd = (e) => {
        if (!this.isScrubbing) return;
        this.isScrubbing = false;
        const pct = parseFloat(e.target.value) / 100;
        const dur = this.bgmAudio?.duration || 0;
        if (dur > 0) {
          this.seek(pct * dur);
        }
      };

      scrubber.addEventListener('mouseup', onScrubEnd);
      scrubber.addEventListener('touchend', onScrubEnd);
      scrubber.addEventListener('change', onScrubEnd);
    }

    // 10. Generate Demo Melodies Button
    const btnDemo = document.getElementById('btnBgmGenerateDemo');
    if (btnDemo) {
      btnDemo.addEventListener('click', () => this.generateDemoTracks());
    }

    // 11. Clear Playlist Button
    const btnClear = document.getElementById('btnBgmClear');
    if (btnClear) {
      btnClear.addEventListener('click', () => this.clearPlaylist());
    }
  }
}

// Export to window for vanilla JS module usage
window.BgmManager = BgmManager;
