// Quản trị — stream thông báo toàn hệ thống + lọc theo cảm xúc, để soi chất lượng AI/link.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
import { adminCall, isAdminEmail, type AdminNotification } from "../lib/admin";

const SENTIMENTS = [
  { key: "", label: "Tất cả" },
  { key: "positive", label: "Tích cực" },
  { key: "neutral", label: "Trung tính" },
  { key: "negative", label: "Tiêu cực" },
];

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminNotificationsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const allowed = isAdminEmail(user?.email);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [sentiment, setSentiment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (sent: string) => {
    try {
      setError(null);
      const res = await adminCall<{ notifications: AdminNotification[] }>("notifications", sent ? { sentiment: sent } : {});
      setItems(res.notifications ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load(sentiment);
    else setLoading(false);
  }, [allowed, sentiment, load]);

  if (!allowed) {
    return <View style={[styles.container, styles.center]}><Text style={styles.muted}>Không có quyền.</Text></View>;
  }

  const sentColor = (s?: string | null) =>
    s === "positive" ? colors.success : s === "negative" ? colors.danger : colors.muted;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(sentiment); }} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Thông báo</Text>
          <Text style={styles.subtitle}>Toàn hệ thống · {items.length}</Text>
        </View>
      </View>

      {/* LỌC */}
      <View style={styles.filterRow}>
        {SENTIMENTS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.chip, sentiment === s.key && styles.chipActive]}
            onPress={() => setSentiment(s.key)}
          >
            <Text style={[styles.chipText, sentiment === s.key && styles.chipTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        items.map((n) => (
          <View key={n.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.dot, { backgroundColor: sentColor(n.sentiment) }]} />
              <Text style={styles.keyword} numberOfLines={1}>{n.keyword}</Text>
              <Text style={styles.time}>{fmtDateTime(n.created_at)}</Text>
            </View>
            <Text style={styles.notifTitle} numberOfLines={2}>{n.title}</Text>
            {!!n.ai_summary && <Text style={styles.summary} numberOfLines={2}>{n.ai_summary}</Text>}
            <View style={styles.cardBottom}>
              <Text style={styles.owner} numberOfLines={1}>{n.email}</Text>
              {!!n.source_url && (
                <Pressable onPress={() => Linking.openURL(n.source_url!)} hitSlop={8} style={styles.link}>
                  <Ionicons name="open-outline" size={13} color={colors.primary} />
                  <Text style={styles.linkText}>{n.source || "nguồn"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))
      )}
      {!loading && items.length === 0 && !error && <Text style={styles.muted}>Không có thông báo.</Text>}
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background, paddingTop: SCREEN.paddingTop, paddingHorizontal: SCREEN.paddingHorizontal },
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
    header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
    headerBack: { padding: 2 },
    title: { color: C.text, fontSize: 30, fontWeight: "bold" },
    subtitle: { color: C.subText, marginTop: 4, fontSize: 14 },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.pill, backgroundColor: C.card },
    chipActive: { backgroundColor: C.primary },
    chipText: { color: C.subText, fontSize: 13, fontWeight: "600" },
    chipTextActive: { color: "#fff" },
    card: { backgroundColor: C.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 10 },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    keyword: { color: C.primary, fontSize: 12.5, fontWeight: "700", flex: 1 },
    time: { color: C.muted, fontSize: 11.5 },
    notifTitle: { color: C.text, fontSize: 14.5, fontWeight: "600" },
    summary: { color: C.subText, fontSize: 12.5, marginTop: 4 },
    cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 },
    owner: { color: C.muted, fontSize: 11.5, flex: 1 },
    link: { flexDirection: "row", alignItems: "center", gap: 4 },
    linkText: { color: C.primary, fontSize: 12, fontWeight: "600" },
    muted: { color: C.muted, fontSize: 14, textAlign: "center", paddingVertical: 20 },
    error: { color: C.danger, fontSize: 13.5, textAlign: "center", paddingVertical: 20 },
  });
}
