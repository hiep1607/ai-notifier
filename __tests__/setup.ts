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

// Mock expo-font
jest.mock("expo-font", () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(),
}));

// Mock react-native-reanimated
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);

// Mock react-native-url-polyfill
jest.mock("react-native-url-polyfill/auto", () => {});

// Silence console.log in tests (remove if you want to see logs)
global.console.log = jest.fn();
