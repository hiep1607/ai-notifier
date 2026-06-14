import React, { useEffect, useMemo, useState } from "react";

import { ScrollView, StyleSheet, Text, View } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { confirmAsync, alertMessage } from "../../lib/dialog";
import { SCREEN, RADIUS, type AppColors } from "../../lib/theme";
import { useTheme } from "../../contexts/ThemeContext";
import SettingRow from "../../components/SettingRow";

const SETTINGS_KEY = "@settings";

interface Settings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  aiSummaryEnabled: boolean;
  importantAlertsEnabled: boolean;
  darkMode: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: false,
  aiSummaryEnabled: true,
  importantAlertsEnabled: true,
  darkMode: true,
};

export default function SettingsScreen() {
  const { colors, setDarkMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const loadSettings = async () => {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    };
    loadSettings();
  }, []);

  const updateSetting = async (key: keyof Settings, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));

    if (key === "darkMode") {
      setDarkMode(value);
    }
  };

  const handleLogout = async () => {
    const ok = await confirmAsync("Đăng xuất", "Bạn có chắc muốn đăng xuất?");
    if (!ok) return;
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleClearCache = async () => {
    const ok = await confirmAsync("Xóa cache", "Xóa dữ liệu tạm của ứng dụng? (không ảnh hưởng tài khoản)");
    if (!ok) return;
    await AsyncStorage.removeItem(SETTINGS_KEY);
    setSettings(DEFAULT_SETTINGS);
    setDarkMode(true);
    alertMessage("Đã xóa", "Cache ứng dụng đã được xóa.");
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Cài đặt</Text>
        <Text style={styles.subtitle}>Quản lý ứng dụng AI Notifier</Text>
      </View>

      {/* TÀI KHOẢN */}
      <Text style={styles.sectionLabel}>Tài khoản</Text>
      <View style={styles.card}>
        <SettingRow
          icon="person-outline"
          label="Thông tin tài khoản"
          onPress={() => router.push("/profile")}
          last
        />
      </View>

      {/* THÔNG BÁO */}
      <Text style={styles.sectionLabel}>Thông báo</Text>
      <View style={styles.card}>
        <SettingRow
          icon="notifications-outline"
          label="Bật thông báo"
          value={settings.notificationsEnabled}
          onValueChange={(v) => updateSetting("notificationsEnabled", v)}
        />
        <SettingRow
          icon="volume-high-outline"
          label="Âm thanh"
          value={settings.soundEnabled}
          onValueChange={(v) => updateSetting("soundEnabled", v)}
        />
        <SettingRow
          icon="phone-portrait-outline"
          label="Rung"
          value={settings.vibrationEnabled}
          onValueChange={(v) => updateSetting("vibrationEnabled", v)}
          last
        />
      </View>

      {/* AI */}
      <Text style={styles.sectionLabel}>AI</Text>
      <View style={styles.card}>
        <SettingRow
          icon="sparkles-outline"
          label="Tóm tắt bằng AI"
          value={settings.aiSummaryEnabled}
          onValueChange={(v) => updateSetting("aiSummaryEnabled", v)}
        />
        <SettingRow
          icon="alert-circle-outline"
          label="Cảnh báo quan trọng"
          value={settings.importantAlertsEnabled}
          onValueChange={(v) => updateSetting("importantAlertsEnabled", v)}
          last
        />
      </View>

      {/* GIAO DIỆN */}
      <Text style={styles.sectionLabel}>Giao diện</Text>
      <View style={styles.card}>
        <SettingRow
          icon="moon-outline"
          label="Chế độ tối"
          value={settings.darkMode}
          onValueChange={(v) => updateSetting("darkMode", v)}
          last
        />
      </View>

      {/* KHÁC */}
      <Text style={styles.sectionLabel}>Khác</Text>
      <View style={styles.card}>
        <SettingRow icon="information-circle-outline" label="Phiên bản" rightText="v1.0.0" />
        <SettingRow icon="trash-outline" label="Xóa cache" onPress={handleClearCache} iconColor={colors.warning} />
        <SettingRow icon="log-out-outline" label="Đăng xuất" onPress={handleLogout} danger last />
      </View>
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      paddingTop: SCREEN.paddingTop,
      paddingHorizontal: SCREEN.paddingHorizontal,
    },
    header: {
      marginBottom: 24,
    },
    title: {
      color: C.text,
      fontSize: 32,
      fontWeight: "bold",
    },
    subtitle: {
      color: C.subText,
      marginTop: 6,
      fontSize: 14,
    },
    sectionLabel: {
      color: C.muted,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 10,
      marginLeft: 4,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 16,
      marginBottom: 24,
    },
  });
}
