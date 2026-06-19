module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Reanimated 4: plugin worklet đã chuyển sang react-native-worklets/plugin
    // (react-native-reanimated/plugin cũ gây crash/màn trắng trên native). Phải để CUỐI.
    plugins: ["react-native-worklets/plugin"],
  };
};
