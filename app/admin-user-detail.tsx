// Quản trị — chi tiết 1 người dùng: thông tin, rule, thông báo gần đây, push token, giờ yên lặng.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { SCREEN, RADIUS, type AppColors } from "../lib/theme";
import { alertMessage } from "../lib/dialog";
import { adminCall, isAdminEmail, type AdminUserDetail } from "../lib/admin";

export default function AdminUserDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const allowed = isAdminEmail(user?.email);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const res = await adminCall<AdminUserDetail>("user_detail", { userId: id });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  const onPushTest = async () => {
    if (!id) return;
    setPushing(true);
    try {
      const res = await adminCall<{ ok: boolean; sent?: number; message?: string }>("push_test", { userId: id });
      alertMessage(
        res.ok ? "Đã gửi" : "Không gửi được",
        res.ok ? `Đã đẩy push test tới ${res.sent} thiết bị.` : (res.message ?? "Lỗi gửi push."),
      );
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  };

  if (!allowed) {
    return <View style={[styles.container, styles.center]}><Text style={styles.muted}>Không có quyền.</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{data?.user?.email ?? "Người dùng"}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : data ? (
        <>
          {/* THÔNG TIN */}
          <View style={styles.card}>
            <Row label="Email" value={data.user?.email ?? "—"} styles={styles} />
            <Row label="Tạo lúc" value={fmtDateTime(data.user?.created_at)} styles={styles} />
            <Row label="Đăng nhập cuối" value={fmtDateTime(data.user?.last_sign_in_at)} styles={styles} />
            <Row label="Push token" value={`${data.tokens.length} thiết bị`} styles={styles} />
            <Row
              label="Giờ yên lặng"
              value={data.settings?.quiet_enabled ? `${data.settings.quiet_start}h → ${data.settings.quiet_end}h` : "tắt"}
              styles={styles}
              last
            />
          </View>

          <Pressable style={[styles.pushBtn, pushing && { opacity: 0.6 }]} onPress={onPushTest} disabled={pushing || data.tokens.length === 0}>
            {pushing ? <ActivityIndicator size="small" color={colors.primary} /> : (
              <>
                <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
                <Text style={styles.pushBtnText}>{data.tokens.length === 0 ? "Chưa có token để gửi" : "Gửi push test"}</Text>
              </>
            )}
          </Pressable>

          {/* RULES */}
          <Text style={styles.sectionLabel}>Rule ({data.rules.length})</Text>
          {data.rules.map((r) => (
            <View key={r.id} style={styles.miniCard}>
              <Text style={styles.miniTitle} numberOfLines={1}>{r.keyword}</Text>
              <Text style={styles.miniMeta}>
                {r.is_active ? "đang bật" : "tắt"}{r.muted ? " · để êm" : ""}{r.frequency ? ` · ${r.frequency === "change" ? "theo đk" : r.frequency + "'"}` : ""}
              </Text>
            </View>
          ))}
          {data.rules.length === 0 && <Text style={styles.muted}>Chưa có rule.</Text>}

          {/* THÔNG BÁO GẦN ĐÂY */}
          <Text style={styles.sectionLabel}>Thông báo gần đây ({data.notifications.length})</Text>
          {data.notifications.map((n) => (
            <View key={n.id} style={styles.miniCard}>
              <Text style={styles.miniTitle} numberOfLines={2}>{n.title}</Text>
              <Text style={styles.miniMeta}>{fmtDateTime(n.created_at)}{n.sentiment ? ` · ${n.sentiment}` : ""}</Text>
            </View>
          ))}
          {data.notifications.length === 0 && <Text style={styles.muted}>Chưa có thông báo.</Text>}
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, styles, last }: { label: string; value: string; styles: ReturnType<typeof createStyles>; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background, paddingTop: SCREEN.paddingTop },
    content: { paddingHorizontal: SCREEN.paddingHorizontal, paddingBottom: 48, width: "100%", maxWidth: 760 + SCREEN.paddingHorizontal * 2, alignSelf: "center" },
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
    header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
    headerBack: { padding: 2 },
    title: { color: C.text, fontSize: 22, fontWeight: "bold", flex: 1 },
    card: { backgroundColor: C.card, borderRadius: RADIUS.md, paddingHorizontal: 14, marginBottom: 14 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
    infoLabel: { color: C.subText, fontSize: 13.5 },
    infoValue: { color: C.text, fontSize: 13.5, fontWeight: "600", flexShrink: 1 },
    pushBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: C.primary, borderRadius: RADIUS.sm, paddingVertical: 11, marginBottom: 24 },
    pushBtnText: { color: C.primary, fontSize: 14, fontWeight: "700" },
    sectionLabel: { color: C.muted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginLeft: 4 },
    miniCard: { backgroundColor: C.card, borderRadius: RADIUS.sm, padding: 12, marginBottom: 8 },
    miniTitle: { color: C.text, fontSize: 14, fontWeight: "600" },
    miniMeta: { color: C.subText, fontSize: 12, marginTop: 4 },
    muted: { color: C.muted, fontSize: 14, marginBottom: 16 },
    error: { color: C.danger, fontSize: 13.5, textAlign: "center", paddingVertical: 20 },
  });
}
