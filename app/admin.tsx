// TRANG QUẢN TRỊ (Pha 1) — chỉ admin. Tổng quan + danh sách mọi rule + chạy thử 1 rule.
// Dữ liệu lấy qua Edge Function admin-api (server tự kiểm tra quyền admin).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

// Bề rộng nội dung tối đa trên web (canh giữa, tránh kéo giãn full màn hình).
const MAX_CONTENT_W = 860;

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { SCREEN, RADIUS, type AppColors } from "../lib/theme";
import { alertMessage, confirmAsync } from "../lib/dialog";
import {
  adminCall,
  isAdminEmail,
  type AdminOverview,
  type AdminRule,
  type AdminUsage,
  type AdminCronRun,
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

  // Lưới thẻ co theo độ rộng: màn rộng → nhiều cột hơn (đỡ trống).
  const { width } = useWindowDimensions();
  const contentW = Math.min(width - SCREEN.paddingHorizontal * 2, MAX_CONTENT_W);
  const cols = contentW > 700 ? 4 : contentW > 460 ? 3 : 2;
  const statW = Math.floor((contentW - 10 * (cols - 1)) / cols);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [rules, setRules] = useState<AdminRule[]>([]);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [cronRuns, setCronRuns] = useState<AdminCronRun[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ruleFilter, setRuleFilter] = useState<"all" | "active" | "off" | "muted">("all");
  const [expandedCron, setExpandedCron] = useState<number | null>(null);
  const [showFullErr, setShowFullErr] = useState(false);

  // Lọc theo trạng thái + tên rule / email người dùng, sắp xếp mới nhất (theo ngày tạo) lên đầu.
  const shownRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rules;
    if (ruleFilter === "active") list = list.filter((r) => r.is_active);
    else if (ruleFilter === "off") list = list.filter((r) => !r.is_active);
    else if (ruleFilter === "muted") list = list.filter((r) => r.muted);
    if (q) {
      list = list.filter(
        (r) =>
          (r.keyword ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [rules, query, ruleFilter]);

  const RULE_FILTERS: { key: typeof ruleFilter; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "active", label: "Đang bật" },
    { key: "off", label: "Tắt" },
    { key: "muted", label: "Để êm" },
  ];

  // Quản lý rule: bật/tắt, để êm, xóa.
  const ruleAction = async (r: AdminRule, op: "toggle_active" | "toggle_muted" | "delete") => {
    if (op === "delete") {
      const ok = await confirmAsync("Xóa rule", `Xóa "${r.keyword}" của ${r.email}? Không thể hoàn tác.`);
      if (!ok) return;
    }
    try {
      await adminCall("rule_action", { ruleId: r.id, op });
      load();
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    }
  };

  // Bấm thẻ Rule → cuộn xuống danh sách rule ngay trong trang.
  const scrollRef = useRef<ScrollView>(null);
  const rulesY = useRef(0);
  const scrollToRules = () => scrollRef.current?.scrollTo({ y: rulesY.current, animated: true });

  const allowed = isAdminEmail(user?.email);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ov, rl, us, cr] = await Promise.all([
        adminCall<AdminOverview>("overview"),
        adminCall<{ rules: AdminRule[] }>("rules"),
        adminCall<AdminUsage>("usage"),
        adminCall<{ available: boolean; runs: AdminCronRun[] }>("cron_runs"),
      ]);
      setOverview(ov);
      setRules(rl.rules ?? []);
      setUsage(us);
      setCronRuns(cr.runs ?? []);
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

  const goUsers = () => router.push("/admin-users" as never);
  const goNotifs = () => router.push("/admin-notifications" as never);

  const stats: {
    label: string;
    value: number;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    onPress?: () => void;
  }[] = overview
    ? [
        { label: "Người dùng", value: overview.users, icon: "people-outline", color: colors.primary, onPress: goUsers },
        { label: "Rule (tổng)", value: overview.rulesTotal, icon: "list-outline", color: colors.accent, onPress: scrollToRules },
        { label: "Rule đang bật", value: overview.rulesActive, icon: "flash-outline", color: colors.success, onPress: scrollToRules },
        { label: "Rule để êm", value: overview.rulesMuted, icon: "notifications-off-outline", color: colors.warning, onPress: scrollToRules },
        { label: "Thông báo (tổng)", value: overview.notifTotal, icon: "mail-outline", color: colors.primary, onPress: goNotifs },
        { label: "Thông báo hôm nay", value: overview.notifToday, icon: "today-outline", color: colors.success, onPress: goNotifs },
        { label: "Push token", value: overview.pushTokens, icon: "phone-portrait-outline", color: colors.accent },
      ]
    : [];

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
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
              <Pressable
                key={s.label}
                style={[styles.statCard, { width: statW }]}
                onPress={s.onPress}
                disabled={!s.onPress}
              >
                <View style={styles.statTop}>
                  <Ionicons name={s.icon} size={20} color={s.color} />
                  {!!s.onPress && <Ionicons name="chevron-forward" size={15} color={colors.muted} />}
                </View>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* QUOTA GEMINI */}
          <Text style={styles.sectionLabel}>Quota Gemini hôm nay</Text>
          <View style={styles.card}>
            {usage?.available ? (
              <>
                <View style={styles.quotaRow}>
                  <Text style={styles.quotaNum}>{usage.today ?? 0}</Text>
                  <Text style={styles.quotaLimit}>/ {usage.limit ?? 1500} lượt gọi</Text>
                  {(usage.todayErrors ?? 0) > 0 && (
                    <Text style={styles.quotaErr}>· {usage.todayErrors} lỗi/quota</Text>
                  )}
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(100, ((usage.today ?? 0) / (usage.limit || 1500)) * 100)}%`,
                        backgroundColor:
                          (usage.today ?? 0) > (usage.limit ?? 1500) * 0.8 ? colors.warning : colors.success,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.quotaSub}>
                  Tính theo mốc reset của Gemini — reset lúc ~14–15h VN (nửa đêm giờ Mỹ).
                </Text>
                {(usage.days?.length ?? 0) > 1 && (
                  <Text style={styles.quotaSub}>
                    Mấy ngày gần đây: {usage.days!.map((d) => d.total).join(" · ")}
                  </Text>
                )}
                {!!usage.lastError && (
                  <Pressable onPress={() => setShowFullErr((v) => !v)}>
                    <Text style={styles.quotaErrMsg} numberOfLines={showFullErr ? undefined : 3}>
                      ⚠️ Lỗi gần nhất ({showFullErr ? "thu gọn" : "bấm xem đầy đủ"}): {usage.lastError}
                    </Text>
                  </Pressable>
                )}
              </>
            ) : (
              <Text style={styles.muted}>
                Chưa bật log quota — chạy migration 0012 (usage_logs) để xem.
              </Text>
            )}
          </View>

          {/* LỊCH SỬ CRON */}
          <Text style={styles.sectionLabel}>Lịch sử quét nền (cron)</Text>
          <View style={styles.card}>
            {cronRuns.length === 0 ? (
              <Text style={styles.muted}>
                Chưa có dữ liệu — chạy migration 0012 (cron_runs); log sẽ xuất hiện ở lần quét kế tiếp.
              </Text>
            ) : (
              <ScrollView style={styles.cronScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                {cronRuns.map((c, i) => {
                  const open = expandedCron === c.id;
                  return (
                    <Pressable key={c.id} onPress={() => setExpandedCron(open ? null : c.id)}>
                      <View style={[styles.cronRow, i === 0 && { borderTopWidth: 0 }]}>
                        <Text style={styles.cronTime}>{fmtAgo(c.created_at)}</Text>
                        <Text style={styles.cronMeta}>{c.trigger}</Text>
                        <Text style={styles.cronMeta}>quét {c.rules_scanned}</Text>
                        <Text style={styles.cronMeta}>+{c.inserted} tb</Text>
                        {c.quota_hit && <Ionicons name="warning" size={13} color={colors.warning} />}
                        <Text style={styles.cronDur}>{(c.duration_ms / 1000).toFixed(1)}s</Text>
                        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
                      </View>
                      {open && (
                        <Text style={styles.cronDetail}>
                          {c.detail
                            ? `Rule đã quét: ${c.detail}`
                            : c.rules_scanned > 0
                              ? `Đã quét ${c.rules_scanned} rule (log cũ chưa ghi tên — chạy SQL 0013 để có tên).`
                              : c.quota_hit
                                ? "Thử quét nhưng chạm quota/giới hạn Gemini (429) nên dừng — chưa quét được rule nào."
                                : "Không có rule nào tới hạn ở nhịp này nên bỏ qua."}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* DANH SÁCH RULE */}
          <Text
            style={styles.sectionLabel}
            onLayout={(e) => { rulesY.current = e.nativeEvent.layout.y; }}
          >
            Tất cả rule ({shownRules.length}{query.trim() ? `/${rules.length}` : ""})
          </Text>

          {/* TÌM KIẾM */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Tìm theo tên rule hoặc email người dùng…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {/* LỌC TRẠNG THÁI */}
          <View style={styles.filterRow}>
            {RULE_FILTERS.map((f) => (
              <Pressable
                key={f.key}
                style={[styles.filterChip, ruleFilter === f.key && styles.filterChipActive]}
                onPress={() => setRuleFilter(f.key)}
              >
                <Text style={[styles.filterChipText, ruleFilter === f.key && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {shownRules.map((r) => (
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

              {/* QUẢN LÝ */}
              <View style={styles.manageRow}>
                <Pressable style={styles.manageBtn} onPress={() => ruleAction(r, "toggle_active")}>
                  <Ionicons
                    name={r.is_active ? "pause-circle-outline" : "play-circle-outline"}
                    size={15}
                    color={colors.subText}
                  />
                  <Text style={styles.manageText}>{r.is_active ? "Tạm dừng" : "Bật"}</Text>
                </Pressable>
                <Pressable style={styles.manageBtn} onPress={() => ruleAction(r, "toggle_muted")}>
                  <Ionicons
                    name={r.muted ? "notifications-outline" : "notifications-off-outline"}
                    size={15}
                    color={colors.subText}
                  />
                  <Text style={styles.manageText}>{r.muted ? "Bỏ êm" : "Để êm"}</Text>
                </Pressable>
                <Pressable style={styles.manageBtn} onPress={() => ruleAction(r, "delete")}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.manageText, { color: colors.danger }]}>Xóa</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {shownRules.length === 0 && (
            <Text style={styles.muted}>
              {query.trim() ? "Không tìm thấy rule khớp." : "Chưa có rule nào."}
            </Text>
          )}
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
    },
    content: {
      paddingHorizontal: SCREEN.paddingHorizontal,
      paddingBottom: 48,
      width: "100%",
      maxWidth: MAX_CONTENT_W + SCREEN.paddingHorizontal * 2,
      alignSelf: "center",
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
      paddingVertical: 12,
      paddingHorizontal: 13,
      gap: 4,
    },
    statValue: { color: C.text, fontSize: 22, fontWeight: "800" },
    statLabel: { color: C.subText, fontSize: 12.5 },
    card: { backgroundColor: C.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 26 },
    statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: C.inputBg,
      borderRadius: RADIUS.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    searchInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 0 },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
    filterChip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: C.card },
    filterChipActive: { backgroundColor: C.primary },
    filterChipText: { color: C.subText, fontSize: 12.5, fontWeight: "600" },
    filterChipTextActive: { color: "#fff" },
    manageRow: {
      flexDirection: "row",
      gap: 6,
      marginTop: 8,
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingTop: 8,
    },
    manageBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 6 },
    manageText: { color: C.subText, fontSize: 12.5, fontWeight: "600" },
    quotaRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 10 },
    quotaNum: { color: C.text, fontSize: 26, fontWeight: "800" },
    quotaLimit: { color: C.subText, fontSize: 13 },
    quotaErr: { color: C.warning, fontSize: 12.5 },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: C.border, overflow: "hidden" },
    barFill: { height: 8, borderRadius: 4 },
    quotaSub: { color: C.muted, fontSize: 12, marginTop: 10 },
    quotaErrMsg: { color: C.warning, fontSize: 12, marginTop: 8, lineHeight: 16 },
    cronRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 9,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    cronTime: { color: C.text, fontSize: 12.5, width: 86 },
    cronMeta: { color: C.subText, fontSize: 12 },
    cronDur: { color: C.muted, fontSize: 12, marginLeft: "auto" },
    cronScroll: { maxHeight: 360 },
    cronDetail: { color: C.subText, fontSize: 12, paddingBottom: 9, paddingLeft: 2, lineHeight: 17 },
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
