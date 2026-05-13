import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as NavigationBar from "expo-navigation-bar";
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  NavigationBar.setBehaviorAsync(
  "overlay-swipe"
);

NavigationBar.setVisibilityAsync(
  "hidden"
);
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack>
  <Stack.Screen
    name="(tabs)"
    options={{ headerShown: false }}
  />

  <Stack.Screen
    name="rules"
    options={{ headerShown: false }}
  />

  <Stack.Screen
    name="create-rule"
    options={{ headerShown: false }}
  />

  <Stack.Screen
    name="ai-chat"
    options={{ headerShown: false }}
  />

  <Stack.Screen
    name="manual-rule"
    options={{ headerShown: false }}
  />

  <Stack.Screen
    name="ai-summary"
    options={{ headerShown: false }}
  />

  <Stack.Screen
    name="notification-detail"
    options={{ headerShown: false }}
  />

  <Stack.Screen
    name="modal"
    options={{
      presentation: "modal",
      title: "Modal",
    }}
  />
</Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
  

}
