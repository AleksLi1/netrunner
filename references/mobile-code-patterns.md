# Mobile App Development Code Patterns

## Purpose

This reference provides concrete correct vs. incorrect code patterns for common mobile development bugs. These are not checklists — they are examples that activate expert reasoning about what production-quality mobile code looks like.

When this reference is active, the agent should use these patterns as diagnostic templates: "Does the code I'm reading/writing match the CORRECT pattern, or does it resemble the WRONG pattern?"

---

## Pattern 1: AsyncStorage in Render

Blocking the main thread with synchronous or poorly-timed storage reads during component rendering.

**WRONG — reading storage during render:**
```typescript
// React Native — storage read blocks rendering
function ProfileScreen() {
  const [user, setUser] = useState(null);

  // This fires on EVERY render, no caching, no loading state
  AsyncStorage.getItem('user').then(data => {
    setUser(JSON.parse(data));
  });

  return <Text>{user?.name}</Text>; // Flickers, re-renders infinitely
}
```

**CORRECT — storage read in effect with loading state:**
```typescript
function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem('user').then(data => {
      if (!cancelled && data) {
        setUser(JSON.parse(data));
      }
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <ProfileSkeleton />;
  return <Text>{user?.name}</Text>;
}
```

**Why this matters:** Reading storage outside `useEffect` causes infinite re-render loops. The component renders, triggers a read, updates state, re-renders, triggers another read. On low-end devices this freezes the UI. The correct pattern reads once on mount, handles cancellation, and shows a loading state.

---

## Pattern 2: Missing Keyboard Avoidance

Inputs hidden behind the keyboard when the user taps a text field, especially on smaller screens.

**WRONG — no keyboard handling:**
```typescript
// Input at the bottom of the screen disappears behind keyboard
function LoginScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16 }}>
      <TextInput placeholder="Email" />
      <TextInput placeholder="Password" secureTextEntry />
      <Button title="Login" onPress={handleLogin} />
    </View>
  );
}
```

**CORRECT — keyboard-aware layout:**
```typescript
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

function LoginScreen() {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput placeholder="Email" />
        <TextInput placeholder="Password" secureTextEntry />
        <Button title="Login" onPress={handleLogin} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

**Why this matters:** On iOS and Android, the virtual keyboard covers the bottom third of the screen. Without `KeyboardAvoidingView`, users cannot see what they are typing. `behavior` differs per platform. `keyboardShouldPersistTaps="handled"` prevents the keyboard from dismissing when tapping buttons.

**Swift equivalent:**
```swift
// In SwiftUI — keyboard avoidance is automatic since iOS 14
// But for UIKit:
NotificationCenter.default.addObserver(
    self, selector: #selector(keyboardWillShow),
    name: UIResponder.keyboardWillShowNotification, object: nil
)

@objc func keyboardWillShow(_ notification: Notification) {
    guard let keyboardFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey]
        as? CGRect else { return }
    scrollView.contentInset.bottom = keyboardFrame.height
}
```

---

## Pattern 3: Unthrottled Bridge Calls (React Native)

Flooding the React Native bridge with rapid-fire messages, causing UI jank and dropped frames.

**WRONG — sending bridge messages every frame:**
```typescript
// Scroll handler fires 60+ times per second, each call crosses the bridge
function AnimatedHeader({ scrollY }: { scrollY: number }) {
  const [headerHeight, setHeaderHeight] = useState(200);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    // This crosses the bridge on EVERY scroll frame
    setHeaderHeight(Math.max(60, 200 - y));
  };

  return (
    <View style={{ height: headerHeight }}>
      <FlatList onScroll={handleScroll} scrollEventThrottle={1} />
    </View>
  );
}
```

**CORRECT — native driver animation, no bridge crossing:**
```typescript
import Animated from 'react-native-reanimated';

function AnimatedHeader() {
  const scrollY = useSharedValue(0);

  const headerStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [0, 140], [200, 60], Extrapolation.CLAMP),
  }));

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y; // Runs on UI thread, no bridge
    },
  });

  return (
    <Animated.View style={headerStyle}>
      <Animated.FlatList onScroll={scrollHandler} scrollEventThrottle={16} />
    </Animated.View>
  );
}
```

**Why this matters:** The React Native bridge serializes every message as JSON. At 60fps, scroll-driven state updates generate 60 bridge crossings per second, each causing a re-render. Reanimated runs animations on the UI thread directly, bypassing the bridge entirely. This is the difference between 15fps jank and butter-smooth 60fps.

---

## Pattern 4: Missing Deep Link Handling

App does not handle incoming URLs, breaking shared links and marketing campaigns.

**WRONG — no deep link routing:**
```typescript
// App.tsx — no link handling at all
function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Product" component={ProductScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
// User taps myapp://product/123 — nothing happens
```

**CORRECT — full deep link handling with fallback:**
```typescript
function App() {
  const linking = {
    prefixes: ['myapp://', 'https://myapp.com'],
    config: {
      screens: {
        Home: '',
        Product: 'product/:id',
        Category: 'category/:slug',
        NotFound: '*',
      },
    },
    async getInitialURL() {
      // Handle URL that opened the app from killed state
      const url = await Linking.getInitialURL();
      if (url) return url;
      // Handle push notification deep link
      const notification = await getInitialNotification();
      return notification?.data?.deepLink;
    },
  };

  return (
    <NavigationContainer
      linking={linking}
      fallback={<SplashScreen />}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Product" component={ProductScreen} />
        <Stack.Screen name="Category" component={CategoryScreen} />
        <Stack.Screen name="NotFound" component={NotFoundScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

**Why this matters:** Without deep link handling, shared links, push notification taps, and marketing URLs all fail silently. The correct pattern handles: URL prefixes for both custom scheme and universal links, a wildcard fallback screen, initial URL from killed state, and push notification payloads. Missing any of these means some users get a broken experience.

**Kotlin equivalent (Jetpack Compose):**
```kotlin
// AndroidManifest.xml intent filter
// <intent-filter android:autoVerify="true">
//   <action android:name="android.intent.action.VIEW" />
//   <data android:scheme="https" android:host="myapp.com" android:pathPrefix="/product" />
// </intent-filter>

// NavHost with deep link
NavHost(navController, startDestination = "home") {
    composable("home") { HomeScreen() }
    composable(
        "product/{id}",
        deepLinks = listOf(navDeepLink { uriPattern = "https://myapp.com/product/{id}" })
    ) { backStackEntry ->
        ProductScreen(productId = backStackEntry.arguments?.getString("id"))
    }
}
```

---

## Pattern 5: No Offline Fallback

White screen or crash when the device has no network connection.

**WRONG — fetch-only, no cache:**
```typescript
function ProductListScreen() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('https://api.example.com/products')
      .then(res => res.json())
      .then(setProducts)
      .catch(setError);
  }, []);

  if (error) return <Text>Something went wrong</Text>; // Useless in airplane mode
  return <FlatList data={products} renderItem={renderProduct} />;
}
```

**CORRECT — cache-first with stale-while-revalidate:**
```typescript
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function fetchWithCache<T>(key: string, url: string): Promise<{ data: T; stale: boolean }> {
  // Always try cache first
  const cached = await AsyncStorage.getItem(key);

  const isConnected = (await NetInfo.fetch()).isConnected;
  if (!isConnected) {
    if (cached) return { data: JSON.parse(cached), stale: true };
    throw new Error('No network and no cached data');
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    await AsyncStorage.setItem(key, JSON.stringify(data)); // Update cache
    return { data, stale: false };
  } catch {
    if (cached) return { data: JSON.parse(cached), stale: true };
    throw new Error('Network error and no cached data');
  }
}

function ProductListScreen() {
  const [products, setProducts] = useState([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithCache('products', 'https://api.example.com/products')
      .then(({ data, stale }) => { setProducts(data); setStale(stale); })
      .catch(() => { /* show empty state */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ProductListSkeleton />;
  return (
    <>
      {stale && <Banner text="Showing cached data — connect to refresh" />}
      <FlatList data={products} renderItem={renderProduct} />
    </>
  );
}
```

**Why this matters:** Mobile users lose connectivity constantly — elevators, subways, rural areas, airplane mode. A fetch-only approach shows a blank screen or generic error. Cache-first shows the last known data with a staleness indicator. Users can still browse and work; the app syncs when connectivity returns.

---

## Pattern 6: FlatList Without keyExtractor

Missing or incorrect keys cause React to destroy and recreate items on every render, killing performance and causing visual glitches.

**WRONG — index as key or missing keyExtractor:**
```typescript
// Using array index — breaks on reorder, delete, or insert
<FlatList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
  keyExtractor={(item, index) => index.toString()} // WRONG
/>

// Or worse — no keyExtractor at all (uses index internally)
<FlatList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
/>
```

**CORRECT — stable unique identifier:**
```typescript
<FlatList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
  keyExtractor={(item) => item.id} // Stable, unique identifier
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
  maxToRenderPerBatch={10}
  windowSize={5}
  removeClippedSubviews={true}
/>
```

**Why this matters:** When React reconciles a list, it uses keys to match old items to new items. Index-based keys break when items are reordered, deleted, or inserted — React sees "index 3 changed" and destroys/recreates the component instead of moving it. With stable IDs, React correctly moves, adds, or removes only the changed items. `getItemLayout` eliminates measurement passes. `removeClippedSubviews` frees off-screen memory.

---

## Pattern 7: Missing Permission Handling

Crashing or silently failing when the user denies a runtime permission.

**WRONG — assume permission is granted:**
```typescript
// Crashes if permission denied
async function takePhoto() {
  const result = await launchCamera({ mediaType: 'photo' });
  uploadPhoto(result.assets[0].uri); // Crash: result.assets is undefined when denied
}
```

**CORRECT — full permission lifecycle:**
```typescript
import { check, request, PERMISSIONS, RESULTS, openSettings } from 'react-native-permissions';
import { Platform, Alert } from 'react-native';

async function takePhoto() {
  const permission = Platform.select({
    ios: PERMISSIONS.IOS.CAMERA,
    android: PERMISSIONS.ANDROID.CAMERA,
  });

  let status = await check(permission);

  if (status === RESULTS.DENIED) {
    status = await request(permission);
  }

  if (status === RESULTS.BLOCKED) {
    Alert.alert(
      'Camera Permission Required',
      'Please enable camera access in Settings to take photos.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: openSettings },
      ]
    );
    return;
  }

  if (status !== RESULTS.GRANTED) return;

  const result = await launchCamera({ mediaType: 'photo' });
  if (result.assets?.[0]?.uri) {
    uploadPhoto(result.assets[0].uri);
  }
}
```

**Why this matters:** Android and iOS both require runtime permission requests. Users can deny, grant once, or permanently block permissions. The wrong pattern crashes on denial. The correct pattern checks status, requests if needed, guides the user to Settings if blocked, and handles every state. Also note optional chaining on `result.assets` — the camera can be dismissed without taking a photo.

**Kotlin equivalent:**
```kotlin
val cameraLauncher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.TakePicture()
) { success -> if (success) uploadPhoto(photoUri) }

val permissionLauncher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.RequestPermission()
) { granted ->
    if (granted) cameraLauncher.launch(photoUri)
    else showPermissionRationale()
}

fun takePhoto() {
    when (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)) {
        PackageManager.PERMISSION_GRANTED -> cameraLauncher.launch(photoUri)
        else -> permissionLauncher.launch(Manifest.permission.CAMERA)
    }
}
```

---

## Pattern 8: Image Caching Absent

Re-downloading images on every render, wasting bandwidth and causing visible loading flicker.

**WRONG — standard Image with URL:**
```typescript
// Downloads the image every time the component mounts
function Avatar({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.avatar} />;
}
// In a FlatList of 100 users, this downloads 100 images on every scroll back
```

**CORRECT — cached image with placeholder:**
```typescript
import FastImage from 'react-native-fast-image';

function Avatar({ uri }: { uri: string }) {
  return (
    <FastImage
      source={{
        uri,
        priority: FastImage.priority.normal,
        cache: FastImage.cacheControl.immutable, // Cache permanently if URL is content-addressed
      }}
      style={styles.avatar}
      resizeMode={FastImage.resizeMode.cover}
      defaultSource={require('./avatar-placeholder.png')} // Instant placeholder
    />
  );
}

// Preload critical images
FastImage.preload([
  { uri: 'https://example.com/header.jpg' },
  { uri: 'https://example.com/logo.png' },
]);
```

**Why this matters:** React Native's built-in `Image` component has no disk cache on Android. Every mount triggers a network request. In a scrolling list, this means re-downloading the same avatar 10 times as the user scrolls back and forth. FastImage uses SDWebImage (iOS) and Glide (Android) under the hood — battle-tested native caching with disk + memory tiers, progressive loading, and preloading.

---

## Pattern 9: Unhandled App State Changes

Data loss or stale state when the app moves between foreground, background, and killed states.

**WRONG — no lifecycle handling:**
```typescript
function DraftEditor() {
  const [draft, setDraft] = useState('');

  // User types 500 words, switches to another app, OS kills this one
  // Draft is gone forever

  return <TextInput value={draft} onChangeText={setDraft} multiline />;
}
```

**CORRECT — auto-save on state change:**
```typescript
import { AppState, AppStateStatus } from 'react-native';

function DraftEditor({ draftId }: { draftId: string }) {
  const [draft, setDraft] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Load saved draft on mount
  useEffect(() => {
    AsyncStorage.getItem(`draft:${draftId}`).then(saved => {
      if (saved) setDraft(saved);
    });
  }, [draftId]);

  // Auto-save when app goes to background
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState.match(/inactive|background/)) {
        AsyncStorage.setItem(`draft:${draftId}`, draftRef.current);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [draftId]);

  // Also auto-save periodically and on unmount
  useEffect(() => {
    const interval = setInterval(() => {
      AsyncStorage.setItem(`draft:${draftId}`, draftRef.current);
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(interval);
      AsyncStorage.setItem(`draft:${draftId}`, draftRef.current);
    };
  }, [draftId]);

  return <TextInput value={draft} onChangeText={setDraft} multiline />;
}
```

**Why this matters:** Mobile apps are killed without warning. The OS reclaims memory by killing background apps — no `onDestroy`, no callback, just gone. Any unsaved state is lost. The correct pattern saves on three triggers: background transition (most reliable), periodic interval (catches long editing sessions), and unmount (catches in-app navigation). The ref avoids stale closures in the interval.

---

## Pattern 10: Missing Loading and Error States

No visual feedback during network requests, leaving users confused about whether anything is happening.

**WRONG — binary loaded/not-loaded:**
```typescript
function OrderHistory() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetch('/api/orders').then(r => r.json()).then(setOrders);
  }, []);

  // Before data loads: empty screen. User thinks app is broken.
  // On error: empty screen forever. No way to retry.
  return <FlatList data={orders} renderItem={renderOrder} />;
}
```

**CORRECT — explicit state machine:**
```typescript
type State<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; retry: () => void };

function OrderHistory() {
  const [state, setState] = useState<State<Order[]>>({ status: 'idle' });

  const loadOrders = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/orders');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setState({ status: 'success', data });
    } catch (e) {
      setState({ status: 'error', error: e.message, retry: loadOrders });
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  switch (state.status) {
    case 'idle':
    case 'loading':
      return <OrderListSkeleton />;
    case 'error':
      return (
        <ErrorScreen
          message={state.error}
          onRetry={state.retry}
        />
      );
    case 'success':
      if (state.data.length === 0) return <EmptyState message="No orders yet" />;
      return <FlatList data={state.data} renderItem={renderOrder} />;
  }
}
```

**Why this matters:** Mobile networks are slow and unreliable. Users need to see: (1) something is happening (skeleton/spinner), (2) what went wrong (error message), (3) how to fix it (retry button), and (4) if there is simply no data (empty state). The wrong pattern shows nothing during loading and nothing on error — the user sees a blank screen and force-quits the app.

---

## Pattern 11: Hardcoded Dimensions

Using fixed pixel values that break on different screen sizes and densities.

**WRONG — hardcoded pixels:**
```typescript
function CardComponent() {
  return (
    <View style={{ width: 375, height: 200, margin: 10 }}>
      <Text style={{ fontSize: 16 }}>Title</Text>
      <Image source={img} style={{ width: 355, height: 150 }} />
    </View>
  );
}
// Width 375 = iPhone 8 screen width. Overflows on smaller screens, wastes space on tablets.
```

**CORRECT — responsive dimensions:**
```typescript
import { useWindowDimensions, StyleSheet } from 'react-native';

function CardComponent() {
  const { width } = useWindowDimensions(); // Updates on rotation/resize

  return (
    <View style={[styles.card, { width: width - 32 }]}>
      <Text style={styles.title}>Title</Text>
      <Image
        source={img}
        style={[styles.image, { width: width - 48, height: (width - 48) * 0.42 }]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  title: { fontSize: 16, padding: 12 },
  image: { alignSelf: 'center' },
});
```

**Why this matters:** Android alone has thousands of screen sizes. iPhone screens range from 320pt (SE) to 430pt (Pro Max). Tablets double the width. Hardcoded pixel values either overflow small screens (clipping content) or waste space on large ones. `useWindowDimensions` responds to rotation and multitasking split views. Use percentage-based widths, flex layout, and aspect ratios — never absolute pixel values for layout containers.

**Flutter equivalent:**
```dart
// WRONG
Container(width: 375, height: 200)

// CORRECT
LayoutBuilder(
  builder: (context, constraints) => Container(
    width: constraints.maxWidth - 32,
    height: (constraints.maxWidth - 32) * 0.42,
  ),
)
```

---

## Pattern 12: Missing Accessibility

No screen reader support, missing semantic markup, and inaccessible interactive elements.

**WRONG — no accessibility props:**
```typescript
function ProductCard({ product, onBuy }) {
  return (
    <View>
      <Image source={{ uri: product.image }} style={styles.image} />
      <Text>{product.name}</Text>
      <Text>${product.price}</Text>
      <TouchableOpacity onPress={onBuy}>
        <View style={styles.buyButton}>
          <Text style={styles.buyText}>Buy</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
// Screen reader announces: "Image", "Running Shoes", "59.99", "Buy"
// No context: Buy WHAT for HOW MUCH?
```

**CORRECT — full accessibility support:**
```typescript
function ProductCard({ product, onBuy }) {
  return (
    <View
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={`${product.name}, $${product.price}`}
    >
      <Image
        source={{ uri: product.image }}
        style={styles.image}
        accessibilityLabel={product.imageDescription}
      />
      <Text accessibilityRole="header">{product.name}</Text>
      <Text>${product.price}</Text>
      <TouchableOpacity
        onPress={onBuy}
        accessibilityRole="button"
        accessibilityLabel={`Buy ${product.name} for $${product.price}`}
        accessibilityHint="Double tap to add to cart"
      >
        <View style={styles.buyButton}>
          <Text style={styles.buyText}>Buy</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
```

**Why this matters:** Approximately 15% of the world's population has some form of disability. Screen readers (VoiceOver on iOS, TalkBack on Android) rely on accessibility properties to convey meaning. Without them, the user hears disconnected fragments. With them, the user hears "Buy Running Shoes for $59.99, double tap to add to cart." Both Apple and Google audit accessibility in app reviews, and WCAG compliance is a legal requirement in many jurisdictions.

**SwiftUI equivalent:**
```swift
// SwiftUI has good defaults, but custom views need explicit labels
Button(action: buyAction) {
    Text("Buy")
}
.accessibilityLabel("Buy \(product.name) for $\(product.price)")
.accessibilityHint("Double tap to add to cart")

Image(product.imageName)
    .accessibilityLabel(product.imageDescription)
```
