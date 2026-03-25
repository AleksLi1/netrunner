# Mobile App Architecture Reference

## 1. When to Load This Reference

**Loaded by:** nr-executor, nr-researcher, nr-verifier, nr-planner, nr-mapper

**Trigger keywords:** offline, sync, push notification, deep link, universal link, app lifecycle,
background fetch, cold start, navigation stack, app store, review guidelines, in-app purchase,
React Native, Flutter, Swift, Kotlin, Jetpack Compose, SwiftUI, mobile performance, FlatList,
RecyclerView, native module, platform channel, bridge, Hermes, app bundle

**Load condition:** Mobile app development detected in CONTEXT.md, current task, or code under review.

**See also:** `mobile-reasoning.md` (reasoning triggers), `mobile-code-patterns.md` (code patterns)

---

## 2. Offline-First Architecture

### Why Offline-First Is Non-Negotiable

Mobile networks are unreliable by nature. Users ride subways, enter elevators, visit rural areas, and enable airplane mode. An app that requires connectivity to display any content will frustrate users and generate negative reviews.

The principle: **read from cache first, sync in background, resolve conflicts deterministically.**

### Sync Strategies

| Strategy | Best For | Complexity | Conflict Handling |
|----------|----------|------------|-------------------|
| **Last-Write-Wins (LWW)** | Simple data, one editor per record | Low | Timestamp comparison, last edit overwrites |
| **Merge on Field Level** | Records with independent fields | Medium | Per-field LWW, merge non-conflicting changes |
| **Operational Transform (OT)** | Collaborative text editing | High | Transform operations against concurrent edits |
| **CRDT (Conflict-free Replicated Data Types)** | Multi-device sync, collaborative data | High | Mathematically guaranteed convergence |
| **Event Sourcing** | Audit trail required, complex business rules | High | Replay events in order, derive current state |

### LWW Implementation

```typescript
interface SyncRecord {
  id: string;
  data: Record<string, unknown>;
  updatedAt: number; // Unix timestamp from server clock
  localUpdatedAt: number; // Device timestamp (for ordering local changes)
  syncStatus: 'synced' | 'pending' | 'conflict';
  version: number; // Optimistic concurrency control
}

async function syncToServer(localRecords: SyncRecord[]): Promise<SyncResult> {
  const pending = localRecords.filter(r => r.syncStatus === 'pending');

  for (const record of pending) {
    try {
      const response = await api.put(`/records/${record.id}`, {
        data: record.data,
        version: record.version, // Server rejects if version mismatch
      });

      record.version = response.version;
      record.syncStatus = 'synced';
      record.updatedAt = response.serverTimestamp;
    } catch (error) {
      if (error.status === 409) {
        // Version conflict — server has a newer version
        record.syncStatus = 'conflict';
        record.serverData = error.body.currentData; // Store server's version for resolution
      }
      // Network errors: leave as 'pending', retry on next sync
    }
  }

  return { synced: pending.filter(r => r.syncStatus === 'synced').length };
}
```

### CRDT Basics for Mobile

CRDTs guarantee that replicas converge to the same state regardless of message ordering. Common types for mobile:

| CRDT Type | Use Case | Example |
|-----------|----------|---------|
| **G-Counter** | Like counts, view counts | Each device increments its own counter, merge by taking max per device |
| **PN-Counter** | Upvote/downvote, stock levels | Pair of G-Counters (positive + negative) |
| **LWW-Register** | Single-value fields (name, email) | Timestamp-tagged value, highest timestamp wins |
| **OR-Set (Observed-Remove Set)** | Tags, labels, set membership | Add/remove operations with unique tags, add wins on tie |
| **RGA (Replicated Growable Array)** | Collaborative lists, text | Ordered list with unique position identifiers |

```typescript
// Simple LWW-Register CRDT
class LWWRegister<T> {
  private value: T;
  private timestamp: number;
  private nodeId: string;

  set(newValue: T, time: number = Date.now()) {
    if (time > this.timestamp || (time === this.timestamp && this.nodeId > otherNodeId)) {
      this.value = newValue;
      this.timestamp = time;
    }
  }

  merge(other: LWWRegister<T>) {
    if (other.timestamp > this.timestamp) {
      this.value = other.value;
      this.timestamp = other.timestamp;
    }
  }
}
```

### Mutation Queue

```typescript
interface MutationQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  endpoint: string;
  payload: unknown;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
}

class MutationQueue {
  private queue: MutationQueueItem[] = [];

  async enqueue(mutation: Omit<MutationQueueItem, 'id' | 'createdAt' | 'retryCount'>) {
    const item = {
      ...mutation,
      id: uuid(),
      createdAt: Date.now(),
      retryCount: 0,
    };
    this.queue.push(item);
    await this.persist();
    this.processIfOnline();
  }

  async processIfOnline() {
    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) return;

    for (const item of this.queue) {
      try {
        await api[item.type](item.endpoint, item.payload);
        this.queue = this.queue.filter(q => q.id !== item.id);
      } catch (error) {
        item.retryCount++;
        if (item.retryCount >= item.maxRetries) {
          this.moveToDeadLetter(item);
        }
      }
    }
    await this.persist();
  }

  private async persist() {
    await AsyncStorage.setItem('mutation_queue', JSON.stringify(this.queue));
  }
}
```

---

## 3. App Lifecycle Management

### State Transitions

```
               ┌──────────────┐
               │   NOT RUNNING │
               └──────┬───────┘
                      │ Launch
               ┌──────▼───────┐
               │    ACTIVE     │ ◄── User is interacting
               └──────┬───────┘
          Background   │    │  Foreground
               ┌──────▼───────┐
               │  BACKGROUND   │ ◄── ~30s execution window (iOS)
               └──────┬───────┘
                      │ OS reclaims memory
               ┌──────▼───────┐
               │   SUSPENDED   │ ◄── In memory but not executing
               └──────┬───────┘
                      │ Memory pressure
               ┌──────▼───────┐
               │  TERMINATED   │ ◄── Process killed, no callback
               └──────────────┘
```

### Critical Lifecycle Events

| Event | iOS | Android | Action Required |
|-------|-----|---------|-----------------|
| **Launch** | `application:didFinishLaunching` | `onCreate` | Restore state, register services |
| **Foreground** | `applicationWillEnterForeground` | `onResume` | Refresh data, reconnect sockets |
| **Background** | `applicationDidEnterBackground` | `onPause` | Save state, close connections |
| **Memory Warning** | `applicationDidReceiveMemoryWarning` | `onTrimMemory` | Release caches, images, non-essential data |
| **Terminate** | Not guaranteed | `onDestroy` (not guaranteed) | **You may not get this.** Save state in background event. |

### React Native Lifecycle Handling

```typescript
import { AppState, AppStateStatus } from 'react-native';

function useAppLifecycle() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/active/) && nextState === 'background') {
        // App going to background — save state, pause operations
        saveAppState();
        pauseWebSocket();
        cancelPendingAnimations();
      }

      if (appState.current.match(/background/) && nextState === 'active') {
        // App returning to foreground — refresh data, reconnect
        refreshStaleData();
        reconnectWebSocket();
        checkForAppUpdate();
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);
}
```

### State Restoration

```typescript
// What to save and where
const STATE_STORAGE_MAP = {
  // Secure storage (Keychain/Keystore) — encrypted, survives reinstall on iOS
  authToken: 'secure',
  refreshToken: 'secure',
  biometricKeys: 'secure',

  // AsyncStorage / MMKV — fast, survives process death
  navigationState: 'local',
  userPreferences: 'local',
  draftContent: 'local',
  lastSyncTimestamp: 'local',

  // Memory only — lost on process death, that's OK
  scrollPosition: 'memory',
  expandedSections: 'memory',
  tooltipDismissals: 'memory',

  // Server — source of truth, fetch on restore
  userProfile: 'server',
  accountSettings: 'server',
  notificationPreferences: 'server',
};
```

### Crash Recovery

```typescript
import { ErrorUtils } from 'react-native';

// Global error handler — save state before crash
const previousHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    // Synchronously save critical state
    // AsyncStorage is async, so use MMKV or native module for sync write
    mmkv.set('crash_recovery_state', JSON.stringify({
      screen: getCurrentRoute(),
      timestamp: Date.now(),
      draftData: getDraftData(),
    }));
  }
  previousHandler(error, isFatal);
});

// On next launch, check for crash recovery
async function checkCrashRecovery() {
  const state = mmkv.getString('crash_recovery_state');
  if (state) {
    const { screen, draftData } = JSON.parse(state);
    // Navigate to crashed screen, restore draft
    mmkv.delete('crash_recovery_state');
  }
}
```

---

## 4. Navigation Patterns

### Pattern Comparison

| Pattern | When to Use | State Complexity | Deep Link Support |
|---------|-------------|------------------|-------------------|
| **Stack** | Linear flows (auth, checkout) | Low | Natural (push to target) |
| **Tab** | Top-level sections | Medium | Each tab has own stack |
| **Drawer** | Settings, secondary navigation | Medium | Less common for deep links |
| **Modal** | Confirmation, forms, details | Low | Stack on top of current context |
| **Nested (Stack + Tab)** | Most production apps | High | Must handle tab + stack state |

### Deep Linking Architecture

```
                 ┌─────────────────────────────┐
                 │        Incoming URL          │
                 │  myapp://product/123?ref=ad  │
                 └─────────────┬───────────────┘
                               │
                 ┌─────────────▼───────────────┐
                 │     App State Check          │
                 │  Running? Killed? Background? │
                 └─────────────┬───────────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                  │
        ┌─────▼─────┐  ┌──────▼──────┐  ┌───────▼───────┐
        │  KILLED    │  │  BACKGROUND │  │  FOREGROUND   │
        │  getInitial│  │  Linking    │  │  Linking      │
        │  URL()     │  │  event      │  │  event        │
        └─────┬─────┘  └──────┬──────┘  └───────┬───────┘
              │                │                  │
              └────────────────┼──────────────────┘
                               │
                 ┌─────────────▼───────────────┐
                 │      Auth Gate Check        │
                 │  Is user logged in?         │
                 │  NO → Save URL, go to login │
                 │  YES → Proceed to routing   │
                 └─────────────┬───────────────┘
                               │
                 ┌─────────────▼───────────────┐
                 │      Route Resolution       │
                 │  Parse URL → Screen + Params │
                 │  Build navigation state      │
                 │  Handle unknown routes       │
                 └─────────────────────────────┘
```

### Universal Links / App Links Setup

**iOS (apple-app-site-association):**
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAMID.com.example.myapp"],
        "components": [
          { "/": "/product/*", "comment": "Product deep links" },
          { "/": "/category/*", "comment": "Category deep links" },
          { "/": "/invite/*", "comment": "Invitation deep links" }
        ]
      }
    ]
  }
}
```

**Android (assetlinks.json):**
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.example.myapp",
    "sha256_cert_fingerprints": ["SHA256_OF_SIGNING_CERT"]
  }
}]
```

### Navigation State Persistence

```typescript
function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialState, setInitialState] = useState<NavigationState>();

  useEffect(() => {
    async function restoreState() {
      try {
        const savedState = await AsyncStorage.getItem('nav_state');
        if (savedState) {
          const state = JSON.parse(savedState);
          // Only restore if the state is less than 1 hour old
          if (Date.now() - state.timestamp < 3600000) {
            setInitialState(state.navigationState);
          }
        }
      } finally {
        setIsReady(true);
      }
    }
    restoreState();
  }, []);

  if (!isReady) return <SplashScreen />;

  return (
    <NavigationContainer
      initialState={initialState}
      onStateChange={(state) => {
        AsyncStorage.setItem('nav_state', JSON.stringify({
          navigationState: state,
          timestamp: Date.now(),
        }));
      }}
    >
      {/* screens */}
    </NavigationContainer>
  );
}
```

---

## 5. Push Notification Architecture

### Token Lifecycle

```
Device                      Your Server                  APNs / FCM
  │                              │                           │
  │── Register for push ────────►│                           │
  │◄── Push token ──────────────│                            │
  │                              │                           │
  │── Send token to server ────►│                            │
  │                        Store: {userId, token, platform,  │
  │                               device_id, created_at}     │
  │                              │                           │
  │   (Token rotates)            │                           │
  │── Send NEW token ──────────►│                            │
  │                        Update token, keep device_id      │
  │                              │                           │
  │                              │── Send notification ────►│
  │                              │◄── Delivery receipt ─────│
  │                              │                           │
  │◄────────────── Push delivered ──────────────────────────│
```

### Token Management

```typescript
// Server-side token management
interface PushToken {
  userId: string;
  deviceId: string; // Stable device identifier (NOT the push token)
  token: string;
  platform: 'ios' | 'android';
  createdAt: Date;
  lastUsedAt: Date;
  failureCount: number;
}

// When registering/updating a token
async function registerPushToken(userId: string, deviceId: string, token: string, platform: string) {
  await db.pushTokens.upsert({
    where: { userId_deviceId: { userId, deviceId } }, // One token per device per user
    update: { token, lastUsedAt: new Date(), failureCount: 0 },
    create: { userId, deviceId, token, platform, failureCount: 0 },
  });
}

// When sending a push — handle failures
async function sendPush(userId: string, notification: PushPayload) {
  const tokens = await db.pushTokens.findMany({ where: { userId } });

  for (const tokenRecord of tokens) {
    try {
      await sendToProvider(tokenRecord.token, tokenRecord.platform, notification);
      await db.pushTokens.update({
        where: { id: tokenRecord.id },
        data: { lastUsedAt: new Date(), failureCount: 0 },
      });
    } catch (error) {
      if (error.code === 'INVALID_TOKEN' || error.code === 'UNREGISTERED') {
        await db.pushTokens.delete({ where: { id: tokenRecord.id } });
      } else {
        await db.pushTokens.update({
          where: { id: tokenRecord.id },
          data: { failureCount: { increment: 1 } },
        });
      }
    }
  }
}
```

### Silent Push for Background Sync

```typescript
// React Native — handle silent push (data-only notification)
import messaging from '@react-native-firebase/messaging';

// Register background handler OUTSIDE of component (top-level)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // This runs even when app is killed (on Android) or suspended (on iOS)
  if (remoteMessage.data?.type === 'sync') {
    await syncLocalDatabase();
  }
  if (remoteMessage.data?.type === 'content_update') {
    await prefetchContent(remoteMessage.data.contentId);
  }
  // Do NOT trigger UI updates here — app may not be visible
});

// Foreground handler — inside component
messaging().onMessage(async (remoteMessage) => {
  // App is visible — show in-app notification banner
  showInAppNotification({
    title: remoteMessage.notification?.title,
    body: remoteMessage.notification?.body,
    onPress: () => navigate(remoteMessage.data?.deepLink),
  });
});
```

---

## 6. Performance Optimization

### Cold Start Optimization

| Phase | What Happens | Optimization |
|-------|-------------|-------------|
| **Process creation** | OS loads app binary | Reduce binary size (tree-shaking, asset optimization) |
| **Runtime init** | JS engine boots (Hermes/JSC) | Use Hermes (pre-compiled bytecode), minimize global scope |
| **Module loading** | require() chains execute | Lazy require heavy modules, inline requires |
| **Root render** | First component tree renders | Minimize first screen complexity, defer non-visible content |
| **Data fetch** | API calls for initial data | Pre-fetch during splash, cache previous session data |

### React Native Specific

```typescript
// Lazy loading heavy screens
const HeavyScreen = React.lazy(() => import('./HeavyScreen'));

// Inline requires for expensive modules
function handleExport() {
  const PDFGenerator = require('react-native-pdf-generator'); // Only loaded when needed
  PDFGenerator.generate(data);
}

// InteractionManager for deferred work
InteractionManager.runAfterInteractions(() => {
  // This runs after animations complete — does not block UI
  preloadImages(nextScreenImages);
  prefetchAPIData('/api/recommendations');
  initializeAnalytics();
});
```

### FlatList Performance Checklist

```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  // Layout optimization — eliminates measurement passes
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
  // Rendering optimization
  maxToRenderPerBatch={10} // Render 10 items per batch
  windowSize={5} // Keep 5 viewports of items in memory
  initialNumToRender={10} // Render 10 items initially
  updateCellsBatchingPeriod={50} // 50ms between batch renders
  removeClippedSubviews={true} // Detach off-screen views (Android)
  // Memoization
  renderItem={useCallback(({ item }) => <MemoizedItem item={item} />, [])}
/>

// Item component MUST be memoized
const MemoizedItem = React.memo(({ item }: { item: Item }) => (
  <View style={styles.item}>
    <FastImage source={{ uri: item.image }} style={styles.thumb} />
    <Text>{item.title}</Text>
  </View>
));
```

### Memory Management

```typescript
// Image cache limits
FastImage.clearMemoryCache(); // Clear memory cache when receiving memory warning
FastImage.clearDiskCache(); // Clear disk cache if storage is low

// Handle memory warnings
useEffect(() => {
  const subscription = AppState.addEventListener('memoryWarning', () => {
    FastImage.clearMemoryCache();
    clearNonEssentialCaches();
    reportMemoryWarning();
  });
  return () => subscription.remove();
}, []);
```

### Battery-Conscious Background Work

```typescript
// iOS: BGTaskScheduler equivalent via react-native-background-fetch
import BackgroundFetch from 'react-native-background-fetch';

BackgroundFetch.configure({
  minimumFetchInterval: 15, // Minutes (iOS minimum is 15)
  stopOnTerminate: false,
  startOnBoot: true,
  enableHeadless: true, // Android: run even if app is terminated
}, async (taskId) => {
  // Keep this FAST — you have ~30 seconds
  await syncPendingMutations();
  await prefetchCriticalData();
  BackgroundFetch.finish(taskId);
}, (taskId) => {
  // Task timed out
  BackgroundFetch.finish(taskId);
});
```

---

## 7. Native Module Integration

### React Native Bridge Pattern

```typescript
// TypeScript interface for native module
interface NativeCryptoModule {
  generateKeyPair(): Promise<{ publicKey: string; privateKey: string }>;
  encrypt(data: string, publicKey: string): Promise<string>;
  decrypt(data: string, privateKey: string): Promise<string>;
}

// Access via NativeModules
import { NativeModules, Platform } from 'react-native';

const CryptoModule: NativeCryptoModule = Platform.select({
  ios: NativeModules.RNCrypto,
  android: NativeModules.RNCryptoModule,
});

// Usage with error boundary
async function encryptSensitiveData(data: string): Promise<string> {
  if (!CryptoModule) {
    throw new Error('Native crypto module not available — ensure native build is up to date');
  }
  try {
    const { publicKey } = await CryptoModule.generateKeyPair();
    return await CryptoModule.encrypt(data, publicKey);
  } catch (error) {
    // Native module errors need platform-specific handling
    throw new Error(`Encryption failed: ${error.message}`);
  }
}
```

### Flutter Platform Channel Pattern

```dart
// Dart side
class NativeCrypto {
  static const platform = MethodChannel('com.example.app/crypto');

  static Future<String> encrypt(String data) async {
    try {
      final result = await platform.invokeMethod<String>('encrypt', {'data': data});
      return result!;
    } on PlatformException catch (e) {
      throw CryptoException('Native encryption failed: ${e.message}');
    }
  }
}

// Kotlin side (Android)
class CryptoPlugin : MethodCallHandler {
    override fun onMethodCall(call: MethodCall, result: Result) {
        when (call.method) {
            "encrypt" -> {
                val data = call.argument<String>("data")!!
                result.success(performEncryption(data))
            }
            else -> result.notImplemented()
        }
    }
}
```

---

## 8. App Store Patterns

### Submission Checklist

| Requirement | iOS | Android | Common Mistakes |
|------------|-----|---------|-----------------|
| **Privacy Policy** | Required (URL in App Store Connect) | Required (URL in Play Console) | Missing or outdated, not covering all data types |
| **Privacy Nutrition Label / Data Safety** | App Privacy section | Data Safety section | Not matching actual data collection |
| **Screenshots** | 6.5" and 5.5" required | Phone + 7" + 10" tablet | Using simulator frames, wrong locale |
| **Age Rating** | Content questionnaire | Content rating questionnaire | Underrating content, missing COPPA compliance |
| **In-App Purchases** | StoreKit 2 | Google Play Billing v6+ | Using non-platform payment for digital goods |
| **Permissions Justification** | Info.plist usage descriptions | `uses-permission` with rationale | Generic descriptions ("we need this") |
| **Target SDK** | Latest Xcode / SDK | `targetSdkVersion` (Play requires recent) | Falling behind, Play Store deadline enforcement |
| **App Tracking Transparency** | ATT framework (iOS 14.5+) | N/A (use consent frameworks) | Not showing ATT prompt, tracking before consent |

### In-App Purchase Architecture

```typescript
// React Native IAP with proper receipt validation
import {
  initConnection,
  getProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
} from 'react-native-iap';

const PRODUCT_IDS = Platform.select({
  ios: ['com.example.premium_monthly', 'com.example.premium_yearly'],
  android: ['premium_monthly', 'premium_yearly'],
});

async function initializeIAP() {
  await initConnection();

  // Listen for purchase updates (including pending/deferred)
  purchaseUpdatedListener(async (purchase) => {
    // CRITICAL: Validate receipt on YOUR server, not on device
    const isValid = await api.post('/validate-receipt', {
      receipt: purchase.transactionReceipt,
      platform: Platform.OS,
      productId: purchase.productId,
    });

    if (isValid) {
      // Grant entitlement
      await grantPremiumAccess(purchase.productId);
      // Acknowledge the purchase — REQUIRED on Android, good practice on iOS
      await finishTransaction({ purchase, isConsumable: false });
    }
  });
}
```

### ASO (App Store Optimization) Fields

```
Title: [30 chars iOS / 50 chars Android] — Primary keyword + brand
Subtitle: [30 chars iOS only] — Secondary value proposition
Short description: [80 chars Android only] — Key feature
Keywords: [100 chars iOS, comma-separated] — Research with App Annie/Sensor Tower
```

---

## 9. Anti-Patterns Table

| Anti-Pattern | Symptoms | Root Cause | Resolution |
|-------------|----------|------------|------------|
| God Component | 500+ line component, impossible to test | No separation of concerns | Extract hooks, split into container/presentational |
| Prop Drilling (5+ levels) | Props passed through components that don't use them | Missing context or state management | React Context, composition, or state library |
| Console.log in Production | Performance degradation, data leaks in logs | No build-time stripping | Babel plugin to strip in release, use structured logger |
| Splash Screen Cover-Up | 5+ second splash, hiding slow initialization | Eager loading everything at startup | Lazy init, defer non-critical, profile with systrace |
| One Massive Bundle | Slow app update downloads, high memory at startup | No code splitting or lazy loading | Dynamic imports, lazy screens, Hermes bytecode |
| Polling Instead of Push | Battery drain, unnecessary network traffic | No WebSocket or push infrastructure | WebSocket for real-time, push for background |
| Hardcoded API URL | Cannot switch environments, no staging testing | Missing build configuration | Environment config, `.env` per build variant |
| Ignoring Android Back | Back button does nothing or exits app | No back handler or navigation integration | `BackHandler` or navigation library handles it |
| HTTP in Production | App Transport Security blocks, insecure data | Mixed content, missing SSL | Enforce HTTPS everywhere, certificate pinning for sensitive apps |
| Ignoring Safe Areas | Content behind notch, status bar, home indicator | No SafeAreaView or edge-to-edge handling | SafeAreaView (RN), `WindowInsets` (Android), safe area (SwiftUI) |

---

## 10. Reference Implementation: Offline-First Data Sync Module

A complete, production-ready implementation of offline-first data sync with conflict resolution.

```typescript
// offline-sync.ts — Complete offline-first sync module

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { v4 as uuid } from 'uuid';

// --- Types ---

interface SyncableRecord {
  id: string;
  data: Record<string, unknown>;
  version: number;
  updatedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'deleted';
  localChanges: Array<{ field: string; oldValue: unknown; newValue: unknown; timestamp: number }>;
}

interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: string[];
  errors: string[];
}

// --- Sync Engine ---

class OfflineSyncEngine {
  private storageKey: string;
  private apiBase: string;
  private records: Map<string, SyncableRecord> = new Map();
  private syncInProgress = false;

  constructor(collection: string, apiBase: string) {
    this.storageKey = `sync:${collection}`;
    this.apiBase = `${apiBase}/${collection}`;
  }

  async initialize(): Promise<void> {
    const stored = await AsyncStorage.getItem(this.storageKey);
    if (stored) {
      const records: SyncableRecord[] = JSON.parse(stored);
      records.forEach(r => this.records.set(r.id, r));
    }

    // Start listening for connectivity changes
    NetInfo.addEventListener((state: NetInfoState) => {
      if (state.isConnected) {
        this.sync(); // Auto-sync when connectivity returns
      }
    });
  }

  // Read — always returns local data instantly
  getAll(): SyncableRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.syncStatus !== 'deleted');
  }

  getById(id: string): SyncableRecord | undefined {
    const record = this.records.get(id);
    return record?.syncStatus !== 'deleted' ? record : undefined;
  }

  // Write — local first, sync later
  async upsert(id: string, data: Record<string, unknown>): Promise<SyncableRecord> {
    const existing = this.records.get(id);
    const record: SyncableRecord = {
      id,
      data,
      version: existing ? existing.version : 0,
      updatedAt: Date.now(),
      syncStatus: 'pending',
      localChanges: existing
        ? Object.keys(data)
            .filter(k => JSON.stringify(data[k]) !== JSON.stringify(existing.data[k]))
            .map(k => ({
              field: k,
              oldValue: existing.data[k],
              newValue: data[k],
              timestamp: Date.now(),
            }))
        : [],
    };
    this.records.set(id, record);
    await this.persist();
    this.sync(); // Attempt immediate sync
    return record;
  }

  async delete(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      record.syncStatus = 'deleted';
      record.updatedAt = Date.now();
      await this.persist();
      this.sync();
    }
  }

  // Sync — push local changes, pull remote updates
  async sync(): Promise<SyncResult | null> {
    if (this.syncInProgress) return null;

    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) return null;

    this.syncInProgress = true;
    const result: SyncResult = { pushed: 0, pulled: 0, conflicts: [], errors: [] };

    try {
      // Push local changes
      const pending = Array.from(this.records.values()).filter(r => r.syncStatus === 'pending');
      for (const record of pending) {
        try {
          const response = await fetch(`${this.apiBase}/${record.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: record.data, version: record.version }),
          });

          if (response.ok) {
            const serverRecord = await response.json();
            record.version = serverRecord.version;
            record.syncStatus = 'synced';
            record.localChanges = [];
            result.pushed++;
          } else if (response.status === 409) {
            record.syncStatus = 'conflict';
            result.conflicts.push(record.id);
          }
        } catch {
          result.errors.push(record.id);
        }
      }

      // Push deletes
      const deleted = Array.from(this.records.values()).filter(r => r.syncStatus === 'deleted');
      for (const record of deleted) {
        try {
          await fetch(`${this.apiBase}/${record.id}`, { method: 'DELETE' });
          this.records.delete(record.id);
          result.pushed++;
        } catch {
          result.errors.push(record.id);
        }
      }

      // Pull remote updates
      const lastSync = await AsyncStorage.getItem(`${this.storageKey}:lastSync`);
      const since = lastSync ? parseInt(lastSync) : 0;
      const response = await fetch(`${this.apiBase}?since=${since}`);
      if (response.ok) {
        const remoteRecords: SyncableRecord[] = await response.json();
        for (const remote of remoteRecords) {
          const local = this.records.get(remote.id);
          if (!local || (local.syncStatus === 'synced' && remote.version > local.version)) {
            this.records.set(remote.id, { ...remote, syncStatus: 'synced', localChanges: [] });
            result.pulled++;
          }
        }
      }

      await AsyncStorage.setItem(`${this.storageKey}:lastSync`, Date.now().toString());
      await this.persist();
    } finally {
      this.syncInProgress = false;
    }

    return result;
  }

  // Conflict resolution
  resolveConflict(id: string, resolution: 'local' | 'remote' | 'merge', mergedData?: Record<string, unknown>) {
    const record = this.records.get(id);
    if (!record || record.syncStatus !== 'conflict') return;

    if (resolution === 'local') {
      record.syncStatus = 'pending'; // Re-push local version
    } else if (resolution === 'remote') {
      // Fetch and apply remote version
      record.syncStatus = 'synced';
      record.localChanges = [];
    } else if (resolution === 'merge' && mergedData) {
      record.data = mergedData;
      record.syncStatus = 'pending';
      record.localChanges = [];
    }

    this.persist();
  }

  private async persist(): Promise<void> {
    const records = Array.from(this.records.values());
    await AsyncStorage.setItem(this.storageKey, JSON.stringify(records));
  }
}

export { OfflineSyncEngine, SyncableRecord, SyncResult };
```

### Usage

```typescript
// Initialize once at app startup
const taskSync = new OfflineSyncEngine('tasks', 'https://api.example.com');
await taskSync.initialize();

// Read — instant, from local cache
const tasks = taskSync.getAll();

// Write — saves locally, syncs when possible
await taskSync.upsert('task-1', { title: 'New task', completed: false });

// Works offline — queued for sync
await taskSync.upsert('task-2', { title: 'Offline task', completed: false });

// Conflicts surface for user resolution
const conflicts = tasks.filter(t => t.syncStatus === 'conflict');
conflicts.forEach(t => {
  // Show UI for conflict resolution
  taskSync.resolveConflict(t.id, 'local');
});
```
