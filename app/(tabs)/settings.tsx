import React, { useEffect, useMemo, useState } from "react";

import { ScrollView, StyleSheet, Text, View } from "react-native";

import Slider from "@react-native-community/slider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { confirmAsync, alertMessage } from "../../lib/dialog";
import { SCREEN, RADIUS, type AppColors } from "../../lib/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { isAdminEmail } from "../../lib/admin";
import { unregisterForPush } from "../../lib/push";
import { clearScreenCache } from "../../lib/screenCache";
import SettingRow from "../../components/SettingRow";

const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

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

const DB_SETTING_COLUMN: Partial<Record<keyof Settings, string>> = {
  notificationsEnabled: "notifications_enabled",
  soundEnabled: "sound_enabled",
  vibrationEnabled: "vibration_enabled",
  aiSummaryEnabled: "ai_summary_enabled",
  importantAlertsEnabled: "important_alerts_enabled",
};

export default function SettingsScreen() {
  const { colors, setDarkMode } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Giờ yên lặng — lưu trên DB (server đọc để bỏ qua push trong khung giờ này).
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(7);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      let next = DEFAULT_SETTINGS;
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) next = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch { /* cache lỗi → dùng mặc định */ }

      if (user) {
        const { data, error } = await supabase.from("user_settings").select(
          "quiet_enabled,quiet_start,quiet_end,notifications_enabled,sound_enabled,vibration_enabled,ai_summary_enabled,important_alerts_enabled",
        ).eq("user_id", user.id).maybeSingle();
        if (error) console.log("user_settings read error:", error);
        if (data) {
          next = {
            ...next,
            notificationsEnabled: data.notifications_enabled ?? true,
            soundEnabled: data.sound_enabled ?? true,
            vibrationEnabled: data.vibration_enabled ?? false,
            aiSummaryEnabled: data.ai_summary_enabled ?? true,
            importantAlertsEnabled: data.important_alerts_enabled ?? true,
          };
          if (!cancelled) {
            setQuietEnabled(Boolean(data.quiet_enabled));
            setQuietStart(data.quiet_start ?? 22);
            setQuietEnd(data.quiet_end ?? 7);
          }
        }
      }
      if (!cancelled) {
        setSettings(next);
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      }
    };
    loadSettings();
    return () => { cancelled = true; };
  }, [user]);

  // Lưu trạng thái giờ yên lặng. Dùng update→insert thay cho upsert(onConflict) để khỏi
  // phụ thuộc ràng buộc unique trên user_id (bảng user_settings có thể đã tồn tại sẵn).
  const persistQuiet = async (enabled: boolean, start: number, end: number): Promise<boolean> => {
    if (!user) return false;
    const payload = {
      quiet_enabled: enabled,
      quiet_start: start,
      quiet_end: end,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, ...payload }, { onConflict: "user_id" });
    if (error) {
      console.log("user_settings quiet error:", error);
      alertMessage("Chưa lưu được", `${error.message}${error.code ? ` (mã ${error.code})` : ""}`);
      return false;
    }
    return true;
  };

  const onToggleQuiet = async (v: boolean) => {
    const previous = quietEnabled;
    setQuietEnabled(v);
    if (!(await persistQuiet(v, quietStart, quietEnd))) setQuietEnabled(previous);
  };

  const updateSetting = async (key: keyof Settings, value: boolean) => {
    const previous = settings;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));

    if (key === "darkMode") {
      setDarkMode(value);
      return;
    }

    const column = DB_SETTING_COLUMN[key];
    if (user && column) {
      const { error } = await supabase.from("user_settings").upsert({
        user_id: user.id,
        [column]: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) {
        setSettings(previous);
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(previous));
        alertMessage("Chưa lưu được", error.message);
      }
    }
  };

  const handleLogout = async () => {
    const ok = await confirmAsync("Đăng xuất", "Bạn có chắc muốn đăng xuất?");
    if (!ok) return;
    try {
      await unregisterForPush();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      alertMessage("Chưa thể đăng xuất", err instanceof Error ? err.message : String(err));
      return;
    }
    router.replace("/login");
  };

  const handleClearCache = async () => {
    const ok = await confirmAsync("Xóa cache", "Xóa dữ liệu tạm của ứng dụng? (không ảnh hưởng tài khoản)");
    if (!ok) return;
    await clearScreenCache();
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

      {/* QUẢN TRỊ (chỉ admin) */}
      {isAdminEmail(user?.email) && (
        <>
          <Text style={styles.sectionLabel}>Quản trị</Text>
          <View style={styles.card}>
            <SettingRow
              icon="shield-checkmark-outline"
              label="Trang quản trị"
              onPress={() => router.push("/admin")}
              iconColor={colors.primary}
            />
            <SettingRow
              icon="flask-outline"
              label="Trang test"
              onPress={() => router.push("/admin-test" as never)}
              iconColor={colors.accent}
              last
            />
          </View>
        </>
      )}

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

      {/* GIỜ YÊN LẶNG */}
      <Text style={styles.sectionLabel}>Giờ yên lặng</Text>
      <View style={styles.card}>
        <SettingRow
          icon="moon-outline"
          label="Bật giờ yên lặng"
          value={quietEnabled}
          onValueChange={onToggleQuiet}
          last={!quietEnabled}
        />

        {quietEnabled && (
          <View style={styles.quietBox}>
            <View style={styles.quietSummaryRow}>
              <Ionicons name="notifications-off-outline" size={15} color={colors.warning} />
              <Text style={styles.quietSummary}>
                Không đẩy push từ {fmtHour(quietStart)} → {fmtHour(quietEnd)} (tin vẫn vào app)
              </Text>
            </View>

            {/* Bắt đầu */}
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Bắt đầu</Text>
              <Text style={styles.sliderValue}>{fmtHour(quietStart)}</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={23}
              step={1}
              value={quietStart}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              onValueChange={(v) => setQuietStart(Math.round(v))}
              onSlidingComplete={(v) => persistQuiet(quietEnabled, Math.round(v), quietEnd)}
            />

            {/* Kết thúc */}
            <View style={[styles.sliderRow, { marginTop: 14 }]}>
              <Text style={styles.sliderLabel}>Kết thúc</Text>
              <Text style={styles.sliderValue}>{fmtHour(quietEnd)}</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={23}
              step={1}
              value={quietEnd}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              onValueChange={(v) => setQuietEnd(Math.round(v))}
              onSlidingComplete={(v) => persistQuiet(quietEnabled, quietStart, Math.round(v))}
            />
          </View>
        )}
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
    quietBox: {
      paddingTop: 8,
      paddingBottom: 16,
    },
    quietSummaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 12,
    },
    quietSummary: {
      color: C.subText,
      fontSize: 13,
      flex: 1,
    },
    sliderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sliderLabel: {
      color: C.subText,
      fontSize: 14,
    },
    sliderValue: {
      color: C.text,
      fontSize: 15,
      fontWeight: "700",
    },
  });
}
