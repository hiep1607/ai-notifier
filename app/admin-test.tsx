// TRANG TEST (chỉ admin) — công cụ kiểm thử nhanh, tách khỏi trang Quản trị.
// Gồm: xem trước kế hoạch quét (dry-run, 0 quota), chạy cron thử, chạy thử 1 rule,
// gửi push test cho chính mình, xem quota hôm nay. Mọi quyền do server (admin-api) quyết.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  type AdminRule,
  type AdminUsage,
  type ScanPreview,
  type ScanPlanItem,
  type RunResult,
  type RunNoteKind,
  type GatePreview,
} from "../lib/admin";

// Diễn giải loại tin tạo ra để dễ đọc trên trang test.
const KIND_LABEL: Record<RunNoteKind, string> = {
  real: "✅ Tin thật",
  nochange: "➖ Fallback: chưa có thay đổi",
  related: "🔎 Fallback: gợi ý liên quan",
  none: "❔ Fallback: chưa tìm thấy gì",
  skipped: "⏭️ Bỏ qua (điều kiện chưa thỏa / đã có tb trong chu kỳ)",
};

// Gộp kết quả thật thành văn bản dễ đọc: tổng quan + từng rule cho ra cái gì.
function formatRunResult(r: RunResult, prefix?: string): string {
  const lines: string[] = [];
  if (prefix) lines.push(prefix);
  lines.push(
    `Đã quét ${r.checked ?? 0} rule · tạo ${r.inserted ?? 0} thông báo${r.quotaHit ? " · ⚠️ chạm quota" : ""}`,
  );
  for (const n of r.notes ?? []) {
    const label = KIND_LABEL[n.kind] ?? n.kind;
    lines.push(`• [${n.keyword}] ${label}${n.title ? `\n   → ${n.title}` : ""}`);
  }
  return lines.join("\n");
}

// Diễn giải kết quả "soi bộ lọc rác": so sánh quyết định của 2 chế độ thông báo.
const PROVIDER_LABEL: Record<string, string> = {
  weather: "🌤 Open-Meteo (API thời tiết)",
  crypto: "🪙 CoinGecko (API giá coin)",
  fx: "💱 ExchangeRate-API (tỷ giá)",
  rss: "📰 RSS báo VN + flash-lite (không grounding)",
  url: "🌐 Trang web cụ thể (fetch trực tiếp + flash-lite)",
};

function formatGate(g: GatePreview): string {
  const modeLabel = g.currentMode === "important" ? "Chỉ tin quan trọng" : "Đầy đủ";
  const lines: string[] = [`Soi bộ lọc "${g.keyword}" (chế độ đang đặt: ${modeLabel})`];
  lines.push(`Nguồn: ${g.provider ? PROVIDER_LABEL[g.provider] ?? g.provider : "🔍 Gemini + Google Search"}`);

  if (!g.found) {
    lines.push("Gemini không tìm thấy tin nào.");
  } else {
    lines.push(`Tin tìm được: ${g.candidateTitle || "(không tiêu đề)"}${g.value ? `  [${g.value}]` : ""}`);
    lines.push(
      `  quan trọng: ${g.isImportant ? "có" : "không"} · ` +
      `thỏa điều kiện: ${g.matchesCondition ? "có" : "không"} · ` +
      `không trùng: ${g.fresh ? "có" : "không"}`,
    );
  }
  lines.push("");
  lines.push(`→ Chế độ Đầy đủ: ${KIND_LABEL[g.allKind] ?? g.allKind}`);
  lines.push(
    g.importantPushed
      ? "→ Chế độ Chỉ tin quan trọng: ✅ Vẫn báo (tin đáng chú ý)"
      : `→ Chế độ Chỉ tin quan trọng: 🚫 Bị lọc — ${g.importantReason}`,
  );
  return lines.join("\n");
}

const MAX_CONTENT_W = 860;

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

// Khoảng thời gian dạng người đọc ("45 phút", "2 giờ", "1h30").
function fmtMs(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60000);
  if (min < 1) return "dưới 1 phút";
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h} giờ`;
}

function fmtAgo(iso?: string | null): string {
  if (!iso) return "chưa chạy";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  if (ms < 60000) return "vừa xong";
  return `${fmtMs(ms)} trước`;
}

export default function AdminTestScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const allowed = isAdminEmail(user?.email);

  const [rules, setRules] = useState<AdminRule[]>([]);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [query, setQuery] = useState("");

  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);

  // Trạng thái loading riêng cho từng nút (để spinner đúng chỗ).
  const [busy, setBusy] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rl, us] = await Promise.all([
        adminCall<{ rules: AdminRule[] }>("rules"),
        adminCall<AdminUsage>("usage"),
      ]);
      setRules(rl.rules ?? []);
      setUsage(us);
    } catch (e) {
      alertMessage("Lỗi tải dữ liệu", e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const shownRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rules.filter(
          (r) =>
            (r.keyword ?? "").toLowerCase().includes(q) ||
            (r.email ?? "").toLowerCase().includes(q),
        )
      : rules;
    return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [rules, query]);

  // ---- HÀNH ĐỘNG ----
  const doPreview = async () => {
    setBusy("preview");
    try {
      const res = await adminCall<{ ok: boolean; result: ScanPreview }>("scan_preview");
      setPreview(res.result);
      setShowWaiting(false);
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doRunCron = async () => {
    setBusy("cron");
    setRunResult(null);
    try {
      const res = await adminCall<{ ok: boolean; result: RunResult }>("run_cron");
      setRunResult(formatRunResult(res.result, "Chạy cron thử:"));
      load();
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doRunRule = async (r: AdminRule) => {
    setBusy("rule:" + r.id);
    setRunResult(null);
    try {
      const res = await adminCall<{ ok: boolean; result: RunResult }>("run_rule", { ruleId: r.id });
      setRunResult(formatRunResult(res.result, `Chạy thử rule "${r.keyword}":`));
      load();
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Soi bộ lọc rác: 1 lượt Gemini, KHÔNG ghi notification — chỉ xem 2 chế độ quyết định gì.
  const doGateCheck = async (r: AdminRule) => {
    setBusy("gate:" + r.id);
    setRunResult(null);
    try {
      const res = await adminCall<{ ok: boolean; result: GatePreview }>("gate_check", { ruleId: r.id });
      setRunResult(formatGate(res.result));
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doPushTest = async () => {
    if (!user?.id) return;
    setBusy("push");
    try {
      const res = await adminCall<{ ok: boolean; sent?: number; message?: string }>("push_test", {
        userId: user.id,
      });
      alertMessage(
        res.ok ? "Đã gửi" : "Không gửi được",
        res.ok ? `Đã đẩy push tới ${res.sent} thiết bị.` : res.message ?? "Lỗi không rõ.",
      );
    } catch (e) {
      alertMessage("Lỗi", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!allowed) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.muted} />
        <Text style={styles.muted}>Bạn không có quyền truy cập trang này.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  const PlanRow = ({ item, waiting }: { item: ScanPlanItem; waiting?: boolean }) => (
    <View style={styles.planRow}>
      <Text style={styles.planOrder}>{waiting ? "·" : item.order}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.planKeyword} numberOfLines={1}>{item.keyword || "(không tên)"}</Text>
        <Text style={styles.planMeta}>
          {fmtFreq(item.frequency)}{item.run_at ? ` · ${item.run_at}` : ""} · quét lần cuối {fmtAgo(item.last_run_at)}
        </Text>
      </View>
      <Text style={[styles.planDelta, { color: waiting ? colors.muted : colors.warning }]}>
        {waiting ? `còn ${fmtMs(item.overdue_ms)}` : `trễ ${fmtMs(item.overdue_ms)}`}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Trang test</Text>
          <Text style={styles.subtitle}>Công cụ kiểm thử — chỉ admin</Text>
        </View>
      </View>

      {/* QUOTA HÔM NAY (nhanh) */}
      {usage?.available && (
        <View style={styles.quotaPill}>
          <Ionicons name="speedometer-outline" size={16} color={colors.primary} />
          <Text style={styles.quotaPillText}>
            Quota hôm nay: {usage.today ?? 0} lượt
            {(usage.todayErrors ?? 0) > 0 ? ` · ${usage.todayErrors} lỗi` : ""}
          </Text>
        </View>
      )}

      {/* 1. KẾ HOẠCH QUÉT (DRY-RUN) */}
      <Text style={styles.sectionLabel}>1 · Dự đoán thứ tự quét (không tốn quota)</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>
          Xem rule nào đang TỚI HẠN và thứ tự sẽ quét (ưu tiên rule trễ hẹn nặng nhất so
          với chu kỳ riêng). Không gọi Gemini nên gọi thoải mái.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={doPreview} disabled={busy === "preview"}>
          {busy === "preview" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Dự đoán thứ tự quét</Text>
            </>
          )}
        </Pressable>

        {preview && (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.planSummary}>
              {preview.dueCount}/{preview.total} rule tới hạn · lúc{" "}
              {new Date(preview.now).toLocaleTimeString("vi-VN")}
            </Text>

            {preview.plan.length === 0 ? (
              <Text style={styles.muted}>Không có rule nào tới hạn ngay bây giờ.</Text>
            ) : (
              preview.plan.map((it) => <PlanRow key={it.id} item={it} />)
            )}

            {preview.waiting.length > 0 && (
              <>
                <Pressable
                  style={styles.toggleWaiting}
                  onPress={() => setShowWaiting((v) => !v)}
                >
                  <Ionicons
                    name={showWaiting ? "chevron-up" : "chevron-down"}
                    size={15}
                    color={colors.subText}
                  />
                  <Text style={styles.toggleWaitingText}>
                    {showWaiting ? "Ẩn" : "Xem"} {preview.waiting.length} rule chưa tới hạn
                  </Text>
                </Pressable>
                {showWaiting &&
                  preview.waiting.map((it) => <PlanRow key={it.id} item={it} waiting />)}
              </>
            )}
          </View>
        )}
      </View>

      {/* 2. QUÉT TOÀN BỘ NGAY */}
      <Text style={styles.sectionLabel}>2 · Quét toàn bộ ngay (cron thử — TỐN quota)</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>
          Chạy đúng như nhịp cron nền: quét hết rule tới hạn theo thứ tự ưu tiên. Có gọi
          Gemini nên tốn quota — dùng để test thật.
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.warning }]}
          onPress={doRunCron}
          disabled={busy === "cron"}
        >
          {busy === "cron" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="flash-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Chạy cron thử ngay</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* 3. PUSH TEST */}
      <Text style={styles.sectionLabel}>3 · Gửi push test cho chính tôi</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>
          Đẩy 1 thông báo thử tới mọi thiết bị đang đăng nhập tài khoản admin (kiểm tra
          push hoạt động).
        </Text>
        <Pressable style={styles.outlineBtn} onPress={doPushTest} disabled={busy === "push"}>
          {busy === "push" ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Ionicons name="notifications-outline" size={16} color={colors.primary} />
              <Text style={styles.outlineBtnText}>Gửi push test</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* KẾT QUẢ THÔ (chung cho cron / chạy rule) */}
      {runResult && (
        <View style={styles.resultBox}>
          <View style={styles.resultHead}>
            <Text style={styles.resultTitle}>Kết quả lần quét</Text>
            <Pressable onPress={() => setRunResult(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.resultText}>{runResult}</Text>
        </View>
      )}

      {/* 4. CHẠY THỬ 1 RULE / SOI BỘ LỌC */}
      <Text style={styles.sectionLabel}>4 · Chạy thử 1 rule / soi bộ lọc rác (TỐN quota)</Text>
      <Text style={[styles.cardHint, { marginLeft: 4, marginBottom: 12 }]}>
        <Ionicons name="funnel-outline" size={13} color={colors.subText} /> Soi bộ lọc: lấy 1 tin
        thật rồi so 2 chế độ (Đầy đủ vs Chỉ tin quan trọng) sẽ báo hay lọc — KHÔNG tạo thông báo.
        {"  "}
        <Ionicons name="play" size={13} color={colors.subText} /> Chạy thử: quét thật, có TẠO thông báo.
      </Text>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={17} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm theo tên rule hoặc email…"
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

      {shownRules.slice(0, 40).map((r) => (
        <View key={r.id} style={styles.ruleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ruleKeyword} numberOfLines={1}>{r.keyword || "(không tên)"}</Text>
            <Text style={styles.ruleMeta} numberOfLines={1}>
              {r.email} · {fmtFreq(r.frequency)} · {fmtAgo(r.last_run_at)}
            </Text>
          </View>
          <Pressable
            style={[styles.gateMini, busy === "gate:" + r.id && { opacity: 0.6 }]}
            onPress={() => doGateCheck(r)}
            disabled={!!busy}
          >
            {busy === "gate:" + r.id ? (
              <ActivityIndicator size="small" color={colors.subText} />
            ) : (
              <Ionicons name="funnel-outline" size={15} color={colors.subText} />
            )}
          </Pressable>
          <Pressable
            style={[styles.runMini, busy === "rule:" + r.id && { opacity: 0.6 }]}
            onPress={() => doRunRule(r)}
            disabled={!!busy}
          >
            {busy === "rule:" + r.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="play" size={15} color={colors.primary} />
            )}
          </Pressable>
        </View>
      ))}
      {shownRules.length === 0 && (
        <Text style={styles.muted}>
          {query.trim() ? "Không tìm thấy rule khớp." : "Chưa có rule nào."}
        </Text>
      )}
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background, paddingTop: SCREEN.paddingTop },
    content: {
      paddingHorizontal: SCREEN.paddingHorizontal,
      paddingBottom: 48,
      width: "100%",
      maxWidth: MAX_CONTENT_W + SCREEN.paddingHorizontal * 2,
      alignSelf: "center",
    },
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 14 },
    header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 18 },
    headerBack: { padding: 2 },
    title: { color: C.text, fontSize: 30, fontWeight: "bold" },
    subtitle: { color: C.subText, marginTop: 4, fontSize: 14 },
    quotaPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "flex-start",
      backgroundColor: C.card,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 22,
    },
    quotaPillText: { color: C.subText, fontSize: 13, fontWeight: "600" },
    sectionLabel: {
      color: C.muted,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
      marginLeft: 4,
    },
    card: { backgroundColor: C.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 26 },
    cardHint: { color: C.subText, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: RADIUS.sm,
      paddingVertical: 12,
    },
    primaryBtnText: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
    outlineBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: C.primary,
      borderRadius: RADIUS.sm,
      paddingVertical: 11,
    },
    outlineBtnText: { color: C.primary, fontSize: 14.5, fontWeight: "700" },
    planSummary: { color: C.text, fontSize: 13.5, fontWeight: "700", marginBottom: 10 },
    planRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 9,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    planOrder: {
      color: C.primary,
      fontSize: 14,
      fontWeight: "800",
      width: 22,
      textAlign: "center",
    },
    planKeyword: { color: C.text, fontSize: 14.5, fontWeight: "600" },
    planMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
    planDelta: { fontSize: 12.5, fontWeight: "700" },
    toggleWaiting: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
      marginTop: 4,
    },
    toggleWaitingText: { color: C.subText, fontSize: 13, fontWeight: "600" },
    resultBox: {
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      padding: 14,
      marginBottom: 26,
      borderWidth: 1,
      borderColor: C.border,
    },
    resultHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    resultTitle: { color: C.text, fontSize: 13.5, fontWeight: "700" },
    resultText: {
      color: C.subText,
      fontSize: 12.5,
      lineHeight: 18,
      fontFamily: "monospace",
    },
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
    ruleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    ruleKeyword: { color: C.text, fontSize: 14.5, fontWeight: "700" },
    ruleMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
    runMini: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: C.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    gateMini: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    muted: { color: C.muted, fontSize: 14, textAlign: "center", paddingVertical: 8 },
    backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.sm, backgroundColor: C.card },
    backBtnText: { color: C.primary, fontWeight: "700" },
  });
}
