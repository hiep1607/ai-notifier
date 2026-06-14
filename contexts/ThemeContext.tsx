import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DARK_COLORS, LIGHT_COLORS, type AppColors } from "../lib/theme";

interface ThemeContextType {
  colors: AppColors;
  isDark: boolean;
  setDarkMode: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: DARK_COLORS,
  isDark: true,
  setDarkMode: () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("@settings").then((raw) => {
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.darkMode === "boolean") {
          setIsDark(parsed.darkMode);
        }
      }
    });
  }, []);

  const setDarkMode = async (dark: boolean) => {
    setIsDark(dark);
    const raw = await AsyncStorage.getItem("@settings");
    const current = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem("@settings", JSON.stringify({ ...current, darkMode: dark }));
  };

  return (
    <ThemeContext.Provider value={{ colors: isDark ? DARK_COLORS : LIGHT_COLORS, isDark, setDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
