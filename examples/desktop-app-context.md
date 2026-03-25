# Netrunner Context — CrossNote Desktop Editor

## Project Goal
Build a cross-platform markdown editor with live preview, file system integration, auto-save, and seamless auto-updates. Target: Production-ready desktop app shipping on Windows, macOS, and Linux with <2s cold start and <200MB memory footprint.

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| Core features built | 6/10 | 10 |
| IPC channels typed | 8/12 | 12 |
| Cold start time | 3.4s | <2s |
| Idle memory | 280MB | <200MB |
| Binary size (Windows) | 195MB | <180MB |
| Code signing | macOS only | All platforms |
| Auto-update | Not implemented | Differential with rollback |
| Cross-platform tested | macOS only | Windows + macOS + Linux |

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| nodeIntegration: false | Security — XSS must not escalate to RCE | Full system compromise via any XSS |
| contextIsolation: true | Security — prevent prototype pollution | Preload API interception |
| Electron 28+ | Team standard, ESM support needed | Rewrite module system |
| TypeScript strict | Team standard, type safety | Regression in IPC type safety |
| macOS notarization | Required for distribution | Blocked installs on macOS |
| ASAR packaging | Prevents casual source inspection | Source code exposure |

## Diagnostic State
**Active hypothesis:** High idle memory (280MB) is caused by keeping two BrowserWindows alive — the main editor window and a hidden preview window that is never destroyed, only hidden. Each Chromium process has ~100MB baseline overhead.
**Evidence for:** Task Manager shows two renderer processes even when preview panel is collapsed. Destroying the preview window drops memory to 170MB.
**Evidence against:** Memory still grows slowly over 4+ hours even with single window — possible event listener leak.
**Confidence:** Medium-High — window pooling will help, but leak investigation also needed.
**Open questions:** Is the memory growth from accumulated file watcher events? Should preview be an in-window iframe instead of a separate BrowserWindow?

## What Has Been Tried
| Approach | Outcome | Confidence | Failure Mode | Phase | Date |
|----------|---------|------------|--------------|-------|------|
| Lazy-load syntax highlighting | Saved 400ms cold start | High | N/A — successful | Phase 2 | 2025-01-15 |
| Window state persistence | Works on macOS, untested elsewhere | Medium | May fail on multi-monitor setups | Phase 2 | 2025-01-18 |
| IPC typed channel registry | 8/12 channels typed | High | N/A — in progress | Phase 1 | 2025-01-20 |
| Preview in separate BrowserWindow | Works but 280MB idle memory | Low | Memory bloat — needs rearchitecting | Phase 2 | 2025-01-22 |
| electron-updater setup | Configured but unsigned builds fail | Low | Code signing not set up for Windows | Phase 5 | 2025-02-01 |

## Domain Knowledge
- Electron 28 with ESM support
- React 18 for renderer UI with Zustand for state
- CodeMirror 6 for editor component (heavy — 200KB bundled)
- electron-builder for packaging
- electron-store for preferences (NOT for sensitive data)
- chokidar for file watching
- marked + DOMPurify for markdown rendering (sanitized to prevent XSS)

## Decision Log
| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|
| Phase 1 | Electron over Tauri | Team knows TypeScript, needs Node.js fs module access for file watching | Correct — productivity advantage |
| Phase 1 | Typed IPC channels | Prevent message shape drift between main and renderer | Correct — caught 3 type mismatches |
| Phase 2 | CodeMirror 6 over Monaco | Monaco adds 5MB to bundle, CodeMirror is lighter and more customizable | Correct — good trade-off |
| Phase 2 | Separate preview window | Isolate preview rendering from editor performance | Reassessing — memory cost too high |

## Update Log
| Date | Phase | Change |
|------|-------|--------|
| 2025-01-12 | Phase 1 | Project scaffolded with Electron 28 + React 18 + TypeScript |
| 2025-01-15 | Phase 2 | Editor core working with CodeMirror 6, syntax highlighting lazy-loaded |
| 2025-01-22 | Phase 2 | Preview window implemented but memory concerns raised |
| 2025-02-01 | Phase 5 | electron-updater added but code signing blocks update testing |
