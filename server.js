const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

// ─── yt-dlp resolver (auto-download yt-dlp.exe on first use) ────────────────
const YTDLP_EXE = path.join(__dirname, 'yt-dlp.exe');
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

let ytdlpReady = fs.existsSync(YTDLP_EXE);
let ytdlpDownloading = false;
let ytdlpDownloadPromise = null;

async function ensureYtDlp() {
  if (ytdlpReady) return true;
  if (ytdlpDownloading) return ytdlpDownloadPromise;

  ytdlpDownloading = true;
  ytdlpDownloadPromise = (async () => {
    try {
      console.log('[yt-dlp] ⏳ Downloading yt-dlp.exe from GitHub...');
      const resp = await fetch(YTDLP_URL, { signal: AbortSignal.timeout(60000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      fs.writeFileSync(YTDLP_EXE, Buffer.from(buf));
      ytdlpReady = true;
      ytdlpDownloading = false;
      console.log('[yt-dlp] ✅ yt-dlp.exe downloaded successfully!');
      return true;
    } catch (err) {
      ytdlpDownloading = false;
      console.error('[yt-dlp] ❌ Download failed:', err.message);
      return false;
    }
  })();
  return ytdlpDownloadPromise;
}

function getFormatSelector(quality = '720') {
  switch (String(quality).toLowerCase()) {
    case '1080':
      return 'best[height=1080][ext=mp4]/best[width=1080][ext=mp4]/best[height<=1080][ext=mp4]/best[width<=1080][ext=mp4]/22/best[height<=720][ext=mp4]/18/best';
    case '720':
      return '22/best[height=720][ext=mp4]/best[width=720][ext=mp4]/best[height<=720][ext=mp4]/best[width<=720][ext=mp4]/18/best';
    case '480':
      return 'best[height=480][ext=mp4]/best[width=480][ext=mp4]/best[height<=480][ext=mp4]/best[width<=480][ext=mp4]/18/best';
    case '360':
      return '18/best[height=360][ext=mp4]/best[width=360][ext=mp4]/best[height<=360][ext=mp4]/best[width<=360][ext=mp4]/best';
    case 'auto':
    default:
      return '22/best[height<=1080][ext=mp4]/best[width<=1080][ext=mp4]/best[height<=720][ext=mp4]/18/best[ext=mp4]/best';
  }
}

// Run yt-dlp and return the direct stream URL(s)
function ytdlpGetUrl(videoUrl, quality = '720', extraArgs = []) {
  return new Promise((resolve, reject) => {
    const nodeJsRuntime = process.execPath ? `node:${process.execPath}` : 'node';
    const formatString = getFormatSelector(quality);
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--js-runtimes', nodeJsRuntime,
      // Format selection based on user-chosen quality
      '-f', formatString,
      '--get-url',
      ...extraArgs,
      videoUrl
    ];
    const cookiesFile = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesFile)) {
      args.push('--cookies', cookiesFile);
    }

    const proc = spawn(YTDLP_EXE, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('yt-dlp timeout (30s)'));
    }, 30000);

    proc.on('close', code => {
      clearTimeout(timeout);
      const urls = stdout.trim().split('\n').map(s => s.trim()).filter(s => s.startsWith('http'));
      if (urls.length > 0) {
        resolve(urls);
      } else {
        reject(new Error(stderr.trim() || `yt-dlp exited code ${code}`));
      }
    });
    proc.on('error', err => { clearTimeout(timeout); reject(err); });
  });
}

// Run yt-dlp --dump-json to get video metadata
function ytdlpGetInfo(videoUrl) {
  return new Promise((resolve) => {
    const nodeJsRuntime = process.execPath ? `node:${process.execPath}` : 'node';
    const args = [
      '--no-playlist', '--no-warnings', '--no-check-certificates',
      '--js-runtimes', nodeJsRuntime,
      '--dump-json', videoUrl
    ];
    const cookiesFile = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesFile)) {
      args.push('--cookies', cookiesFile);
    }
    const proc = spawn(YTDLP_EXE, args);
    let stdout = '';
    const timeout = setTimeout(() => { proc.kill(); resolve(null); }, 20000);
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.on('close', () => {
      clearTimeout(timeout);
      try { resolve(JSON.parse(stdout.trim())); } catch { resolve(null); }
    });
    proc.on('error', () => { clearTimeout(timeout); resolve(null); });
  });
}

if (ytdlpReady) {
  console.log('[yt-dlp] ✅ yt-dlp.exe found — YouTube/Facebook resolver ready');
} else {
  console.log('[yt-dlp] ℹ️  yt-dlp.exe not found — will auto-download on first use');
}

// Get FFmpeg binary path
let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
  console.warn('Using system ffmpeg fallback:', e.message);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API health endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    ffmpegAvailable: !!ffmpegPath,
    ffmpegPath: ffmpegPath
  });
});

// =====================================================================
// /api/proxy-video  — Stream proxy forwarding video bytes with Range support
//                     Ensures Same-Origin, NO CORS errors, Clean Canvas,
//                     and Full Audio Output!
// =====================================================================
app.get('/api/proxy-video', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    if (req.headers.range) {
      reqHeaders['Range'] = req.headers.range;
    }

    const remoteResp = await fetch(url, { headers: reqHeaders });

    // CORS & Range headers so canvas is never tainted
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    res.setHeader('Accept-Ranges', 'bytes');

    const cType = remoteResp.headers.get('content-type') || 'video/mp4';
    res.setHeader('Content-Type', cType);

    const cLen = remoteResp.headers.get('content-length');
    if (cLen) res.setHeader('Content-Length', cLen);

    const cRange = remoteResp.headers.get('content-range');
    if (cRange) {
      res.setHeader('Content-Range', cRange);
      res.status(206);
    } else {
      res.status(remoteResp.status);
    }

    if (!remoteResp.body) {
      return res.end();
    }

    const { Readable } = require('stream');
    const nodeStream = Readable.fromWeb(remoteResp.body);
    nodeStream.on('error', () => {});
    req.on('close', () => {
      try { nodeStream.destroy(); } catch (e) {}
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).send(`Proxy Error: ${err.message}`);
    }
  }
});

// =====================================================================
// /api/resolve-link  — Resolve YouTube / Facebook / HLS / direct URL
//                      to a playable video stream URL via yt-dlp
// =====================================================================
app.get('/api/resolve-link', async (req, res) => {
  const { url, quality = '720' } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: 'Missing url parameter' });

  let rawUrl = String(url).trim();

  // Normalize YouTube Channel Handles & Channel URLs to /live
  if (rawUrl.startsWith('@')) {
    rawUrl = `https://www.youtube.com/${rawUrl}/live`;
  } else if ((rawUrl.includes('youtube.com/@') || rawUrl.includes('youtube.com/c/') || rawUrl.includes('youtube.com/channel/')) && !rawUrl.includes('/live') && !rawUrl.includes('/watch')) {
    rawUrl = rawUrl.replace(/\/+$/, '') + '/live';
  }

  const isYouTube = rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be');
  const isFacebook = rawUrl.includes('facebook.com') || rawUrl.includes('fb.watch');

  // ── YouTube or Facebook → resolve via yt-dlp ─────────────────────────
  if (isYouTube || isFacebook) {
    res.setHeader('Content-Type', 'application/json');

    const hasYtDlp = await ensureYtDlp();
    if (!hasYtDlp) {
      return res.status(503).json({
        ok: false,
        error: 'ytdlp_unavailable',
        message: '❌ មិនអាច download yt-dlp.exe បានទេ! សូមពិនិត្យ Internet connection រួចសាកម្តងទៀត'
      });
    }

    try {
      // Get metadata + stream URL in parallel with chosen quality
      const [urls, info] = await Promise.all([
        ytdlpGetUrl(rawUrl, quality),
        ytdlpGetInfo(rawUrl)
      ]);

      const rawStreamUrl = urls[0];
      const isLive = info?.is_live || info?.live_status === 'is_live' || false;
      const title = info?.title || rawUrl;
      const author = info?.uploader || info?.channel || '';

      console.log(`[yt-dlp] ✅ Resolved (${quality}p): "${title}" (${isLive ? 'LIVE' : 'VOD'})`);

      // Wrap in local proxy to guarantee Same-Origin, Clean Canvas, and Full Audio!
      const proxiedUrl = `/api/proxy-video?url=${encodeURIComponent(rawStreamUrl)}`;

      return res.json({
        ok: true,
        platform: isYouTube ? 'youtube' : 'facebook',
        isLive,
        title,
        author,
        quality: quality || '720',
        streamUrl: proxiedUrl,
        rawStreamUrl,
        format: { type: isLive ? 'live' : 'vod' }
      });

    } catch (err) {
      console.error('[yt-dlp resolve error]:', err.message);

      const errMsg = (err.message || '').toLowerCase();
      // Handle Facebook anti-scraping / login wall
      const isFbBlock = isFacebook || errMsg.includes('[facebook]') || errMsg.includes('cannot parse data');
      if (isFbBlock) {
        return res.json({
          ok: false,
          error: 'facebook_login_protected',
          message: 'Facebook បានចាក់សោរវីដេអូនេះ (ត្រូវការ Login លើ Facebook)។ សូមប្រើ "Screen Share Browser Tab" ជំនួសវិញ!',
          suggestion: 'screen_share'
        });
      }

      const isPrivate = errMsg.includes('private');
      const isAge = errMsg.includes('age') || errMsg.includes('sign in');
      const isUnavail = errMsg.includes('unavailable') || errMsg.includes('removed');
      const isNotLive = errMsg.includes('not currently live') || errMsg.includes('is not live');
      return res.status(500).json({
        ok: false,
        error: 'resolve_failed',
        message: isNotLive ? '⚠️ ឆានែលនេះមិនទាន់មានការផ្សាយផ្ទាល់ (Live) នៅឡើយទេ!'
          : isPrivate ? '🔒 វីដេអូ Private — មិនអាច resolve បានទេ'
          : isAge ? '🔞 វីដេអូ Age-Restricted — ត្រូវការ Login'
          : isUnavail ? '❌ វីដេអូមិនមានទៀតហើយ ឬបានលុប'
          : `❌ yt-dlp: ${err.message}`
      });
    }
  }

  // ── Direct URL (HLS, MP4, WebM, etc.) → proxy for clean canvas & audio ──
  const proxiedDirect = `/api/proxy-video?url=${encodeURIComponent(rawUrl)}`;
  return res.json({
    ok: true,
    platform: 'direct',
    isLive: rawUrl.includes('.m3u8') || rawUrl.includes('manifest'),
    title: '',
    streamUrl: proxiedDirect,
    rawStreamUrl: rawUrl,
    format: { type: 'direct' }
  });
});


// YouTube Live Chat API Proxy
app.get('/api/youtube-chat', async (req, res) => {
  const { videoId, apiKey, pageToken } = req.query;
  if (!videoId || !apiKey) {
    return res.status(400).json({ error: 'Missing videoId or apiKey' });
  }

  try {
    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
    const videoResponse = await fetch(videoUrl);
    const videoData = await videoResponse.json();

    if (!videoData.items || videoData.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const liveChatId = videoData.items[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!liveChatId) {
      return res.status(400).json({ error: 'Live chat is not active or video is not a live stream' });
    }

    let chatUrl = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(liveChatId)}&part=id,snippet,authorDetails&key=${encodeURIComponent(apiKey)}`;
    if (pageToken) {
      chatUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const chatResponse = await fetch(chatUrl);
    const chatData = await chatResponse.json();

    return res.json(chatData);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Route to clean mobile-friendly live viewing page for local network / web viewers
app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// Helper to resolve YouTube Video ID from full URL, channel handle, or plain ID
async function resolveYouTubeVideoId(input) {
  if (!input) return null;
  const raw = String(input).trim();

  // Plain 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  // URL containing v= or /live/ or youtu.be/
  const vMatch = raw.match(/(?:v=|\/live\/|youtu\.be\/|\/v\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (vMatch && vMatch[1]) {
    return vMatch[1];
  }

  // Channel handle or URL: e.g. @channel or youtube.com/@channel/live
  if (raw.includes('youtube.com') || raw.startsWith('@')) {
    let channelUrl = raw;
    if (channelUrl.startsWith('@')) {
      channelUrl = `https://www.youtube.com/${channelUrl}/live`;
    } else if (!channelUrl.includes('/live') && !channelUrl.includes('/watch')) {
      channelUrl = channelUrl.replace(/\/+$/, '') + '/live';
    }
    if (!channelUrl.startsWith('http')) {
      channelUrl = `https://${channelUrl}`;
    }

    try {
      const resp = await fetch(channelUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        redirect: 'follow'
      });
      const html = await resp.text();

      const canMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})">/) ||
                       html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (canMatch && canMatch[1]) {
        return canMatch[1];
      }
    } catch (e) {
      console.warn('[YouTube Channel Live Resolve Error]:', e.message);
    }
  }

  return null;
}

// YouTube Live Concurrent Viewers API Proxy (Real People Tracking)
app.get('/api/youtube-viewers', async (req, res) => {
  const { videoId, apiKey } = req.query;
  if (!videoId) {
    return res.status(400).json({ ok: false, error: 'Missing videoId' });
  }

  const cleanId = await resolveYouTubeVideoId(videoId);
  if (!cleanId) {
    return res.status(404).json({
      ok: false,
      error: 'មិនអាចស្វែងរក Video ID នៃវីដេអូ Live នេះឡើយ (Could not find active YouTube Live video ID)'
    });
  }

  try {
    if (apiKey) {
      // Official YouTube Data API v3
      const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics,snippet&id=${encodeURIComponent(cleanId)}&key=${encodeURIComponent(apiKey)}`;
      const videoResponse = await fetch(videoUrl);
      const videoData = await videoResponse.json();

      if (!videoData.items || videoData.items.length === 0) {
        return res.status(404).json({ ok: false, error: 'រកមិនឃើញវីដេអូ ឬ Live នេះឡើយ (Video not found)' });
      }

      const item = videoData.items[0];
      const liveDetails = item.liveStreamingDetails;
      const stats = item.statistics;
      const snippet = item.snippet;

      const concurrent = liveDetails && liveDetails.concurrentViewers
        ? parseInt(liveDetails.concurrentViewers, 10)
        : null;

      const isLiveNow = !!(liveDetails && liveDetails.concurrentViewers);

      return res.json({
        ok: true,
        videoId: cleanId,
        title: snippet?.title || '',
        channelTitle: snippet?.channelTitle || '',
        concurrentViewers: concurrent !== null ? concurrent : 0,
        isLive: isLiveNow,
        totalViews: stats && stats.viewCount ? parseInt(stats.viewCount, 10) : 0,
        likeCount: stats && stats.likeCount ? parseInt(stats.likeCount, 10) : 0,
        source: 'youtube_api'
      });
    } else {
      // Public HTML scraping fallback when API Key is not configured
      const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(cleanId)}`;
      const resp = await fetch(watchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = await resp.text();

      // Look for concurrent viewers in YouTube initialData
      const match = html.match(/"concurrentViewers":"([0-9]+)"/i) ||
                    html.match(/"viewCount":\{"runs":\[\{"text":"([0-9,\. ]+)"/i) ||
                    html.match(/"originalViewCount":"([0-9]+)"/i);

      const titleMatch = html.match(/<meta name="title" content="([^"]+)">/i) ||
                         html.match(/<title>([^<]+)<\/title>/i);

      if (match && match[1]) {
        const count = parseInt(match[1].replace(/[^0-9]/g, ''), 10);
        return res.json({
          ok: true,
          videoId: cleanId,
          title: titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : '',
          concurrentViewers: count || 0,
          isLive: html.includes('"isLive":true') || html.includes('"liveStreamability"'),
          source: 'youtube_public'
        });
      }

      return res.json({
        ok: true,
        videoId: cleanId,
        concurrentViewers: 0,
        isLive: html.includes('"isLive":true'),
        source: 'youtube_public',
        message: 'មិនទាន់មានអ្នកទស្សនា ឬ Live ទើបតែចាប់ផ្តើម'
      });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Facebook Live Concurrent Viewers API Proxy (Real People Tracking)
app.get('/api/facebook-viewers', async (req, res) => {
  const { videoUrl, videoId, accessToken } = req.query;
  if (!videoUrl && !videoId) {
    return res.status(400).json({ ok: false, error: 'Missing videoUrl or videoId' });
  }

  let cleanId = String(videoId || '').trim();
  if (!cleanId && videoUrl) {
    const m = String(videoUrl).match(/(?:videos\/|videos%2F|live_video_id=|\/watch\/\?v=)([0-9]+)/);
    if (m && m[1]) cleanId = m[1];
  }

  try {
    if (accessToken && cleanId) {
      const fbApiUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(cleanId)}?fields=live_views,status,title&access_token=${encodeURIComponent(accessToken)}`;
      const fbResp = await fetch(fbApiUrl);
      const fbData = await fbResp.json();

      if (fbData && fbData.live_views !== undefined) {
        return res.json({
          ok: true,
          videoId: cleanId,
          concurrentViewers: parseInt(fbData.live_views, 10) || 0,
          status: fbData.status,
          source: 'facebook_graph_api'
        });
      }
    }

    if (videoUrl) {
      const resp = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      const html = await resp.text();
      const match = html.match(/"live_viewer_count":([0-9]+)/i) ||
                    html.match(/"viewer_count":([0-9]+)/i);

      if (match && match[1]) {
        return res.json({
          ok: true,
          videoId: cleanId,
          concurrentViewers: parseInt(match[1], 10) || 0,
          source: 'facebook_public'
        });
      }
    }

    return res.json({
      ok: true,
      concurrentViewers: 0,
      source: 'facebook_fallback',
      message: 'សូមបញ្ចូល Facebook Page Access Token ដើម្បីទាញយកបាន 100%'
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Store active streaming sessions and real connected local viewers
const sessions = new Map();
const connectedWebViewers = new Set();

function broadcastToStudio(data) {
  const payload = JSON.stringify(data);
  for (const [clientWs, s] of sessions.entries()) {
    if (clientWs.readyState === 1 && !s.isViewer) {
      try {
        clientWs.send(payload);
      } catch (e) {}
    }
  }
}

// API endpoint for real connected local web viewers
app.get('/api/real-viewers', (req, res) => {
  res.json({
    ok: true,
    webViewers: connectedWebViewers.size
  });
});

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(2, 9);
  const isViewerUrl = req && req.url && (req.url.includes('viewer') || req.url.includes('watch'));

  console.log(`[Client Connected] ID: ${clientId} (${isViewerUrl ? 'Viewer' : 'Studio'})`);

  const session = {
    clientId,
    isViewer: !!isViewerUrl,
    ffmpeg: null,
    isStreaming: false,
    ffmpegReady: false,
    queue: [],
    bytesSent: 0,
    startTime: null
  };
  sessions.set(ws, session);

  if (isViewerUrl) {
    connectedWebViewers.add(ws);
    broadcastToStudio({
      type: 'real_viewers_update',
      webViewers: connectedWebViewers.size
    });
  }

  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    isViewer: session.isViewer,
    webViewers: connectedWebViewers.size,
    message: 'ភ្ជាប់ទៅកាន់ Server ដោយជោគជ័យ (Connected to Live Studio Server)'
  }));

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      // If FFmpeg is running and ready, flush queue then write new chunk
      if (session.ffmpeg && session.ffmpegReady && session.ffmpeg.stdin && !session.ffmpeg.stdin.destroyed) {
        while (session.queue.length > 0) {
          const queued = session.queue.shift();
          try {
            session.ffmpeg.stdin.write(queued);
            session.bytesSent += queued.length;
          } catch (e) {
            console.error('[FFmpeg stdin write queued error]:', e.message);
          }
        }
        try {
          session.ffmpeg.stdin.write(message);
          session.bytesSent += message.length;
        } catch (err) {
          console.error('[FFmpeg stdin write error]:', err.message);
        }
      } else {
        // Queue chunk (vital for preserving the EBML header in chunk 0!)
        if (session.queue.length < 60) {
          session.queue.push(message);
        }
      }
      return;
    }

    // Handle JSON control commands
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'start_stream') {
        startFFmpegStream(ws, session, data);
      } else if (data.type === 'stop_stream') {
        stopFFmpegStream(ws, session);
      } else if (data.type === 'viewer_join') {
        session.isViewer = true;
        connectedWebViewers.add(ws);
        broadcastToStudio({
          type: 'real_viewers_update',
          webViewers: connectedWebViewers.size
        });
        ws.send(JSON.stringify({ type: 'viewer_joined', webViewers: connectedWebViewers.size }));
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now(), webViewers: connectedWebViewers.size }));
      }
    } catch (e) {
      console.error('[WebSocket message parse error]:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[Client Disconnected] ID: ${clientId}`);
    if (connectedWebViewers.has(ws)) {
      connectedWebViewers.delete(ws);
      broadcastToStudio({
        type: 'real_viewers_update',
        webViewers: connectedWebViewers.size
      });
    }
    stopFFmpegStream(ws, session);
    sessions.delete(ws);
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket error] ${clientId}:`, err.message);
  });
});

function startFFmpegStream(ws, session, config) {
  if (session.isStreaming && session.ffmpeg) {
    ws.send(JSON.stringify({
      type: 'stream_error',
      message: 'ការផ្សាយកំពុងដំណើរការរួចហើយ (Stream is already running)'
    }));
    return;
  }

  const {
    targetPlatform = 'youtube', // 'youtube', 'facebook', 'both'
    ytChannels = [], // Multi-channel YouTube array
    rtmpUrl = 'rtmp://a.rtmp.youtube.com/live2',
    streamKey = '',
    fbRtmpUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/',
    fbStreamKey = '',
    fps = 30,
    bitrate = '3500k',
    audioBitrate = '128k'
  } = config;

  const isYt = targetPlatform === 'youtube' || targetPlatform === 'both';
  const isFb = targetPlatform === 'facebook' || targetPlatform === 'both';

  // Helper to normalize RTMP URL and Stream Key (handles accidental full URL pasted into Key field)
  function normalizeTarget(url, key) {
    if (!key) return null;
    let cleanKey = String(key).trim();
    let cleanUrl = String(url || '').trim();

    // If user pasted full rtmp:// or rtmps:// URL into key field:
    if (cleanKey.startsWith('rtmp://') || cleanKey.startsWith('rtmps://')) {
      const lastSlash = cleanKey.lastIndexOf('/');
      if (lastSlash > 8) {
        cleanUrl = cleanKey.substring(0, lastSlash);
        cleanKey = cleanKey.substring(lastSlash + 1);
      }
    }

    cleanUrl = cleanUrl.replace(/\/+$/, '');
    if (!cleanKey) return null;
    return `${cleanUrl}/${cleanKey}`;
  }

  const activeTargets = [];

  // 1. Collect YouTube Channels (Multi-Channel Support)
  if (isYt) {
    if (Array.isArray(ytChannels) && ytChannels.length > 0) {
      ytChannels.forEach((ch, idx) => {
        if (ch && ch.enabled && ch.streamKey && ch.streamKey.trim() !== '') {
          const cleanUrl = normalizeTarget(ch.rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2', ch.streamKey);
          if (cleanUrl) {
            activeTargets.push({
              type: 'youtube',
              id: ch.id || `yt_${idx + 1}`,
              name: ch.name || `YouTube ឆានែល #${idx + 1}`,
              url: cleanUrl
            });
          }
        }
      });
    } else if (streamKey && streamKey.trim() !== '') {
      const cleanYt = normalizeTarget(rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2', streamKey);
      if (cleanYt) {
        activeTargets.push({
          type: 'youtube',
          id: 'yt_1',
          name: 'YouTube ឆានែល #1',
          url: cleanYt
        });
      }
    }

    if (activeTargets.filter(t => t.type === 'youtube').length === 0) {
      ws.send(JSON.stringify({
        type: 'stream_error',
        message: 'សូមបញ្ចូល YouTube Stream Key យ៉ាងហោចណាស់មួយឆានែល! (Please configure at least 1 active YouTube channel)'
      }));
      return;
    }
  }

  // 2. Collect Facebook Channel
  if (isFb) {
    const cleanFb = normalizeTarget(fbRtmpUrl || 'rtmps://live-api-s.facebook.com:443/rtmp/', fbStreamKey);
    if (!cleanFb) {
      ws.send(JSON.stringify({
        type: 'stream_error',
        message: 'សូមបញ្ចូល Facebook Stream Key ជាមុនសិន! (Please enter Facebook Stream Key in Settings)'
      }));
      return;
    }
    activeTargets.push({
      type: 'facebook',
      id: 'fb_1',
      name: 'Facebook Live',
      url: cleanFb
    });
  }

  if (activeTargets.length === 0) {
    ws.send(JSON.stringify({
      type: 'stream_error',
      message: 'គ្មានគោលដៅផ្សាយផ្ទាល់សកម្មឡើយ (No active streaming channels configured)'
    }));
    return;
  }

  // Keyframe interval = 2 seconds (Standard requirement for YouTube Live & Facebook Live)
  const gopSize = Math.max(fps * 2, 30);
  const numBitrate = parseInt(bitrate, 10) || 3500;
  const dynamicBufSize = `${Math.round(numBitrate * 1.5)}k`;

  // Base FFmpeg arguments for WebM live pipe -> H.264 / AAC FLV (Optimized for zero-lag smooth broadcast)
  const ffmpegArgs = [
    // Read live WebM from stdin
    '-f', 'webm',
    '-fflags', '+nobuffer+genpts',
    '-i', 'pipe:0',

    // Multi-core CPU encoding
    '-threads', '0',

    // Video encoding settings (ultrafast preset ensures real-time encoding with no frame drops)
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'main',
    '-b:v', bitrate,
    '-maxrate', bitrate,
    '-bufsize', dynamicBufSize,
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-g', String(gopSize),
    '-keyint_min', String(fps),
    '-sc_threshold', '0',

    // Audio encoding settings (Clean 48kHz High-Fidelity AAC with async drift compensation)
    '-c:a', 'aac',
    '-b:a', audioBitrate || '128k',
    '-ar', '48000',
    '-ac', '2',
    '-af', 'aresample=async=1000',
    '-max_muxing_queue_size', '4096'
  ];

  let targetDescription = '';

  if (activeTargets.length === 1) {
    const single = activeTargets[0];
    console.log(`[FFmpeg] Starting single stream to ${single.name} (${single.type}): ${single.url.split('/')[2] || 'rtmp'}/****`);
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      single.url
    );
    targetDescription = `${single.type === 'facebook' ? '🔵' : '🔴'} ${single.name}`;
  } else {
    // Multi-Destination Tee Muxer (2, 3, 4, 5+ YouTube channels and/or Facebook)
    const ytCount = activeTargets.filter(t => t.type === 'youtube').length;
    const fbCount = activeTargets.filter(t => t.type === 'facebook').length;

    console.log(`[FFmpeg] Starting Multi-Stream to ${activeTargets.length} destinations (${ytCount} YouTube, ${fbCount} Facebook):`);
    activeTargets.forEach((t, i) => {
      console.log(`  [${i + 1}] ${t.name}: ${t.url.split('/')[2] || 'rtmp'}/****`);
    });

    const teeTarget = activeTargets.map(t => `[f=flv:flvflags=no_duration_filesize:onfail=ignore]${t.url}`).join('|');
    ffmpegArgs.push(
      '-f', 'tee',
      '-map', '0:v:0',
      '-map', '0:a:0?',
      teeTarget
    );

    if (fbCount > 0 && ytCount > 0) {
      targetDescription = `🔥 Multi-Stream (${ytCount} YouTube + Facebook)`;
    } else {
      targetDescription = `🔴 YouTube Multi-Channel (${ytCount} ឆានែលព្រមគ្នា)`;
    }
  }

  try {
    const ffmpegProc = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    session.ffmpeg = ffmpegProc;
    session.isStreaming = true;
    session.ffmpegReady = true;
    session.startTime = Date.now();
    session.bytesSent = 0;

    // Immediately flush any chunks that arrived while spawning
    if (session.queue.length > 0) {
      console.log(`[FFmpeg] Flushing ${session.queue.length} buffered chunks to stdin...`);
      while (session.queue.length > 0) {
        const queued = session.queue.shift();
        try {
          ffmpegProc.stdin.write(queued);
          session.bytesSent += queued.length;
        } catch (e) {}
      }
    }

    ws.send(JSON.stringify({
      type: 'stream_started',
      targetPlatform,
      targetDescription,
      message: `🚀 កំពុងបញ្ជូនវីដេអូទៅកាន់ ${targetDescription}! សូមរង់ចាំ 5-10 វិនាទីដើម្បីឱ្យរូបភាពបង្ហាញ...`,
      rtmpTarget: targetPlatform === 'both' ? 'YouTube & Facebook Live' : (targetPlatform === 'facebook' ? 'Facebook Live' : 'YouTube Live')
    }));

    const lastStderrLines = [];

    ffmpegProc.stderr.on('data', (data) => {
      const line = data.toString();
      lastStderrLines.push(line);
      if (lastStderrLines.length > 20) lastStderrLines.shift();

      // Log stream mapping & audio details
      if (line.includes('Stream #') || line.includes('Output #') || line.includes('Input #')) {
        console.log(`[FFmpeg Stream] ${line.trim()}`);
      }
      if (line.toLowerCase().includes('audio:') || line.toLowerCase().includes('aac')) {
        console.log(`[FFmpeg Audio] ${line.trim()}`);
      }

      // Check for live frame statistics
      if (line.includes('frame=') && line.includes('fps=')) {
        try {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'stream_stats',
              stats: line.trim()
            }));
          }
        } catch (e) {}
      } else if (
        !line.includes('Failed to update header') &&
        (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('cannot open'))
      ) {
        console.warn(`[FFmpeg Error/Warning]: ${line.trim()}`);
        try {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'stream_warning',
              message: line.trim()
            }));
          }
        } catch (e) {}
      }
    });

    ffmpegProc.on('close', (code, signal) => {
      console.log(`[FFmpeg closed] exit code: ${code}, signal: ${signal}`);
      session.isStreaming = false;
      session.ffmpegReady = false;
      session.ffmpeg = null;
      session.queue = [];

      let errorExplanation = '';
      if (code !== 0 && signal !== 'SIGTERM') {
        const fullErr = lastStderrLines.join('\n');
        if (fullErr.includes('Cannot open connection') || fullErr.includes('Connection refused') || fullErr.includes('Failed to resolve hostname') || fullErr.includes('Connection timed out')) {
          errorExplanation = '⚠️ មិនអាចតភ្ជាប់ទៅ Server ផ្សាយផ្ទាល់បានទេ! សូមពិនិត្យមើលអ៊ីនធឺណិត ឬប្តូរទៅប្រើ RTMPS (Port 443)';
        } else if (fullErr.includes('401') || fullErr.includes('Unauthorized') || fullErr.includes('Handshake failed') || fullErr.includes('Publish failed')) {
          errorExplanation = '⚠️ Stream Key មិនត្រឹមត្រូវ ឬផុតកំណត់! សូមចម្លង Stream Key ថ្មីពី YouTube Studio ឬ Facebook Producer';
        } else if (fullErr.includes('All tee outputs failed')) {
          errorExplanation = '⚠️ ការផ្សាយទៅកាន់គោលដៅទាំងអស់មិនជោគជ័យ! សូមពិនិត្យមើល Stream Key របស់ YouTube និង Facebook';
        } else {
          errorExplanation = `ការផ្សាយផ្ទាល់បានដាច់ (FFmpeg exited with code ${code})`;
        }
      }

      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'stream_stopped',
            code,
            message: code === 0 || signal === 'SIGTERM'
              ? 'ការផ្សាយផ្ទាល់ត្រូវបានបញ្ឈប់ (Stream stopped)'
              : errorExplanation
          }));
        }
      } catch (e) {}
    });

    ffmpegProc.on('error', (err) => {
      console.error('[FFmpeg Process Error]:', err.message);
      session.isStreaming = false;
      session.ffmpegReady = false;
      session.ffmpeg = null;
      session.queue = [];

      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'stream_error',
            message: `FFmpeg Error: ${err.message}`
          }));
        }
      } catch (e) {}
    });

    ffmpegProc.stdin.on('error', (err) => {
      console.error('[FFmpeg Stdin Error]:', err.message);
    });

  } catch (err) {
    session.isStreaming = false;
    session.ffmpegReady = false;
    session.ffmpeg = null;
    session.queue = [];
    ws.send(JSON.stringify({
      type: 'stream_error',
      message: `Failed to spawn FFmpeg: ${err.message}`
    }));
  }
}

function stopFFmpegStream(ws, session) {
  if (session && session.ffmpeg) {
    console.log('[FFmpeg] Stopping active stream...');
    try {
      if (session.ffmpeg.stdin && !session.ffmpeg.stdin.destroyed) {
        session.ffmpeg.stdin.end();
      }
      setTimeout(() => {
        if (session.ffmpeg) {
          session.ffmpeg.kill('SIGTERM');
        }
      }, 500);
    } catch (e) {
      try {
        session.ffmpeg.kill('SIGKILL');
      } catch (err) {}
    }
  }
  session.isStreaming = false;
  session.ffmpegReady = false;
  session.ffmpeg = null;
  session.queue = [];
}

// Helper: Get local network IPv4 addresses (Wi-Fi, Ethernet, LAN)
function getLocalNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Exclude internal (127.0.0.1) and IPv6
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

// Handle server listen errors (e.g., port already in use)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [កំហុស] Port ${PORT} កំពុងត្រូវបានប្រើប្រាស់ដោយកម្មវិធីផ្សេងរួចហើយ! (Port ${PORT} is already in use!)`);
    console.error(`👉 សូមបិទផ្ទាំង Command Prompt ចាស់ ឬបើក Task Manager រួច End task "Node.js" បន្ទាប់មកបើក start.bat ម្តងទៀត។\n`);
  } else {
    console.error(`\n❌ [Server Error]:`, err.message);
  }
});

// Start HTTP & WebSocket Server (Dual-stack: listens on both IPv6 localhost & all IPv4 interfaces)
server.listen(PORT, () => {
  const localIps = getLocalNetworkIps();
  console.log(`================================================================`);
  console.log(`  🎬 YOUTUBE LIVE STUDIO PRO IS RUNNING!                        `);
  console.log(`================================================================`);
  console.log(`  💻 លើកុំព្យូទ័រនេះ (Local Machine):`);
  console.log(`     👉 http://localhost:${PORT}`);
  console.log(`     👉 http://127.0.0.1:${PORT}`);
  console.log(``);
  if (localIps.length > 0) {
    console.log(`  📱💻 លើកុំព្យូទ័រផ្សេង / ទូរស័ព្ទ / iPad (ក្នុង Wi-Fi/LAN តែមួយ):`);
    localIps.forEach(net => {
      console.log(`     👉 http://${net.address}:${PORT}  (${net.name})`);
    });
    console.log(``);
    console.log(`     💡 ប្រសិនបើកុំព្យូទ័រផ្សេងបើកមិនចេញ សូមចុចបើក file "allow-firewall.bat"`);
  } else {
    console.log(`  🌐 លើបណ្តាញ Network: http://0.0.0.0:${PORT}`);
  }
  console.log(``);
  console.log(`  🎥 FFmpeg Path: ${ffmpegPath}`);
  console.log(`================================================================`);
  console.log(`  💡 ព័ត៌មានបន្ថែម៖`);
  console.log(`  - ដើម្បីផ្សាយ Live សូមចុច Start Live លើផ្ទាំង Browser`);
  console.log(`  - ទុកផ្ទាំង Command Prompt នេះឱ្យនៅបើកជានិច្ច ពេលកំពុង Live`);
  console.log(`================================================================\n`);
});
