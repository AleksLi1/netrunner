# Workflow: Build Desktop App

<purpose>
End-to-end desktop application building from architecture to distribution.
6 mandatory phases in strict order. Each phase has a gate that must pass before proceeding.
This workflow applies to Electron, Tauri, and other desktop frameworks.
</purpose>

<inputs>
- Application description and requirements from user (via run.md BUILD classification with desktop domain)
- `.planning/CONTEXT.md` — project context, constraints, prior work
- Target platforms (Windows, macOS, Linux)
- Framework choice (Electron, Tauri, or native)
</inputs>

<prerequisites>
- Desktop persona must be active (desktop domain signals detected in CONTEXT.md)
- References loaded: desktop-reasoning.md, desktop-code-patterns.md, desktop-architecture.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "ARCHITECTURE",    # Phase 1: Process model, security model, IPC design
    "CORE_FEATURES",   # Phase 2: Application functionality through secure IPC
    "NATIVE",          # Phase 3: OS integration (files, tray, notifications, protocols)
    "SECURITY",        # Phase 4: Security hardening and audit
    "PACKAGING",       # Phase 5: Build, sign, create installers
    "DISTRIBUTION"     # Phase 6: Auto-update, rollback, release channels
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from PACKAGING back to SECURITY).
# Forward skipping is NEVER allowed.
```

### Skip Prevention Logic

Before entering any phase N, verify:
1. All phases 1 through N-1 have status COMPLETE in STATE.md
2. All gates for phases 1 through N-1 have PASS status
3. No CRITICAL violations remain unresolved from prior audits

If any check fails, HALT and report which prerequisite is missing.

</phase_enforcement>

<procedure>

## Phase 1: ARCHITECTURE AND SETUP

**Goal:** Establish the process model, security model, and IPC architecture before writing any features.

### 1.1 Framework Selection

If the framework is not already decided, evaluate:

| Factor | Electron | Tauri | Native (WPF/Cocoa/GTK) |
|--------|----------|-------|------------------------|
| Binary size | ~150MB | ~5MB | Varies |
| Memory baseline | ~100MB/window | ~30MB | ~20-50MB |
| Language | TypeScript/JavaScript | Rust + TypeScript | C#/Swift/C++ |
| Node.js modules | Full access | Not available | Not applicable |
| Security defaults | Requires configuration | Secure by default | Platform-dependent |
| Cross-platform | Windows/macOS/Linux | Windows/macOS/Linux | Usually single-platform |
| Hiring pool | Large | Small but growing | Platform-specific |

Decision criteria:
- If the team knows TypeScript and needs Node.js native modules → **Electron**
- If binary size matters and team knows or can learn Rust → **Tauri**
- If single-platform with deep OS integration is the priority → **Native**

### 1.2 Process Model Design

Define the process architecture:

```markdown
## Process Model
- **Main process responsibilities:** [window management, file I/O, IPC routing, auto-update, tray]
- **Renderer count:** [single window | multi-window with pooling | dynamic]
- **Worker threads:** [needed for: heavy computation, image processing, etc.]
- **Child processes:** [needed for: CLI tools, background tasks, etc.]
```

### 1.3 Security Model Definition

Document the security configuration BEFORE writing any code:

```typescript
// Security model — define FIRST, implement FIRST
const SECURITY_MODEL = {
  webPreferences: {
    nodeIntegration: false,     // NON-NEGOTIABLE
    contextIsolation: true,     // NON-NEGOTIABLE
    sandbox: true,              // NON-NEGOTIABLE for user content
    webSecurity: true,          // NON-NEGOTIABLE
  },
  csp: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  allowedPermissions: ['notifications'],  // explicit allowlist
  allowedExternalUrls: ['https://'],      // only HTTPS
  sensitiveStorage: 'keytar',             // OS keychain for tokens
};
```

### 1.4 IPC Channel Registry

Define all IPC channels with types before implementing any:

```typescript
// shared/ipc-channels.ts — source of truth
export interface IpcChannels {
  // File operations
  'file:read': { args: [id: string]; result: string };
  'file:save': { args: [id: string, content: string]; result: { saved: boolean } };
  'file:delete': { args: [id: string]; result: void };

  // Dialog operations
  'dialog:open': { args: [filters?: FileFilter[]]; result: string | null };
  'dialog:save': { args: [defaultName: string]; result: string | null };

  // App operations
  'app:version': { args: []; result: string };
  'app:quit': { args: []; result: void };

  // Window operations
  'window:minimize': { args: []; result: void };
  'window:maximize': { args: []; result: void };
  'window:close': { args: []; result: void };
}
```

### 1.5 Project Scaffolding

Set up the project structure:

```
Task(
  subagent_type="nr-executor",
  description="Scaffold desktop app project",
  prompt="Create the project structure:

  For Electron:
  - src/main/       — main process code
  - src/preload/    — preload scripts
  - src/renderer/   — UI code
  - src/shared/     — shared types (IPC channels)
  - build/          — build resources (icons, entitlements)

  For Tauri:
  - src-tauri/src/  — Rust backend
  - src/            — frontend code
  - src/lib/        — shared types

  Install dependencies, configure TypeScript, set up build tooling.
  Implement the security model from Phase 1.3.
  Implement the IPC channel registry from Phase 1.4.
  Write the BrowserWindow creation with secure defaults."
)
```

### 1.6 Outputs

- Project scaffold with secure defaults
- `shared/ipc-channels.ts` — typed IPC channel registry
- Main process with BrowserWindow, security config, and IPC handlers
- Preload script with contextBridge
- `.planning/desktop/ARCHITECTURE.md` — process model, security model, IPC design

### Gate: ARCHITECTURE_REVIEW

```
Task(
  subagent_type="nr-verifier",
  description="Desktop architecture security review",
  prompt="Review the desktop app architecture for security and correctness.

  Load references/desktop-code-patterns.md for correct/incorrect patterns.

  Check:
  1. nodeIntegration is false in ALL BrowserWindow instances
  2. contextIsolation is true in ALL BrowserWindow instances
  3. sandbox is true for renderers loading user content
  4. CSP is configured and blocks inline scripts
  5. All IPC channels have typed definitions
  6. Preload script uses contextBridge, not direct window assignment
  7. No synchronous IPC (sendSync) anywhere
  8. File paths use app.getPath() and path.join(), no hardcoded paths

  Scoring:
  - CRITICAL (nodeIntegration true, missing contextIsolation): -25 points from 100
  - WARNING (missing CSP, untyped IPC): -10 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-ARCHITECTURE.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 2: CORE FEATURES

**Goal:** Implement application-specific functionality through the secure IPC layer.

### 2.1 Feature Implementation Rules

Every feature must follow the secure IPC pattern:
1. Define the IPC channel type in `shared/ipc-channels.ts`
2. Implement the handler in the main process with input validation
3. Expose the API in the preload script via contextBridge
4. Call the API from the renderer using `window.api.*`

```typescript
// Example: Adding a "export to PDF" feature

// Step 1: Type definition (shared/ipc-channels.ts)
'export:pdf': { args: [docId: string, options: PdfOptions]; result: { path: string } };

// Step 2: Main process handler with validation
ipcMain.handle('export:pdf', async (_event, docId: unknown, options: unknown) => {
  const id = z.string().regex(/^[\w-]+$/).parse(docId);
  const opts = PdfOptionsSchema.parse(options);
  const doc = await loadDocument(id);
  const pdfPath = path.join(app.getPath('temp'), `${id}.pdf`);
  await generatePdf(doc, pdfPath, opts);
  return { path: pdfPath };
});

// Step 3: Preload exposure
exportPdf: (docId: string, options: PdfOptions) =>
  ipcRenderer.invoke('export:pdf', docId, options),

// Step 4: Renderer usage
const result = await window.api.exportPdf(currentDocId, { format: 'A4' });
```

### 2.2 State Management

Choose a state management approach:
- **Renderer state:** React state, Zustand, or Jotai for UI state
- **Persistent state:** electron-store for preferences, IPC + main process for document data
- **Shared state between windows:** IPC messages between main and all renderers

```typescript
// Main process as state coordinator
const appState = new Store<AppState>();

ipcMain.handle('state:get', (_event, key: unknown) => {
  return appState.get(z.string().parse(key));
});

ipcMain.handle('state:set', (_event, key: unknown, value: unknown) => {
  appState.set(z.string().parse(key), value);
  // Broadcast to all windows
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('state:changed', { key, value });
  });
});
```

### 2.3 Error Handling

Every IPC handler must handle errors gracefully:

```typescript
// Wrap all IPC handlers with error handling
function safeHandle(channel: string, handler: Function) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      log.error(`IPC error [${channel}]:`, error);
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw new Error(`Operation failed: ${error.message}`);
    }
  });
}
```

### 2.4 Outputs

- Feature modules implemented through IPC
- Input validation on all IPC handlers
- Error handling for all operations
- `.planning/desktop/FEATURE_INVENTORY.md` — all features with IPC channels

### Gate: FEATURE_REVIEW

```
Task(
  subagent_type="nr-verifier",
  description="Feature implementation review",
  prompt="Review all implemented features for IPC safety and completeness.

  Check:
  1. Every feature uses IPC invoke/handle (no sendSync, no direct Node.js)
  2. All IPC handlers validate input with schema validation
  3. Error handling wraps all IPC handlers
  4. No sensitive data stored in renderer (localStorage, sessionStorage)
  5. All file operations go through the main process with path validation

  Scoring:
  - CRITICAL (direct Node.js in renderer, unvalidated IPC): -25 points
  - WARNING (missing error handling, no input schema): -10 points
  - Must score >= 85 to pass

  Write audit: .planning/audit/AUDIT-FEATURES.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 3: NATIVE INTEGRATION

**Goal:** Add OS-level features — file system access, system tray, notifications, protocol handlers, drag-and-drop.

### 3.1 File System Integration

```typescript
// Native file dialogs for user-initiated file access
ipcMain.handle('dialog:open', async (_event, filters?: FileFilter[]) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled) return null;
  return { path: result.filePaths[0], content: await fs.readFile(result.filePaths[0], 'utf8') };
});

// File watching for external changes (optional)
// Use chokidar with debouncing for stability
```

### 3.2 System Tray (if applicable)

- Tray icon with context menu
- Click-to-show/hide window behavior
- Platform-specific icon format (ICO for Windows, PNG for macOS/Linux)

### 3.3 Notifications

- Use Electron's Notification API (respects OS notification settings)
- Fallback gracefully if notifications are not supported or disabled

### 3.4 Protocol Handlers

- Register custom protocol (`myapp://`)
- Validate ALL input from protocol URLs (they can be triggered by any website)
- Handle on both first-instance and second-instance events

### 3.5 Drag and Drop

- Validate file types and sizes on drop
- Route through IPC to main process for processing
- Prevent navigation-on-drop (set `navigateOnDragDrop: false`)

### 3.6 Outputs

- Native integration modules
- Platform-specific adaptations
- `.planning/desktop/NATIVE_INTEGRATION.md` — OS features, platform coverage

### Gate: NATIVE_COVERAGE

```
Task(
  subagent_type="nr-verifier",
  description="Native integration coverage test",
  prompt="Verify native integration works correctly on all target platforms.

  Check:
  1. File dialogs open correctly and return validated paths
  2. System tray works on all platforms (icon format, click behavior)
  3. Notifications respect OS settings (DND, Focus Assist)
  4. Protocol handler validates all input parameters
  5. Drag-and-drop validates file types and routes through IPC
  6. All native features degrade gracefully on unsupported platforms

  Scoring:
  - CRITICAL (unvalidated protocol handler, unrestricted file access): -25 points
  - WARNING (missing platform fallback, no file type validation): -10 points
  - Must score >= 85 to pass

  Write audit: .planning/audit/AUDIT-NATIVE.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 4: SECURITY HARDENING

**Goal:** Comprehensive security audit and hardening pass before packaging.

### 4.1 Security Audit Checklist

| Check | Requirement | Severity |
|-------|------------|----------|
| nodeIntegration | false in ALL windows | CRITICAL |
| contextIsolation | true in ALL windows | CRITICAL |
| sandbox | true for user content windows | CRITICAL |
| webSecurity | true (never disabled) | CRITICAL |
| CSP header | Set on all pages, no unsafe-eval | HIGH |
| IPC validation | All handlers validate input | HIGH |
| File path scoping | All file ops within allowed dirs | HIGH |
| External URL validation | Only HTTPS, no arbitrary schemes | HIGH |
| Sensitive storage | Tokens in OS keychain, not files | HIGH |
| Permission handler | Explicit allowlist, deny by default | MEDIUM |
| Navigation guard | Prevent renderer from navigating to external URLs | MEDIUM |
| Window open handler | Block or redirect popup windows | MEDIUM |

### 4.2 Dependency Audit

```bash
# Check for known vulnerabilities
npm audit --production

# Check for Electron-specific security issues
npx electron-security-checker
```

### 4.3 CSP Verification

```typescript
// Verify CSP blocks inline scripts
// Test by injecting: <script>alert('xss')</script>
// Must be blocked by CSP
```

### 4.4 Outputs

- Security audit results
- Hardened configuration
- `.planning/audit/AUDIT-SECURITY.md` — full security audit with pass/fail per check

### Gate: SECURITY_AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Full desktop app security audit",
  prompt="Run a comprehensive security audit on the desktop application.

  Load references/desktop-code-patterns.md for all 10 security patterns.

  Check every item in the Phase 4 Security Audit Checklist.
  Additionally check:
  1. No eval(), new Function(), or dynamic code execution in main process
  2. No shell.openExternal() with unvalidated URLs
  3. No child_process.exec() with user-controlled input
  4. All third-party dependencies reviewed for known vulnerabilities
  5. DevTools disabled in production builds
  6. Source maps excluded from production builds

  Scoring:
  - CRITICAL (nodeIntegration, missing contextIsolation, shell injection): -30 points
  - HIGH (missing CSP, unvalidated IPC, unscoped file access): -15 points
  - MEDIUM (missing permission handler, no navigation guard): -5 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-SECURITY.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries. Security gate has ZERO tolerance for CRITICAL violations.

---

## Phase 5: PACKAGING AND SIGNING

**Goal:** Build production-ready installers with code signing for all target platforms.

### 5.1 Build Configuration

Set up electron-builder or Tauri bundler with:
- Platform-specific targets (NSIS for Windows, DMG+ZIP for macOS, AppImage/deb for Linux)
- Code signing certificates configured
- Notarization for macOS
- ASAR packaging enabled
- Source maps excluded
- Dev dependencies excluded

### 5.2 Code Signing

| Platform | Requirement | Certificate Type |
|----------|------------|-----------------|
| macOS | Developer ID + notarization | Apple Developer ID Application |
| Windows | Authenticode signing | EV or OV code signing certificate |
| Linux | GPG signing (for package repos) | GPG key pair |

### 5.3 Cross-Platform Build

```bash
# Build for all platforms (ideally in CI)
# macOS builds must run on macOS (notarization requirement)
# Windows builds can cross-compile from Linux/macOS with Wine
# Linux builds are best on Linux

# electron-builder
npx electron-builder --mac --win --linux

# Tauri
cargo tauri build
```

### 5.4 Outputs

- Signed installers for all target platforms
- Build configuration files
- `.planning/desktop/BUILD_LOG.md` — build results per platform

### Gate: BUILD_VERIFICATION

```
Task(
  subagent_type="nr-verifier",
  description="Verify production builds",
  prompt="Verify the production build artifacts.

  Check:
  1. All platform builds complete successfully
  2. macOS build is code-signed and notarized (verify with codesign -v and spctl --assess)
  3. Windows build is Authenticode-signed (verify with signtool verify)
  4. Binary size is reasonable (Electron <200MB, Tauri <20MB per platform)
  5. ASAR archive is present (Electron)
  6. No source maps in production bundle
  7. No devDependencies in production bundle
  8. App launches and basic functionality works on all platforms

  Scoring:
  - CRITICAL (unsigned build, missing notarization): -30 points
  - WARNING (oversized binary, source maps present): -10 points
  - Must score >= 85 to pass

  Write audit: .planning/audit/AUDIT-BUILD.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 6: DISTRIBUTION AND UPDATES

**Goal:** Set up auto-update infrastructure with rollback capability and staged rollouts.

### 6.1 Update Server

Configure the update server:
- GitHub Releases (simplest for open source)
- S3/CloudFront (for private apps)
- Custom server (for enterprise with on-premise requirements)

### 6.2 Auto-Update Implementation

```typescript
// Full update lifecycle — see desktop-code-patterns.md Pattern 10
// Key requirements:
// - Async check (never block startup)
// - User notification before download
// - Progress reporting
// - Error handling with retry
// - Rollback on crash loop detection
```

### 6.3 Update Channels

```typescript
// Staged rollout via channels
// alpha → beta → stable
autoUpdater.channel = getUserUpdateChannel();

// Percentage-based rollout (if using custom server)
// 1% → 10% → 50% → 100%
```

### 6.4 Rollback Mechanism

- Detect crash loops (3+ crashes in 60 seconds = likely bad update)
- Offer to reset settings or report the issue
- Preserve user data across rollbacks

### 6.5 Release Checklist

Before each release:
- [ ] All gates passed (architecture, features, native, security, build)
- [ ] Changelog written
- [ ] Version bumped following semver
- [ ] Beta channel tested for 48+ hours
- [ ] Update path tested from current production version
- [ ] Update path tested from N-2 version
- [ ] Rollback tested manually

### 6.6 Outputs

- Auto-update module with full lifecycle handling
- Update server configuration
- Release checklist
- `.planning/desktop/RELEASE_PLAN.md` — update strategy, channels, rollback

### Gate: UPDATE_VERIFICATION

```
Task(
  subagent_type="nr-verifier",
  description="Verify auto-update system",
  prompt="Verify the auto-update system works end-to-end.

  Check:
  1. Update check runs asynchronously (never blocks startup)
  2. Update available notification reaches the renderer
  3. Download progress is reported
  4. Error handling covers: server down, download interrupted, signature mismatch
  5. Rollback mechanism works (crash loop detection)
  6. Update from N-1 version succeeds
  7. Update from N-2 version succeeds
  8. User data preserved across updates

  Scoring:
  - CRITICAL (blocking startup, no error handling, no signature check): -25 points
  - WARNING (no progress reporting, no rollback, no crash detection): -10 points
  - Must score >= 85 to pass

  Write audit: .planning/audit/AUDIT-UPDATE.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Final: RELEASE REVIEW

After all 6 phases pass their gates, present the summary to the user:

```
====================================================
  DESKTOP APP BUILD COMPLETE — RELEASE REVIEW
====================================================

App: [name]
Version: [version]
Framework: [Electron/Tauri]
Platforms: [Windows/macOS/Linux]

SECURITY:
  nodeIntegration:    disabled
  contextIsolation:   enabled
  sandbox:            enabled
  CSP:                configured
  Code signing:       [status per platform]

PERFORMANCE:
  Cold start:         [X.Xs]
  Idle memory:        [X MB]
  Binary size:        [X MB per platform]

AUDIT STATUS:
  Architecture audit: [PASS/FAIL] (score: [XX]/100)
  Feature audit:      [PASS/FAIL] (score: [XX]/100)
  Native audit:       [PASS/FAIL] (score: [XX]/100)
  Security audit:     [PASS/FAIL] (score: [XX]/100)
  Build audit:        [PASS/FAIL] (score: [XX]/100)
  Update audit:       [PASS/FAIL] (score: [XX]/100)

====================================================
```

Ask: **"Ready to publish to the beta channel?"**
- On YES: push to beta channel, monitor for 48 hours
- On NO: ask what concerns remain, address them

</procedure>

<gate_failure_protocol>

## Gate Failure Protocol

When any gate fails:

### Step 1: Log Failure
Write to CONTEXT.md:
```
| Phase [N] gate failed | Score: [XX]/100 | [N] CRITICAL, [M] WARNING violations | [date] |
```

### Step 2: Extract Remediation Tasks
Parse the audit report for violations and create a task list:
```markdown
## Remediation Tasks (Phase [N] Gate Failure)
- [ ] CRITICAL: [violation description] — [file:line]
- [ ] WARNING: [violation description] — [file:line]
```

### Step 3: Execute Fixes

```
Task(
  subagent_type="nr-executor",
  description="Fix audit violations for Phase [N]",
  prompt="Fix the following violations from the desktop app audit:

  [violation list from audit report]

  Reference: desktop-code-patterns.md for correct patterns.
  Fix each violation. Do not introduce new violations."
)
```

### Step 4: Re-Audit
Re-run the same gate audit. Compare scores.

### Step 5: Retry Limit
Maximum 3 gate retries per phase. After 3 failures:
- HALT the workflow
- Write to CONTEXT.md: "Phase [N] gate failed 3 times — requires user intervention"
- Present failure summary to user with specific unresolved violations
- Ask: "How would you like to proceed?"

</gate_failure_protocol>

<artifacts>

## Artifacts Per Phase

| Phase | Key Artifacts | Audit Report |
|-------|--------------|--------------|
| 1. Architecture | ARCHITECTURE.md, ipc-channels.ts, scaffold | AUDIT-ARCHITECTURE.md |
| 2. Core Features | Feature modules, FEATURE_INVENTORY.md | AUDIT-FEATURES.md |
| 3. Native | Native modules, NATIVE_INTEGRATION.md | AUDIT-NATIVE.md |
| 4. Security | Hardened config, dependency audit | AUDIT-SECURITY.md |
| 5. Packaging | Signed installers, BUILD_LOG.md | AUDIT-BUILD.md |
| 6. Distribution | Update module, RELEASE_PLAN.md | AUDIT-UPDATE.md |

All artifacts are written to `.planning/desktop/`.
All audits are written to `.planning/audit/`.

</artifacts>

<integration>

## Integration with run.md

This workflow is dispatched when run.md classifies intent as a desktop app build:

**Detection signals (need 3+ for activation):**
- COLD state (no existing .planning/ for this project)
- User mentions "build a desktop app", "Electron app", "Tauri app"
- Package.json contains electron, @electron-forge/*, or tauri dependencies
- CONTEXT.md has desktop domain signals (BrowserWindow, IPC, main process, renderer)
- Project structure matches desktop app layout (src/main, src/renderer, src-tauri)

**On activation:**
1. Load references: desktop-reasoning.md, desktop-code-patterns.md, desktop-architecture.md
2. Load overlay: desktop.md
3. Activate desktop architect persona
4. Begin Phase 1 (ARCHITECTURE)

</integration>
