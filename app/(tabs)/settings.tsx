import React, { useEffect, useState } from "react";

import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const SETTINGS_KEY = "@settings";

const COLORS = {
  background: "#081120",
  card: "#101B35",
  primary: "#4DA6FF",
  text: "#FFFFFF",
  subText: "#8FA1C7",
  border: "#1E2B4A",
};

interface Settings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  aiSummaryEnabled: boolean;
  importantAlertsEnabled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: false,
  aiSummaryEnabled: true,
  importantAlertsEnabled: true,
};

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.replace("/login");
};

export default function SettingsScreen() {
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
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Cài đặt</Text>

        <Text style={styles.subtitle}>
          Quản lý ứng dụng AI Notifier
        </Text>
      </View>

      {/* NOTIFICATIONS */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🔔 Thông báo</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingText}>Bật thông báo</Text>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={(v) => updateSetting("notificationsEnabled", v)}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingText}>Âm thanh</Text>
          <Switch
            value={settings.soundEnabled}
            onValueChange={(v) => updateSetting("soundEnabled", v)}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingText}>Rung</Text>
          <Switch
            value={settings.vibrationEnabled}
            onValueChange={(v) => updateSetting("vibrationEnabled", v)}
          />
        </View>
      </View>

      {/* AI SETTINGS */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🤖 Cài đặt AI</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingText}>Tóm tắt AI</Text>
          <Switch
            value={settings.aiSummaryEnabled}
            onValueChange={(v) => updateSetting("aiSummaryEnabled", v)}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingText}>Thông báo quan trọng</Text>
          <Switch
            value={settings.importantAlertsEnabled}
            onValueChange={(v) => updateSetting("importantAlertsEnabled", v)}
          />
        </View>
      </View>

      {/* ACCOUNT */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>👤 Tài khoản</Text>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push("/profile")}
        >
          <Ionicons name="person-outline" size={22} color={COLORS.primary} />
          <Text style={styles.linkText}>Hồ sơ cá nhân</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subText} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
          <Text style={[styles.linkText, { color: "#FF6B6B" }]}>
            Đăng xuất
          </Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subText} />
        </TouchableOpacity>
      </View>

      {/* ABOUT */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ℹ️ Thông tin</Text>

        <TouchableOpacity style={styles.linkRow}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={COLORS.primary}
          />
          <Text style={styles.linkText}>Phiên bản ứng dụng</Text>
          <Text style={styles.version}>v1.0.0</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow}>
          <Ionicons
            name="shield-checkmark-outline"
            size={22}
            color={COLORS.primary}
          />
          <Text style={styles.linkText}>Chính sách bảo mật</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subText} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow}>
          <Ionicons name="logo-github" size={22} color={COLORS.primary} />
          <Text style={styles.linkText}>Github</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subText} />
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 70,
    paddingHorizontal: 20,
  },

  header: {
    marginBottom: 28,
  },

  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "bold",
  },

  subtitle: {
    color: COLORS.subText,
    marginTop: 8,
    fontSize: 16,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 18,
  },

  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  settingText: {
    color: COLORS.text,
    fontSize: 16,
  },

  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  linkText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    marginLeft: 14,
  },

  version: {
    color: COLORS.subText,
  },
});
