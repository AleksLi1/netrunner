# Desktop Application Architecture Reference

## 1. When to Load This Reference

**Loaded by:** nr-executor, nr-researcher, nr-verifier, nr-planner, nr-mapper

**Trigger keywords:** Electron, Tauri, desktop, BrowserWindow, IPC, main process, renderer,
preload, contextBridge, auto-update, electron-builder, code signing, notarization, tray,
native module, node-gyp, napi, system tray, protocol handler, deep link

**Load condition:** Desktop application domain detected in CONTEXT.md, current task involves
Electron or Tauri development, or code under review contains desktop-specific patterns.

**See also:** `desktop-reasoning.md` (reasoning triggers), `desktop-code-patterns.md` (code patterns)

---

## 2. IPC Architecture

The inter-process communication layer is the backbone of every Electron application. It defines the security boundary between the trusted main process and the untrusted renderer processes.

### 2.1 Process Model

```
+------------------+     IPC (async)     +-------------------+
|   Main Process   | <=================> |  Renderer Process  |
| (Node.js + APIs) |     contextBridge   | (Chromium + React) |
|                  |                     |                    |
| - File system    |     +----------+    | - UI rendering     |
| - Native menus   | <-- | Preload  | -->| - User interaction |
| - Window mgmt    |     +----------+    | - Web APIs only    |
| - Auto-update    |     (isolated)      |                    |
| - System tray    |                     | nodeIntegration:   |
| - Shell commands |                     |   false (ALWAYS)   |
+------------------+                     +-------------------+
```

**Rules:**
- The renderer NEVER accesses Node.js APIs directly
- The preload script runs in an isolated context (contextIsolation: true)
- All native operations are IPC requests validated by the main process
- The main process is the gatekeeper — it validates, authorizes, and executes

### 2.2 contextBridge Pattern

The contextBridge is the only safe way to expose APIs from the preload script to the renderer:

```typescript
// preload.ts — the ONLY bridge between renderer and Node.js
import { contextBridge, ipcRenderer } from 'electron';

// Type-safe channel definitions
type IpcApi = {
  // File operations — scoped by main process
  readFile: (id: string) => Promise<string>;
  saveFile: (id: string, content: string) => Promise<{ saved: boolean }>;

  // App operations
  getVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;

  // Event subscriptions with cleanup
  onUpdateAvailable: (cb: (version: string) => void) => () => void;
  onFileSaved: (cb: (id: string) => void) => () => void;
};

const api: IpcApi = {
  readFile: (id) => ipcRenderer.invoke('file:read', id),
  saveFile: (id, content) => ipcRenderer.invoke('file:save', id, content),
  getVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  onUpdateAvailable: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, version: string) => cb(version);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },

  onFileSaved: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string) => cb(id);
    ipcRenderer.on('file:saved', handler);
    return () => ipcRenderer.removeListener('file:saved', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
```

### 2.3 Typed IPC Channel Registry

For large applications, define all IPC channels in a shared type file:

```typescript
// shared/ipc-channels.ts — source of truth for all IPC
export interface IpcInvokeChannels {
  'file:read': { args: [id: string]; result: string };
  'file:save': { args: [id: string, content: string]; result: { saved: boolean } };
  'file:delete': { args: [id: string]; result: void };
  'dialog:open-file': { args: [filters?: FileFilter[]]; result: string | null };
  'dialog:save-file': { args: [defaultName: string]; result: string | null };
  'app:version': { args: []; result: string };
  'app:platform': { args: []; result: NodeJS.Platform };
  'shell:open-external': { args: [url: string]; result: void };
  'window:minimize': { args: []; result: void };
  'window:maximize': { args: []; result: void };
  'window:close': { args: []; result: void };
}

export interface IpcSendChannels {
  'update:available': { version: string; releaseNotes: string };
  'update:progress': { percent: number };
  'update:ready': { version: string };
  'update:error': { message: string };
  'file:external-change': { id: string };
}

export type FileFilter = { name: string; extensions: string[] };
```

### 2.4 Message Validation Pattern

Every IPC handler in the main process validates input:

```typescript
// main/ipc-handlers.ts
import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';

const FileIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(255);
const UrlSchema = z.string().url().refine(
  (url) => url.startsWith('https://'),
  'Only HTTPS URLs allowed'
);

export function registerIpcHandlers(mainWindow: BrowserWindow, dataDir: string) {
  ipcMain.handle('file:read', async (_event, id: unknown) => {
    const fileId = FileIdSchema.parse(id);
    const filePath = path.join(dataDir, `${fileId}.md`);
    return fs.readFile(filePath, 'utf8');
  });

  ipcMain.handle('file:save', async (_event, id: unknown, content: unknown) => {
    const fileId = FileIdSchema.parse(id);
    const fileContent = z.string().max(10_000_000).parse(content);
    const filePath = path.join(dataDir, `${fileId}.md`);
    await fs.writeFile(filePath, fileContent, 'utf8');
    mainWindow.webContents.send('file:saved', fileId);
    return { saved: true };
  });

  ipcMain.handle('shell:open-external', async (_event, url: unknown) => {
    const validUrl = UrlSchema.parse(url);
    await shell.openExternal(validUrl);
  });

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);
}
```

---

## 3. Auto-Update System

### 3.1 Electron (electron-updater)

```
┌─────────────┐    check     ┌──────────────┐    download    ┌────────────┐
│  App Launch  │ ──────────> │ Update Server │ ────────────> │  Download   │
│  (30s delay) │             │  (GitHub/S3)  │               │  & Verify   │
└─────────────┘             └──────────────┘               └────────────┘
                                                                   │
                                                                   v
┌─────────────┐   restart    ┌──────────────┐    verify      ┌────────────┐
│  Running New │ <────────── │   Install     │ <──────────── │   Signed?  │
│   Version    │             │   on Quit     │               │   Valid?   │
└─────────────┘             └──────────────┘               └────────────┘
```

**Key configuration:**

```typescript
// electron-builder.config.js
module.exports = {
  publish: {
    provider: 'github',      // also: s3, generic, spaces
    owner: 'your-org',
    repo: 'your-app',
  },
};
```

**Update channels for staged rollouts:**

```typescript
autoUpdater.channel = process.env.UPDATE_CHANNEL || 'latest';
// Channels: 'alpha' -> 'beta' -> 'latest'
// Users on 'beta' get beta AND stable releases
// Users on 'latest' get only stable releases
```

### 3.2 Differential Updates

Full binary downloads waste bandwidth. Use ASAR differential updates:

```typescript
// electron-builder.config.js
module.exports = {
  // ...
  nsis: {
    differentialPackage: true,  // Windows: generate .blockmap for delta updates
  },
  mac: {
    target: ['zip'],            // macOS: zip required for differential updates
  },
};
// electron-updater automatically detects .blockmap and downloads only changed blocks
```

### 3.3 Rollback Strategy

```typescript
// Store version history for rollback decisions
const store = new Store<{ versionHistory: string[] }>();

app.on('ready', () => {
  const history = store.get('versionHistory', []);
  const currentVersion = app.getVersion();

  // Track version history
  if (history[history.length - 1] !== currentVersion) {
    history.push(currentVersion);
    store.set('versionHistory', history.slice(-10)); // keep last 10
  }

  // Detect crash loop (if app launches 3+ times in 60 seconds, offer rollback)
  const lastLaunch = store.get('lastLaunchTime', 0);
  const crashCount = store.get('crashCount', 0);
  const now = Date.now();

  if (now - lastLaunch < 60_000) {
    store.set('crashCount', crashCount + 1);
    if (crashCount >= 2) {
      // Offer to revert — show dialog before loading main UI
      dialog.showMessageBoxSync({
        type: 'warning',
        message: 'The app has crashed multiple times. Would you like to reset to defaults?',
        buttons: ['Reset Settings', 'Continue'],
      });
    }
  } else {
    store.set('crashCount', 0);
  }
  store.set('lastLaunchTime', now);
});
```

### 3.4 Tauri Updater

```rust
// src-tauri/tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://releases.myapp.com/{{target}}/{{arch}}/{{current_version}}"],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ..."
    }
  }
}
```

```rust
// src-tauri/src/main.rs
use tauri_plugin_updater::UpdaterExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(Some(update)) = handle.updater().check().await {
                    // update.download_and_install(progress_handler, finished_handler).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 4. Native Integration

### 4.1 File System Access

```typescript
// Scoped file access through native dialogs
ipcMain.handle('dialog:open-file', async (_event, filters?: FileFilter[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// File watching for external changes
import { watch } from 'chokidar';

function watchFile(filePath: string, onChange: () => void): () => void {
  const watcher = watch(filePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });
  watcher.on('change', onChange);
  return () => watcher.close();
}
```

### 4.2 System Tray

```typescript
let tray: Tray | null = null;

function createTray(mainWindow: BrowserWindow) {
  const iconPath = path.join(
    app.isPackaged ? process.resourcesPath : __dirname,
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );

  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('MyApp');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}
```

### 4.3 Protocol Handlers (Deep Links)

```typescript
// Register custom protocol: myapp://action/param
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('myapp');
}

// Handle protocol URL
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

function handleProtocolUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'myapp:') return;

    // Validate and sanitize every parameter
    const action = parsed.hostname;
    const allowedActions = ['open', 'import', 'auth-callback'];

    if (!allowedActions.includes(action)) {
      log.warn(`Unknown protocol action: ${action}`);
      return;
    }

    // Route to appropriate handler
    switch (action) {
      case 'open':
        const docId = parsed.searchParams.get('id');
        if (docId && /^[a-zA-Z0-9_-]+$/.test(docId)) {
          mainWindow?.webContents.send('navigate', `/doc/${docId}`);
        }
        break;
      case 'auth-callback':
        const token = parsed.searchParams.get('token');
        if (token) handleAuthCallback(token);
        break;
    }
  } catch (e) {
    log.error('Invalid protocol URL:', url);
  }
}
```

### 4.4 Native Notifications

```typescript
import { Notification } from 'electron';

function showNotification(title: string, body: string, onClick?: () => void) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body,
    silent: false,
    icon: path.join(process.resourcesPath, 'icon.png'),
  });

  if (onClick) {
    notification.on('click', onClick);
  }

  notification.show();
}
```

### 4.5 Drag and Drop

```typescript
// main.ts — handle file drops securely
mainWindow.webContents.on('will-navigate', (event, url) => {
  // Prevent navigation from dropped files
  if (url !== mainWindow.webContents.getURL()) {
    event.preventDefault();
  }
});

// preload.ts — expose drop handler
contextBridge.exposeInMainWorld('api', {
  handleFileDrop: (filePaths: string[]) =>
    ipcRenderer.invoke('file:handle-drop', filePaths),
});

// main.ts — validate dropped files
ipcMain.handle('file:handle-drop', async (_event, filePaths: unknown) => {
  const paths = z.array(z.string()).parse(filePaths);

  return Promise.all(paths.map(async (fp) => {
    const ext = path.extname(fp).toLowerCase();
    const allowedExtensions = ['.md', '.txt', '.json', '.csv'];

    if (!allowedExtensions.includes(ext)) {
      return { path: fp, error: `Unsupported file type: ${ext}` };
    }

    const stat = await fs.promises.stat(fp);
    if (stat.size > 50 * 1024 * 1024) { // 50MB limit
      return { path: fp, error: 'File too large (max 50MB)' };
    }

    const content = await fs.promises.readFile(fp, 'utf8');
    return { path: fp, name: path.basename(fp), content, size: stat.size };
  }));
});
```

---

## 5. Packaging and Distribution

### 5.1 Electron Builder Configuration

```javascript
// electron-builder.config.js — production-ready configuration
module.exports = {
  appId: 'com.mycompany.myapp',
  productName: 'MyApp',
  directories: {
    buildResources: 'build',
    output: 'dist',
  },
  files: [
    'out/**/*',           // compiled main + preload
    'renderer/**/*',      // renderer bundle
    '!**/*.map',          // exclude source maps in production
    '!**/node_modules/*/{test,__tests__}/**',
  ],
  asar: true,             // package as asar archive
  compression: 'maximum',

  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },  // required for auto-update
    ],
    category: 'public.app-category.productivity',
    identity: 'Developer ID Application: My Company (TEAMID)',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: { teamId: process.env.APPLE_TEAM_ID },
  },

  win: {
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
    ],
    signingHashAlgorithms: ['sha256'],
    sign: './scripts/sign-windows.js',
  },

  nsis: {
    oneClick: false,          // show install directory selection
    perMachine: false,        // install for current user only
    allowToChangeInstallationDirectory: true,
    differentialPackage: true, // delta updates
  },

  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
      { target: 'rpm', arch: ['x64'] },
    ],
    category: 'Office',
    maintainer: 'dev@mycompany.com',
  },

  publish: {
    provider: 'github',
    owner: 'my-org',
    repo: 'my-app',
    releaseType: 'release',
  },
};
```

### 5.2 macOS Entitlements

```xml
<!-- build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <!-- Only add file access entitlements if the app actually needs them -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

### 5.3 Tauri Bundler Configuration

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "identifier": "com.mycompany.myapp",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "10.15",
      "signingIdentity": "-",
      "entitlements": "./Entitlements.plist"
    },
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

---

## 6. Security Model

### 6.1 BrowserWindow Security Checklist

```typescript
// SECURE defaults for every BrowserWindow
const SECURE_WEB_PREFERENCES: Electron.WebPreferences = {
  nodeIntegration: false,          // NEVER true
  contextIsolation: true,          // ALWAYS true
  sandbox: true,                   // ALWAYS true for user content
  webSecurity: true,               // NEVER disable
  allowRunningInsecureContent: false, // NEVER enable
  experimentalFeatures: false,     // NEVER enable in production
  enableBlinkFeatures: '',         // NEVER enable custom Blink features
  webviewTag: false,               // Disable <webview> unless explicitly needed
  navigateOnDragDrop: false,       // Prevent accidental navigation
  spellcheck: true,
};
```

### 6.2 Content Security Policy

```typescript
// Set CSP header for all pages
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self';",
        "script-src 'self';",                    // No inline scripts
        "style-src 'self' 'unsafe-inline';",     // Allow inline styles for frameworks
        "img-src 'self' data: https:;",          // Allow data URIs for images
        "font-src 'self';",
        "connect-src 'self' https://api.myapp.com;", // API whitelist
        "frame-src 'none';",                     // No iframes
      ].join(' '),
    },
  });
});
```

### 6.3 Permission Handling

```typescript
// Deny all permission requests by default, whitelist explicitly
session.defaultSession.setPermissionRequestHandler(
  (webContents, permission, callback) => {
    const allowedPermissions: Electron.PermissionType[] = [
      'notifications',
      'clipboard-read',
    ];

    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      log.warn(`Denied permission request: ${permission}`);
      callback(false);
    }
  }
);

// Block navigation to external URLs from renderer
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.origin !== 'file://') {
      event.preventDefault();
      shell.openExternal(url);  // open in system browser instead
    }
  });

  // Block new window creation (popups)
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
```

### 6.4 Secure Storage

```typescript
// Use OS keychain for sensitive data (tokens, API keys)
import keytar from 'keytar';

async function saveToken(service: string, account: string, token: string) {
  await keytar.setPassword(service, account, token);
}

async function getToken(service: string, account: string): Promise<string | null> {
  return keytar.getPassword(service, account);
}

// NEVER store sensitive data in electron-store (unencrypted JSON)
// NEVER store sensitive data in localStorage (accessible from renderer)
```

---

## 7. Cross-Platform Patterns

### 7.1 Platform Detection

```typescript
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
```

### 7.2 Platform-Specific Menus

```typescript
const template: Electron.MenuItemConstructorOptions[] = [
  // macOS app menu (required — first menu item is always the app name menu)
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' as const },
      { type: 'separator' as const },
      { role: 'services' as const },
      { type: 'separator' as const },
      { role: 'hide' as const },
      { role: 'hideOthers' as const },
      { role: 'unhide' as const },
      { type: 'separator' as const },
      { role: 'quit' as const },
    ],
  }] : []),

  // File menu
  {
    label: 'File',
    submenu: [
      { label: 'New', accelerator: 'CommandOrControl+N', click: handleNew },
      { label: 'Open', accelerator: 'CommandOrControl+O', click: handleOpen },
      { label: 'Save', accelerator: 'CommandOrControl+S', click: handleSave },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  },
];
```

### 7.3 Window Behavior

```typescript
// macOS: app stays running when all windows are closed
app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

// macOS: re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// Windows/Linux: single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Someone tried to open a second instance — focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Handle protocol URLs from second instance (Windows/Linux)
    const url = argv.find(arg => arg.startsWith('myapp://'));
    if (url) handleProtocolUrl(url);
  });
}
```

### 7.4 Keyboard Shortcuts

```typescript
// Use CommandOrControl for cross-platform shortcuts
globalShortcut.register('CommandOrControl+Shift+I', () => {
  // Only in development
  if (!app.isPackaged) {
    mainWindow?.webContents.toggleDevTools();
  }
});

// Platform-specific shortcuts
if (isMac) {
  globalShortcut.register('Command+Q', () => app.quit());
}
```

---

## 8. Anti-Patterns Table

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|-----------------|
| `nodeIntegration: true` | XSS = RCE, any injected script has full system access | `nodeIntegration: false` + `contextIsolation: true` + contextBridge |
| `ipcRenderer.sendSync()` | Blocks renderer event loop, freezes UI | `ipcRenderer.invoke()` with async handlers |
| Storing tokens in electron-store | Unencrypted JSON file readable by any process | OS keychain via `keytar` or `safeStorage` |
| Creating windows without `show: false` | White flash while content loads | `show: false` + `ready-to-show` event |
| Hardcoded file paths | Breaks on different OS, username, or install location | `app.getPath()` + `path.join()` |
| `webSecurity: false` | Disables same-origin policy, allows any cross-origin request | Keep `webSecurity: true`, use CSP headers |
| Synchronous file operations in main | Blocks all window management and IPC | Async `fs.promises` with streaming for large files |
| No auto-update error handling | Users stuck on old versions, no visibility | Full lifecycle events with logging and retry |
| `<webview>` tag | Complex security model, historically vulnerability-prone | `BrowserView` or in-app iframe with strict CSP |
| Unlimited IPC exposure | Renderer can invoke any operation | Typed channels, input validation, scoped permissions |
| No single-instance lock | Multiple instances corrupt data, confuse users | `app.requestSingleInstanceLock()` |
| `shell.openExternal(userInput)` | Arbitrary command execution via crafted URLs | Validate URL scheme (https only) before opening |

---

## 9. Reference Implementation: Secure Electron App Scaffold

```typescript
// main.ts — complete secure Electron app entry point
import {
  app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray,
  session, nativeTheme, Notification
} from 'electron';
import path from 'path';
import fs from 'fs/promises';
import Store from 'electron-store';
import log from 'electron-log';
import { z } from 'zod';

// ─── Constants ─────────────────────────────────────────
const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged;
const DATA_DIR = path.join(app.getPath('userData'), 'data');

// ─── Single Instance ───────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ─── Store ─────────────────────────────────────────────
const store = new Store<{
  windowBounds: Electron.Rectangle;
  theme: 'system' | 'light' | 'dark';
}>();

// ─── Window ────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const bounds = store.get('windowBounds', { width: 1200, height: 800 });

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 600,
    minHeight: 400,
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.once('ready-to-show', () => win.show());

  const saveBounds = () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      store.set('windowBounds', win.getBounds());
    }
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('closed', () => { mainWindow = null; });

  // Load app
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  return win;
}

// ─── IPC Handlers ──────────────────────────────────────
function registerHandlers() {
  ipcMain.handle('file:read', async (_e, id: unknown) => {
    const fileId = z.string().regex(/^[\w-]+$/).parse(id);
    return fs.readFile(path.join(DATA_DIR, `${fileId}.md`), 'utf8');
  });

  ipcMain.handle('file:save', async (_e, id: unknown, content: unknown) => {
    const fileId = z.string().regex(/^[\w-]+$/).parse(id);
    const text = z.string().max(10_000_000).parse(content);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, `${fileId}.md`), text, 'utf8');
    return { saved: true };
  });

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }],
    });
    if (result.canceled) return null;
    return fs.readFile(result.filePaths[0], 'utf8');
  });

  ipcMain.handle('shell:open-external', async (_e, url: unknown) => {
    const validUrl = z.string().url().refine(u => u.startsWith('https://')).parse(url);
    await shell.openExternal(validUrl);
  });

  ipcMain.handle('app:version', () => app.getVersion());
}

// ─── App Lifecycle ─────────────────────────────────────
app.whenReady().then(async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  registerHandlers();
  mainWindow = createMainWindow();
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
});
```
