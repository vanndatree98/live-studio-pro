// ==========================================================================
// LIVE STUDIO PRO - iOS 27 DESKTOP CONTROLS & SETTINGS (Electron Bridge)
// Manages Minimize to System Tray, Run on Startup, and iOS 27 UI
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
  const body = document.body;

  // 1. Elements
  const ios27Titlebar = document.getElementById('ios27Titlebar');
  const btnIosClose = document.getElementById('btnIosClose');
  const btnIosMin = document.getElementById('btnIosMin');
  const btnIosMax = document.getElementById('btnIosMax');
  const iosDynamicIsland = document.getElementById('iosDynamicIsland');
  const iosIslandPulse = document.getElementById('iosIslandPulse');
  const btnOpenDesktopSettings = document.getElementById('btnOpenDesktopSettings');
  const iosDesktopModal = document.getElementById('iosDesktopModal');
  const btnCloseDesktopModal = document.getElementById('btnCloseDesktopModal');
  const checkCloseToTray = document.getElementById('checkCloseToTray');
  const checkRunOnStartup = document.getElementById('checkRunOnStartup');
  const checkIosGlassTheme = document.getElementById('checkIosGlassTheme');

  // 2. iOS 27 Glass Theme initialization
  const savedGlassTheme = localStorage.getItem('lsp_ios27_theme');
  if (savedGlassTheme === null || savedGlassTheme === 'true') {
    body.classList.add('ios27-theme');
    if (checkIosGlassTheme) checkIosGlassTheme.checked = true;
  } else {
    body.classList.remove('ios27-theme');
    if (checkIosGlassTheme) checkIosGlassTheme.checked = false;
  }

  if (checkIosGlassTheme) {
    checkIosGlassTheme.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      body.classList.toggle('ios27-theme', enabled);
      localStorage.setItem('lsp_ios27_theme', String(enabled));
      if (typeof showToast === 'function') {
        showToast(`✨ បាន${enabled ? 'បើក' : 'បិទ'} ស្ទីលបែប iOS 27 Liquid Glass`, 'info');
      }
    });
  }

  // 3. Modal Open/Close
  function openDesktopModal() {
    if (iosDesktopModal) iosDesktopModal.classList.add('active');
  }

  function closeDesktopModal() {
    if (iosDesktopModal) iosDesktopModal.classList.remove('active');
  }

  if (btnOpenDesktopSettings) btnOpenDesktopSettings.addEventListener('click', openDesktopModal);
  if (iosDynamicIsland) iosDynamicIsland.addEventListener('click', openDesktopModal);
  if (btnCloseDesktopModal) btnCloseDesktopModal.addEventListener('click', closeDesktopModal);

  if (iosDesktopModal) {
    iosDesktopModal.addEventListener('click', (e) => {
      if (e.target === iosDesktopModal) closeDesktopModal();
    });
  }

  // 4. Electron IPC Integration (Traffic Lights & App Settings)
  if (isElectron) {
    console.log('[Desktop] Running inside Electron App environment.');

    // Window controls
    if (btnIosClose) {
      btnIosClose.addEventListener('click', () => {
        window.electronAPI.closeWindow();
      });
    }

    if (btnIosMin) {
      btnIosMin.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
      });
    }

    if (btnIosMax) {
      btnIosMax.addEventListener('click', () => {
        window.electronAPI.maximizeWindow();
      });
    }

    // Load initial settings
    try {
      const settings = await window.electronAPI.getAppSettings();
      if (settings) {
        if (checkCloseToTray) checkCloseToTray.checked = !!settings.closeToTray;
        if (checkRunOnStartup) checkRunOnStartup.checked = !!settings.runAtStartup;
      }
    } catch (err) {
      console.warn('[Desktop] Could not fetch settings:', err);
    }

    // Setting: Close to Tray
    if (checkCloseToTray) {
      checkCloseToTray.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await window.electronAPI.setCloseToTray(enabled);
        if (typeof showToast === 'function') {
          showToast(
            enabled
              ? '🛡️ បានបើក៖ ពេលបិទពី Taskbar កម្មវិធីនឹងរត់ទៅ System Tray (ការ Live មិនដាច់)'
              : '⚠️ បានបិទ Close to Tray (ពេលចុចបិទ កម្មវិធីនឹងបិទទាំងស្រុង)',
            enabled ? 'success' : 'warning'
          );
        }
      });
    }

    // Setting: Run on Startup
    if (checkRunOnStartup) {
      checkRunOnStartup.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await window.electronAPI.setRunAtStartup(enabled);
        if (typeof showToast === 'function') {
          showToast(
            enabled
              ? '🚀 បានបើក៖ កម្មវិធីនឹងដំណើរការស្វ័យប្រវត្តពេលបើកកុំព្យូទ័រ (Run on Startup)'
              : 'ℹ️ បានបិទ Run on Startup',
            enabled ? 'success' : 'info'
          );
        }
      });
    }

    // Sync from Tray context menu changes
    if (window.electronAPI.onSettingsChanged) {
      window.electronAPI.onSettingsChanged((newSettings) => {
        if (checkCloseToTray) checkCloseToTray.checked = !!newSettings.closeToTray;
        if (checkRunOnStartup) checkRunOnStartup.checked = !!newSettings.runAtStartup;
      });
    }
  } else {
    // In Browser mode
    console.log('[Desktop] Running in standard Web Browser mode.');
    // In browser, traffic lights give friendly hint
    if (btnIosClose) {
      btnIosClose.addEventListener('click', () => {
        if (typeof showToast === 'function') {
          showToast('💡 អ្នកកំពុងប្រើលើ Browser — ដើម្បីប្រើជាកញ្ចប់ Desktop .exe សូមតម្លើង Electron Installer', 'info');
        }
      });
    }
  }

  // 5. Update Dynamic Island Live Pulse Status
  const observer = new MutationObserver(() => {
    const isLive = document.body.classList.contains('streaming-active') ||
                   (document.getElementById('streamStatusPill') && 
                    document.getElementById('streamStatusPill').classList.contains('live'));
    if (iosIslandPulse) {
      iosIslandPulse.classList.toggle('live', isLive);
    }
  });

  observer.observe(document.body, { attributes: true, subtree: true });
});
