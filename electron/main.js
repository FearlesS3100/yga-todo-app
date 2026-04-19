const {
  app,
  BrowserWindow,
  shell,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  Notification,
  dialog,
  protocol,
  net,
} = require('electron');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

// ─── Ortam tespiti ────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;

// ─── Uygulama kimliği (Windows görev çubuğu gruplandırması) ──────────────────
if (process.platform === 'win32') {
  app.setAppUserModelId('com.yga.todoapp');
}

// ─── Tek örnek kilidi: ikinci başlatmada uyarı göster, ilkini öne getir ───────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Başka bir örnek zaten çalışıyor — bu örneği hemen kapat
  app.quit();
} else {
  app.on('second-instance', () => {
    // Kullanıcı exe'yi tekrar çalıştırdı; mevcut pencereyi öne getir + uyarı
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
    // Native dialog — pencere henüz hazır olmasa bile gösterilir
    const { dialog: _dialog } = require('electron');
    _dialog.showMessageBox({
      type: 'warning',
      title: 'YGA Todo Zaten Açık',
      message: 'YGA Todo zaten çalışıyor.',
      detail: 'Sistem tepsisindeki simgeye çift tıklayarak uygulamaya erişebilirsiniz.',
      buttons: ['Tamam'],
      defaultId: 0,
      noLink: true,
    }).catch(() => {});
  });
}

// ─── Özel protokol (prod): app:// → out/ dizini ───────────────────────────────
// registerSchemesAsPrivileged mutlaka ready'den önce çağrılmalı
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard:       true,
      secure:         true,
      supportFetchAPI: true,
      corsEnabled:    true,
    },
  },
]);

// ─── Değişkenler ─────────────────────────────────────────────────────────────
let mainWindow;
let tray                 = null;
let isQuiting            = false;
let needsCloseReason     = false;  // Workspace açıkken true, lisans/login ekranında false
let updaterInitialized   = false;
let manualUpdateCheck    = false;
const defaultIntroSettings = {
  skipIntroPermanently: false,
};
let introSettings = { ...defaultIntroSettings };

// Packaged modda ikonlar ASAR dışında resources/public/ altında (extraResources ile kopyalanır)
// Dev modda proje kökündeki public/ klasöründen okunur
const iconsBase = app.isPackaged
  ? path.join(process.resourcesPath, 'public')
  : path.join(__dirname, '..', 'public');
const pngIconPath = path.join(iconsBase, 'logo.png');
const icoIconPath = path.join(iconsBase, 'logo.ico');

// ─── Yardımcı: pencereyi öne getir ───────────────────────────────────────────
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible())  mainWindow.show();
  mainWindow.focus();
}

// ─── Yardımcı: sistem tepsisi balonu (yalnızca Windows) ──────────────────────
function showTrayBalloon(title, body) {
  if (process.platform !== 'win32' || !tray) return;
  try {
    tray.displayBalloon({ iconType: 'info', title, content: body || '' });
  } catch (_) { /* sessizce geç */ }
}

function showMessageBoxSafe(options) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    return dialog.showMessageBox(mainWindow, options);
  }
  return dialog.showMessageBox(options);
}

function getAppUpdateConfigPath() {
  return path.join(process.resourcesPath, 'app-update.yml');
}

function hasUpdaterConfig() {
  return app.isPackaged && fs.existsSync(getAppUpdateConfigPath());
}

function getIntroSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readIntroSettingsFromDisk() {
  const settingsPath = getIntroSettingsPath();
  try {
    if (!fs.existsSync(settingsPath)) {
      introSettings = { ...defaultIntroSettings };
      return;
    }
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    introSettings = {
      ...defaultIntroSettings,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      skipIntroPermanently: Boolean(parsed?.skipIntroPermanently),
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.warn('[intro] Ayarlar okunamadi, varsayilan kullaniliyor:', message);
    introSettings = { ...defaultIntroSettings };
  }
}

function writeIntroSettingsToDisk() {
  const settingsPath = getIntroSettingsPath();
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(introSettings, null, 2), 'utf8');
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.warn('[intro] Ayarlar kaydedilemedi:', message);
  }
}

function getIntroSettings() {
  return { ...introSettings };
}

function getIntroVideoUrl() {
  const primaryPath = path.join(process.resourcesPath, 'public', 'intro.mp4');
  if (fs.existsSync(primaryPath) && fs.statSync(primaryPath).isFile()) {
    return pathToFileURL(primaryPath).toString();
  }

  const fallbackPath = path.join(app.getAppPath(), 'out', 'intro.mp4');
  if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile()) {
    return pathToFileURL(fallbackPath).toString();
  }

  return '';
}

function getIntroVideoDataUrl() {
  const primaryPath = path.join(process.resourcesPath, 'public', 'intro.mp4');
  let resolvedPath = '';

  if (fs.existsSync(primaryPath) && fs.statSync(primaryPath).isFile()) {
    resolvedPath = primaryPath;
  } else {
    const fallbackPath = path.join(app.getAppPath(), 'out', 'intro.mp4');
    if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile()) {
      resolvedPath = fallbackPath;
    }
  }

  if (!resolvedPath) return '';

  try {
    const fileBuffer = fs.readFileSync(resolvedPath);
    return `data:video/mp4;base64,${fileBuffer.toString('base64')}`;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.warn('[intro] Video data URL olusturulamadi:', message);
    return '';
  }
}

function broadcastIntroSettingsChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('intro:settings-changed', getIntroSettings());
}

function setSkipIntroPermanently(value) {
  const normalized = Boolean(value);
  if (introSettings.skipIntroPermanently === normalized) return;
  introSettings.skipIntroPermanently = normalized;
  writeIntroSettingsToDisk();
  refreshTrayMenu();
  broadcastIntroSettingsChanged();
}

function openMainApp() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }
  createWindow();
}

function ensureUpdaterInitialized() {
  if (!app.isPackaged || updaterInitialized || !hasUpdaterConfig()) return updaterInitialized;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      showMessageBoxSafe({
        type: 'info',
        title: 'Yeni surum bulundu',
        message: 'Guncelleme bulundu ve indiriliyor. Indirme tamamlaninca guncelleme penceresi acilacak.',
        buttons: ['Tamam'],
        defaultId: 0,
        noLink: true,
      }).catch(() => {});
      return;
    }

    manualUpdateCheck = false;
    showTrayBalloon('YGA Todo', 'Yeni bir guncelleme bulundu. Indiriliyor...');
  });

  autoUpdater.on('update-not-available', () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    showMessageBoxSafe({
      type: 'info',
      title: 'Guncelleme denetimi',
      message: 'Uygulama guncel.',
      buttons: ['Tamam'],
      defaultId: 0,
      noLink: true,
    }).catch(() => {});
  });

  autoUpdater.on('update-downloaded', async () => {
    manualUpdateCheck = false;
    const result = await showMessageBoxSafe({
      type: 'info',
      title: 'Guncelleme hazir',
      message: 'Yeni surum indirildi. Guncelle ve yeniden baslatmak ister misiniz?',
      buttons: ['Guncelle ve yeniden baslat', 'Daha sonra'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).catch(() => ({ response: 1 }));

    if (result.response === 0) {
      isQuiting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    const message = error && error.message ? error.message : String(error);
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showErrorBox('Guncelleme denetimi basarisiz', message);
      return;
    }
    console.warn('[updater] Otomatik guncelleme hatasi:', message);
  });

  updaterInitialized = true;
  return true;
}

async function checkForAppUpdates({ manual = false } = {}) {
  if (!app.isPackaged) {
    if (manual) {
      showMessageBoxSafe({
        type: 'info',
        title: 'Guncelleme denetimi',
        message: 'Guncelleme denetimi sadece paketli surumde kullanilabilir.',
        buttons: ['Tamam'],
        defaultId: 0,
        noLink: true,
      }).catch(() => {});
    }
    return;
  }

  if (!hasUpdaterConfig()) {
    const configPath = getAppUpdateConfigPath();
    if (manual) {
      showMessageBoxSafe({
        type: 'info',
        title: 'Guncelleme denetimi',
        message: 'Bu kurulumda online guncelleme yapilandirmasi bulunmuyor.',
        detail: `Beklenen dosya: ${configPath}`,
        buttons: ['Tamam'],
        defaultId: 0,
        noLink: true,
      }).catch(() => {});
    } else {
      console.info('[updater] app-update.yml bulunamadi, guncelleme denetimi atlandi:', configPath);
    }
    return;
  }

  ensureUpdaterInitialized();
  manualUpdateCheck = manual;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (manual && manualUpdateCheck) {
      dialog.showErrorBox('Guncelleme denetimi basarisiz', message);
    } else {
      console.warn('[updater] Otomatik guncelleme denetimi basarisiz:', message);
    }
    manualUpdateCheck = false;
  }
}

// ─── Yardımcı: ikon yükle ─────────────────────────────────────────────────────
function loadIcon(preferIco = false) {
  const shouldPreferIco = process.platform === 'win32' || preferIco;
  const p = (shouldPreferIco && fs.existsSync(icoIconPath)) ? icoIconPath
          : fs.existsSync(pngIconPath) ? pngIconPath
          : icoIconPath;
  try {
    const img = nativeImage.createFromPath(p);
    // Boş gelirse (path hatalı) electron varsayılan ikonunu döner — logla
    if (img.isEmpty()) {
      console.warn('[icon] createFromPath döndü empty:', p);
    }
    return img;
  } catch (e) {
    console.warn('[icon] loadIcon hatası:', e);
    return nativeImage.createEmpty();
  }
}

// ─── Sistem tepsisi ───────────────────────────────────────────────────────────
function buildTrayContextMenuTemplate() {
  const template = [
    {
      label: 'Pencereyi goster',
      click: () => showMainWindow(),
    },
    {
      label: 'Guncellemeleri kontrol et',
      click: () => {
        checkForAppUpdates({ manual: true }).catch((error) => {
          const message = error && error.message ? error.message : String(error);
          dialog.showErrorBox('Guncelleme denetimi basarisiz', message);
        });
      },
    },
  ];

  if (process.platform === 'win32') {
    template.push({ type: 'separator' });
    template.push({
      label: 'Introyu kalici atla',
      type: 'checkbox',
      checked: Boolean(introSettings.skipIntroPermanently),
      click: (menuItem) => {
        setSkipIntroPermanently(Boolean(menuItem.checked));
      },
    });
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Uygulamadan cik',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (needsCloseReason) {
            // Workspace açık: sebep dialogunu göster
            showMainWindow();
            mainWindow.webContents.send('app:close-requested');
          } else {
            // Lisans/login ekranı: direkt kapat
            isQuiting = true;
            app.quit();
          }
        } else {
          isQuiting = true;
          app.quit();
        }
      },
    },
  );

  return template;
}

function refreshTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate(buildTrayContextMenuTemplate());
  tray.setContextMenu(contextMenu);
}

function createTray() {
  if (tray) return;

  const trayIcon = (process.platform === 'win32' && fs.existsSync(icoIconPath))
    ? icoIconPath
    : loadIcon(true);

  tray = new Tray(trayIcon);
  tray.setToolTip('YGA Todo');
  refreshTrayMenu();
  tray.on('double-click', () => showMainWindow());
}

// ─── Ana pencere ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload:           path.join(__dirname, 'preload.js'),
      nodeIntegration:   false,   // güvenlik: Node API'si renderer'da yok
      contextIsolation:  true,    // güvenlik: izole context bridge
      sandbox:           true,    // güvenlik: renderer sandboxed
      webSecurity:       true,    // güvenlik: aynı kaynak politikası
      allowRunningInsecureContent: false,
    },
    titleBarStyle:    'default',
    show:             false,
    autoHideMenuBar:  true,
    icon:             loadIcon(true),
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  // DevTools: sadece geliştirme modunda, production'da tamamen kapat
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key === 'I') {
        mainWindow.webContents.toggleDevTools();
      }
    });
  } else {
    // Sağ tık → İncele veya başka yolla açılmaya çalışılırsa hemen kapat
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  // Alt+F4 ve Ctrl+W'yi her modda engelle
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      (input.alt  && input.key === 'F4') ||
      (input.control && (input.key === 'w' || input.key === 'W'))
    ) {
      event.preventDefault();
    }
  });

  // Dış bağlantılar tarayıcıda açılsın, Electron'da değil
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) {
      shell.openExternal(openUrl);
    }
    return { action: 'deny' };
  });

  // X tuşu → minimize to tray, kapat değil
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // URL yükle
  const startURL = isDev
    ? 'http://localhost:3000'
    : 'app://index.html';

  mainWindow.loadURL(startURL).catch((err) => {
    console.error('Sayfa yüklenemedi:', err);
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
}

// ─── Uygulama hazır ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  readIntroSettingsFromDisk();

  // Prod: app:// protokolünü out/ dizinine yönlendir
  if (!isDev) {
    protocol.handle('app', (request) => {
      const url      = new URL(request.url);
      let   filePath = url.pathname.replace(/^\//, '') || 'index.html';
      const fullPath = path.join(app.getAppPath(), 'out', filePath);

      // Dosya yoksa SPA fallback → index.html
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        return net.fetch(
          `file://${path.join(app.getAppPath(), 'out', 'index.html')}`
        );
      }
      return net.fetch(`file://${fullPath}`);
    });
  }

  createTray();
  openMainApp();

  if (!isDev && hasUpdaterConfig()) {
    ensureUpdaterInitialized();
    setTimeout(() => {
      checkForAppUpdates({ manual: false }).catch((error) => {
        const message = error && error.message ? error.message : String(error);
        console.warn('[updater] Arka plan guncelleme denetimi basarisiz:', message);
      });
    }, 3000);
  }

  // ── IPC: uygulamayı kapat ─────────────────────────────────────────────────
  ipcMain.on('app:confirm-quit', () => {
    isQuiting = true;
    app.quit();
  });

  ipcMain.handle('intro:get-settings', async () => getIntroSettings());
  ipcMain.handle('intro:get-video-url', async () => getIntroVideoUrl());
  ipcMain.handle('intro:get-video-data-url', async () => getIntroVideoDataUrl());

  // Renderer hangi ekranda olduğunu bildiriyor
  ipcMain.on('app:set-needs-close-reason', (_event, value) => {
    needsCloseReason = Boolean(value);
  });

  // ── IPC: makine bilgileri ─────────────────────────────────────────────────
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:get-hostname', () => os.hostname());

  ipcMain.handle('app:get-system-info', () => {
    const { execSync } = require('child_process');
    const cpus = os.cpus();

    let macAddress = 'Bilinmiyor';
    try {
      const interfaces = os.networkInterfaces();
      for (const iface of Object.values(interfaces)) {
        if (!iface) continue;
        const found = iface.find(
          i => !i.internal && i.mac && i.mac !== '00:00:00:00:00:00'
        );
        if (found) { macAddress = found.mac; break; }
      }
    } catch { /* yoksay */ }

    let machineUUID = 'Bilinmiyor';
    try {
      if (os.platform() === 'win32') {
        const out   = execSync('wmic csproduct get UUID /value', { timeout: 3000 }).toString();
        const match = out.match(/UUID=([^\r\n]+)/);
        if (match) machineUUID = match[1].trim();
      } else if (os.platform() === 'darwin') {
        const out   = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', { timeout: 3000 }).toString();
        const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        if (match) machineUUID = match[1].trim();
      } else {
        machineUUID = execSync('cat /etc/machine-id', { timeout: 3000 }).toString().trim();
      }
    } catch { /* yoksay */ }

    let diskSerial = 'Bilinmiyor';
    try {
      if (os.platform() === 'win32') {
        const out   = execSync('wmic diskdrive get SerialNumber /value', { timeout: 3000 }).toString();
        const match = out.match(/SerialNumber=([^\r\n]+)/);
        if (match) diskSerial = match[1].trim();
      }
    } catch { /* yoksay */ }

    return {
      hostname:      os.hostname(),
      platform:      os.platform(),
      release:       os.release(),
      arch:          os.arch(),
      username:      os.userInfo().username,
      totalMemoryGB: (os.totalmem() / 1073741824).toFixed(1),
      cpuModel:      cpus.length > 0 ? cpus[0].model : 'Bilinmiyor',
      cpuCores:      cpus.length,
      macAddress,
      machineUUID,
      diskSerial,
    };
  });

  // ── IPC: bildirim göster ──────────────────────────────────────────────────
  ipcMain.on('notify:show', (_event, payload) => {
    if (!payload || typeof payload !== 'object') return;

    const { title, body, todoId } = payload;
    if (typeof title !== 'string' || title.trim().length === 0) return;

    const normalizedTitle = title.trim();
    const normalizedBody  = typeof body === 'string' ? body : '';
    let   shown           = false;

    if (Notification.isSupported()) {
      try {
        const notif = new Notification({
          title: normalizedTitle,
          body:  normalizedBody,
          icon:  loadIcon(false),
        });
        notif.on('click', () => {
          showMainWindow();
          if (todoId && typeof todoId === 'string' && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notification:clicked', { todoId });
          }
        });
        notif.show();
        shown = true;
      } catch (_) { shown = false; }
    }

    if (!shown) showTrayBalloon(normalizedTitle, normalizedBody);
  });

  // ── IPC: dosya indir ──────────────────────────────────────────────────────
  ipcMain.handle('download:file', async (_event, { url, fileName }) => {
    // Giriş doğrulama
    if (typeof url !== 'string' || typeof fileName !== 'string') {
      return { success: false, reason: 'invalid-input' };
    }
    try { new URL(url); } catch {
      return { success: false, reason: 'invalid-url' };
    }
    // Dosya adında path traversal engelle
    const safeName = path.basename(fileName) || 'download';

    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(os.homedir(), 'Downloads', safeName),
        buttonLabel: 'Kaydet',
      });
      if (canceled || !filePath) return { success: false, reason: 'canceled' };

      return new Promise((resolve) => {
        mainWindow.webContents.session.once('will-download', (_ev, item) => {
          item.setSavePath(filePath);
          item.once('done', (_ev2, state) => {
            resolve(state === 'completed'
              ? { success: true }
              : { success: false, reason: state }
            );
          });
        });
        mainWindow.webContents.downloadURL(url);
      });
    } catch (err) {
      return { success: false, reason: String(err) };
    }
  });

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) { showMainWindow(); return; }
    openMainApp();
  });
});

// ─── Pencere kapatılma olayları ───────────────────────────────────────────────
app.on('window-all-closed', () => {
  // macOS'ta tüm pencereler kapatılsa bile uygulama çalışmaya devam eder
  if (process.platform !== 'darwin') return;
});

app.on('before-quit', () => {
  isQuiting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:before-quit');
  }
});

app.on('will-quit', () => {
  if (tray) { tray.destroy(); tray = null; }
});
