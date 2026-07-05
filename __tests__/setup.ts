// Mock expo-navigation-bar (native module)
jest.mock("expo-navigation-bar", () => ({
  setBehaviorAsync: jest.fn().mockResolvedValue(undefined),
  setVisibilityAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-status-bar
jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

// Mock expo-splash-screen
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

// Mock expo-font — @expo/vector-icons gọi Font.isLoaded/isLoading khi render icon.
jest.mock("expo-font", () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

// Mock react-native-reanimated
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);

// Mock react-native-safe-area-context — màn hình dùng useSafeAreaInsets, nếu không
// có SafeAreaProvider sẽ throw "No safe area value available". (Mock inline vì file
// .tsx của lib không nằm trong transformIgnorePatterns whitelist → không transpile được.)
jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const React = require("react");
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: ({ children }: any) => React.createElement(React.Fragment, null, children),
    SafeAreaInsetsContext: React.createContext(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  };
});

// Mock react-native-url-polyfill
jest.mock("react-native-url-polyfill/auto", () => {});

// Mock expo-audio (native module) — màn create-rule dùng useVoiceInput (ghi âm mobile).
jest.mock("expo-audio", () => ({
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: null,
  })),
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  },
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  RecordingPresets: { HIGH_QUALITY: {} },
}));

// Mock expo-file-system/legacy (đọc file ghi âm ra base64 trong lib/voiceInput).
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  EncodingType: { Base64: "base64" },
}));

// Mock AsyncStorage (native module) — ThemeContext/lib/supabase import nó nên
// thiếu mock này khiến mọi test suite crash "AsyncStorage is null".
jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Silence console.log in tests (remove if you want to see logs)
global.console.log = jest.fn();
