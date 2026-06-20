// TRANG QUẢN TRỊ (Pha 1) — chỉ admin. Tổng quan + danh sách mọi rule + chạy thử 1 rule.
// Dữ liệu lấy qua Edge Function admin-api (server tự kiểm tra quyền admin).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { SCREEN, RADIUS, type AppColors } from "../lib/theme";
import { alertMessage } from "../lib/dialog";
import {
  adminCall,
  isAdminEmail,
  type AdminOverview,
  type AdminRule,
} from "../lib/admin";

function fmtFreq(f?: string | null): string {
  if (!f) return "định kỳ";
  if (f === "change") return "theo điều kiện";
  const n = parseInt(f, 10);
  if (Number.isFinite(n)) {
    if (n % 1440 === 0) return `mỗi ${n / 1440} ngày`;
    if (n % 60 === 0) return `mỗi ${n / 60} giờ`;
    return `mỗi ${n} phút`;
  }
  return f;
}

function fmtAgo(iso?: string | null): string {
  if (!iso) return "chưa chạy";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export default function AdminScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [rules, setRules] = useState<AdminRule[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = isAdminEmail(user?.email);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ov, rl] = await Promise.all([
        adminCall<AdminOverview>("overview"),
        adminCall<{ rules: AdminRule[] }>("rules"),
      ]);
      setOverview(ov);
      setRules(rl.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  const onRunRule = async (r: AdminRule) => {
    setRunningId(r.id);
    try {
      const res = await adminCall<{ ok: boolean; result?: unknown }>("run_rule", { ruleId: r.id });
      alertMessage("Đã chạy thử", res.ok ? "Quét xong. Kéo để làm mới xem kết quả." : "Có lỗi khi quét.");
      load();
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    } finally {
      setRunningId(null);
    }
  };

  if (!allowed) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.muted} />
        <Text style={styles.muted}>Bạn không có quyền truy cập trang quản trị.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  const stats: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }[] =
    overview
      ? [
          { label: "Người dùng", value: overview.users, icon: "people-outline", color: colors.primary },
          { label: "Rule (tổng)", value: overview.rulesTotal, icon: "list-outline", color: colors.accent },
          { label: "Rule đang bật", value: overview.rulesActive, icon: "flash-outline", color: colors.success },
          { label: "Rule để êm", value: overview.rulesMuted, icon: "notifications-off-outline", color: colors.warning },
          { label: "Thông báo (tổng)", value: overview.notifTotal, icon: "mail-outline", color: colors.primary },
          { label: "Thông báo hôm nay", value: overview.notifToday, icon: "today-outline", color: colors.success },
          { label: "Push token", value: overview.pushTokens, icon: "phone-portrait-outline", color: colors.accent },
        ]
      : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quản trị</Text>
          <Text style={styles.subtitle}>Tổng quan toàn hệ thống</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.backBtn} onPress={load}>
            <Text style={styles.backBtnText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* TỔNG QUAN */}
          <View style={styles.statGrid}>
            {stats.map((s) => (
              <View key={s.label} style={styles.statCard}>
                <Ionicons name={s.icon} size={20} color={s.color} />
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* DANH SÁCH RULE */}
          <Text style={styles.sectionLabel}>Tất cả rule ({rules.length})</Text>
          {rules.map((r) => (
            <View key={r.id} style={styles.ruleCard}>
              <View style={styles.ruleHead}>
                <Text style={styles.ruleKeyword} numberOfLines={1}>{r.keyword || "(không tên)"}</Text>
                <View style={styles.badges}>
                  {!r.is_active && <Badge text="Tắt" color={colors.danger} styles={styles} />}
                  {r.muted && <Badge text="Để êm" color={colors.warning} styles={styles} />}
                </View>
              </View>
              <Text style={styles.ruleEmail} numberOfLines={1}>{r.email}</Text>
              {!!r.condition && (
                <Text style={styles.ruleCond} numberOfLines={1}>ĐK: {r.condition}</Text>
              )}
              <View style={styles.ruleMetaRow}>
                <Text style={styles.ruleMeta}>{fmtFreq(r.frequency)}</Text>
                {!!r.run_at && <Text style={styles.ruleMeta}>· {r.run_at}</Text>}
                <Text style={styles.ruleMeta}>· {fmtAgo(r.last_run_at)}</Text>
                {!!r.last_value && <Text style={styles.ruleMeta} numberOfLines={1}>· {r.last_value}</Text>}
              </View>
              <Pressable
                style={[styles.runBtn, runningId === r.id && { opacity: 0.6 }]}
                onPress={() => onRunRule(r)}
                disabled={runningId === r.id}
              >
                {runningId === r.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="play" size={14} color={colors.primary} />
                    <Text style={styles.runBtnText}>Chạy thử</Text>
                  </>
                )}
              </Pressable>
            </View>
          ))}
          {rules.length === 0 && <Text style={styles.muted}>Chưa có rule nào.</Text>}
        </>
      )}
    </ScrollView>
  );
}

function Badge({ text, color, styles }: { text: string; color: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
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
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 14 },
    header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
    headerBack: { padding: 2 },
    title: { color: C.text, fontSize: 30, fontWeight: "bold" },
    subtitle: { color: C.subText, marginTop: 4, fontSize: 14 },
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 26 },
    statCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      paddingVertical: 14,
      paddingHorizontal: 14,
      width: "47.5%",
      gap: 6,
    },
    statValue: { color: C.text, fontSize: 24, fontWeight: "800" },
    statLabel: { color: C.subText, fontSize: 12.5 },
    sectionLabel: {
      color: C.muted,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
      marginLeft: 4,
    },
    ruleCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      padding: 14,
      marginBottom: 12,
      gap: 5,
    },
    ruleHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    ruleKeyword: { color: C.text, fontSize: 15.5, fontWeight: "700", flex: 1 },
    badges: { flexDirection: "row", gap: 6 },
    badge: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontSize: 11, fontWeight: "700" },
    ruleEmail: { color: C.subText, fontSize: 12.5 },
    ruleCond: { color: C.muted, fontSize: 12.5, fontStyle: "italic" },
    ruleMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
    ruleMeta: { color: C.muted, fontSize: 12 },
    runBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 8,
      paddingVertical: 8,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: C.primary,
    },
    runBtnText: { color: C.primary, fontSize: 13.5, fontWeight: "700" },
    muted: { color: C.muted, fontSize: 14, textAlign: "center" },
    errorBox: { gap: 14, alignItems: "center", paddingVertical: 30 },
    errorText: { color: C.danger, fontSize: 13.5, textAlign: "center" },
    backBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: RADIUS.sm,
      backgroundColor: C.card,
    },
    backBtnText: { color: C.primary, fontWeight: "700" },
  });
}
