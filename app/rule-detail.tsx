import React, { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "../lib/supabase";
import { confirmAsync, alertMessage } from "../lib/dialog";
import { previewRule, RulePreviewResult, runMonitorForRule } from "../lib/monitor";
import { editRuleAI, RuleDraft } from "../lib/ruleAI";
import { CATEGORIES, FREQUENCIES, findCategory, formatSchedule, toFreqKey } from "../lib/ruleOptions";
import { useTheme } from "../contexts/ThemeContext";
import { Rule } from "../types/Rule";
import { Notification } from "../types/Notification";
import { RuleScanLog, RuleScanStatus } from "../types/RuleScanLog";
import { nextDueAt } from "../supabase/functions/_shared/monitorLogic";
import { RADIUS, type AppColors } from "../lib/theme";
import RulePreviewPanel from "../components/RulePreviewPanel";

const SCAN_STATUS_UI: Record<RuleScanStatus, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  sent: { label: "Đã gửi", icon: "checkmark-circle-outline" },
  filtered: { label: "Đã lọc", icon: "funnel-outline" },
  no_change: { label: "Chưa thay đổi", icon: "remove-circle-outline" },
  related: { label: "Chỉ có tin liên quan", icon: "git-branch-outline" },
  no_result: { label: "Không có kết quả", icon: "search-outline" },
  error: { label: "Lỗi", icon: "warning-outline" },
  quota: { label: "Chờ AI", icon: "hourglass-outline" },
};

// "x phút/giờ/ngày trước" cho dòng "Quét lần cuối" — người dùng thấy ngay rule còn sống không.
function timeAgoVi(iso?: string | null): string {
  if (!iso) return "Chưa quét lần nào";
  const diffMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diffMs)) return "Chưa quét lần nào";
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

// Nhãn tiếng Việt cho bản tóm tắt "AI định đổi gì" trước khi áp dụng.
const EDIT_LABELS: Record<string, string> = {
  title: "Tên",
  description: "Mô tả",
  keyword: "Từ khóa",
  category: "Danh mục",
  sources: "Nguồn",
  condition: "Điều kiện",
  remind_at: "Thời điểm nhắc",
  watch_url: "Trang theo dõi",
};

export default function RuleDetailScreen() {
  // grant=1: đến từ nút "Cấp quyền truy cập" trên thông báo 🔒 → làm nổi khối cấp quyền.
  const { id, grant } = useLocalSearchParams<{ id: string; grant?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [rule, setRule] = useState<Rule | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [scanLogs, setScanLogs] = useState<RuleScanLog[]>([]);
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editKeyword, setEditKeyword] = useState("");
  const [editCategory, setEditCategory] = useState("news");
  const [editSources, setEditSources] = useState("");
  const [editFrequency, setEditFrequency] = useState("daily");
  const [editCondition, setEditCondition] = useState("");
  const [saving, setSaving] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [previewingEdit, setPreviewingEdit] = useState(false);
  const [editPreview, setEditPreview] = useState<RulePreviewResult | null>(null);

  // "Cấp quyền đăng nhập" cho rule theo dõi trang web (source_type 'url'): người dùng
  // dán Cookie/headers → server fetch trang kèm các header này. Lưu ở cột watch_auth.
  const [authDraft, setAuthDraft] = useState("");
  const [savingAuth, setSavingAuth] = useState(false);

  // "Sửa nhanh bằng chat": gõ yêu cầu tự nhiên ("đổi sang 7h sáng") → AI trả bản rule
  // đã sửa → xem tóm tắt thay đổi → xác nhận là lưu, khỏi chỉnh từng ô tay.
  const [aiDraft, setAiDraft] = useState("");
  const [aiEditing, setAiEditing] = useState(false);

  useEffect(() => {
    if (id) fetchData();
    // Chỉ fetch lại khi đổi id — không đưa fetchData vào deps để khỏi tạo lại mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setEditPreview(null);
  }, [editTitle, editDescription, editKeyword, editCategory, editSources, editFrequency, editCondition]);

  const fetchData = async () => {
    setLoading(true);

    const [ruleRes, notifRes, scanRes] = await Promise.all([
      supabase.from("rules").select("*").eq("id", id).single(),
      supabase.from("notifications").select("*").eq("rule_id", id)
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("rule_scan_logs").select("*").eq("rule_id", id)
        .order("started_at", { ascending: false }).limit(20),
    ]);

    if (ruleRes.data) {
      setRule(ruleRes.data as Rule);
      setAuthDraft((ruleRes.data as Rule).watch_auth ?? "");
    }
    if (notifRes.data) {
      setNotifications(notifRes.data as Notification[]);
    }
    if (scanRes.data) {
      setScanLogs(scanRes.data as RuleScanLog[]);
    }

    setLoading(false);
  };

  const toggleActive = async () => {
    if (!rule) return;

    const newValue = !rule.is_active;
    setRule({ ...rule, is_active: newValue });

    const { error } = await supabase
      .from("rules")
      .update({ is_active: newValue })
      .eq("id", rule.id);
    if (error) {
      setRule(rule);
      alertMessage("Chưa cập nhật được", error.message);
    }
  };

  // "Để êm": rule vẫn chạy & vẫn nhận thông báo trong app, chỉ KHÔNG đẩy push về máy.
  const toggleMuted = async () => {
    if (!rule) return;

    const newValue = !rule.muted;
    setRule({ ...rule, muted: newValue });

    const { error } = await supabase
      .from("rules")
      .update({ muted: newValue })
      .eq("id", rule.id);

    if (error) {
      // Cột chưa có (migration 0010 chưa chạy) → khôi phục trạng thái + báo nhẹ.
      setRule({ ...rule, muted: !newValue });
      alertMessage("Chưa bật được", "Cần chạy migration 0010 (cột muted) trong Supabase trước.");
    }
  };

  // Chế độ thông báo: "all" (đầy đủ) ⇄ "important" (chỉ báo tin quan trọng, bỏ tin lặp/không có gì mới).
  const toggleNotifyMode = async () => {
    if (!rule) return;

    const newValue = rule.notify_mode === "important" ? "all" : "important";
    setRule({ ...rule, notify_mode: newValue });

    const { error } = await supabase
      .from("rules")
      .update({ notify_mode: newValue })
      .eq("id", rule.id);

    if (error) {
      // Cột chưa có (migration 0015 chưa chạy) → khôi phục + báo nhẹ.
      setRule({ ...rule, notify_mode: rule.notify_mode });
      alertMessage("Chưa đổi được", "Cần chạy migration 0015 (cột notify_mode) trong Supabase trước.");
    }
  };

  // Lưu quyền truy cập (Cookie/headers) cho trang cần đăng nhập. Chuỗi rỗng = thu hồi.
  const saveWatchAuthWith = async (raw: string) => {
    if (!rule) return;
    setSavingAuth(true);

    const value = raw.trim() || null;
    const { error } = await supabase
      .from("rules")
      .update({ watch_auth: value })
      .eq("id", rule.id);

    setSavingAuth(false);

    if (error) {
      alertMessage("Chưa lưu được", "Cần chạy migration 0018 (cột watch_url/watch_auth) trong Supabase trước.");
      return;
    }
    setRule({ ...rule, watch_auth: value ?? undefined });
    alertMessage(
      value ? "Đã cho phép" : "Đã thu hồi quyền",
      value
        ? "Hệ thống sẽ đọc trang bằng phiên đăng nhập của bạn từ các lần quét tới. Phiên hết hạn thì app sẽ tự báo để bạn cấp lại."
        : "Đã xóa phiên đăng nhập đã lưu. Trang cần đăng nhập sẽ không đọc được nữa."
    );
  };

  const saveWatchAuth = () => saveWatchAuthWith(authDraft);

  // "Không cho phép": tạm dừng rule — hệ thống ngừng quét trang này và thôi nhắc cấp quyền.
  const denyWatchAuth = async () => {
    if (!rule) return;
    setRule({ ...rule, is_active: false });
    const { error } = await supabase.from("rules").update({ is_active: false }).eq("id", rule.id);
    if (error) {
      setRule(rule);
      alertMessage("Chưa tạm dừng được", error.message);
      return;
    }
    alertMessage(
      "Đã tạm dừng rule",
      "Rule sẽ không theo dõi trang này nữa và bạn sẽ không bị nhắc cấp quyền. Muốn theo dõi lại, bật công tắc của rule bất cứ lúc nào."
    );
  };

  // Sửa rule bằng chat: gửi rule hiện tại + yêu cầu → AI trả bản đầy đủ đã sửa →
  // chỉ update những cột THỰC SỰ đổi (kèm xác nhận). Mơ hồ thì AI hỏi lại.
  const handleAiEdit = async () => {
    if (!rule || !aiDraft.trim()) return;
    setAiEditing(true);
    try {
      const res = await editRuleAI(
        {
          title: rule.title,
          description: rule.description,
          keyword: rule.keyword,
          category: rule.category ?? "other",
          sources: rule.sources ?? "",
          frequency: rule.frequency ?? "1440",
          run_at: rule.run_at ?? "",
          condition: rule.condition ?? "",
          source_type: rule.source_type ?? "",
          remind_at: rule.remind_at ?? "",
          watch_url: rule.watch_url ?? "",
        },
        aiDraft.trim(),
      );

      if (res.status !== "ready" || res.rules.length === 0) {
        alertMessage("AI cần hỏi lại", res.message);
        return;
      }
      const d: RuleDraft = res.rules[0];

      // So từng trường với giá trị hiện tại — chỉ đổi cái khác.
      const upd: Record<string, string> = {};
      const plain: (keyof RuleDraft & keyof Rule)[] = [
        "title", "description", "keyword", "category", "sources", "frequency", "run_at", "condition",
      ];
      for (const k of plain) {
        const next = String(d[k] ?? "").trim();
        if (next !== String(rule[k] ?? "").trim()) upd[k] = next;
      }
      // remind_at so theo THỜI ĐIỂM (DB trả UTC, AI trả +07:00 — cùng khoảnh khắc thì thôi).
      if (rule.source_type === "reminder" && d.remind_at &&
          Date.parse(d.remind_at) !== Date.parse(rule.remind_at ?? "")) {
        upd.remind_at = d.remind_at;
      }
      // watch_url chỉ đổi khi vẫn là rule url (không cho chat đổi loại rule).
      if (rule.source_type === "url" && d.watch_url && d.watch_url !== (rule.watch_url ?? "")) {
        upd.watch_url = d.watch_url;
      }

      if (Object.keys(upd).length === 0) {
        alertMessage("Không có gì để đổi", res.message || "Rule đã đúng như yêu cầu rồi.");
        return;
      }

      // Tóm tắt thay đổi cho người dùng duyệt. Tần suất + giờ gộp thành 1 dòng "Lịch" dễ hiểu.
      const lines: string[] = [];
      if (upd.frequency !== undefined || upd.run_at !== undefined) {
        lines.push(`• Lịch: ${formatSchedule(rule.frequency, rule.run_at)} → ${formatSchedule(d.frequency, d.run_at)}`);
      }
      for (const [k, v] of Object.entries(upd)) {
        if (k === "frequency" || k === "run_at") continue;
        lines.push(`• ${EDIT_LABELS[k] ?? k}: ${String((rule as unknown as Record<string, unknown>)[k] ?? "") || "(trống)"} → ${v}`);
      }
      const ok = await confirmAsync("Áp dụng thay đổi?", `${res.message}\n\n${lines.join("\n")}`, "Áp dụng");
      if (!ok) return;

      const { error } = await supabase.from("rules").update(upd).eq("id", rule.id);
      if (error) {
        alertMessage("Chưa lưu được", error.message);
        return;
      }
      setRule({ ...rule, ...upd });
      setAiDraft("");
      alertMessage("Đã cập nhật rule", res.message);
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      alertMessage(
        "Lỗi",
        /fetch|network/i.test(msg) ? "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." : msg,
      );
    } finally {
      setAiEditing(false);
    }
  };

  const startEditing = () => {
    if (!rule) return;
    setEditTitle(rule.title);
    setEditDescription(rule.description);
    setEditKeyword(rule.keyword);
    setEditCategory(rule.category ?? "news");
    setEditSources(rule.sources ?? "");
    setEditFrequency(toFreqKey(rule.frequency));
    setEditCondition(rule.condition ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!rule || !editTitle.trim()) {
      alertMessage("Lỗi", "Tên rule không được để trống");
      return;
    }

    setSaving(true);

    const updated = {
      title: editTitle.trim(),
      description: editDescription.trim(),
      keyword: editKeyword.trim(),
      category: editCategory,
      sources: editSources.trim(),
      frequency: editFrequency,
      condition: editCondition.trim(),
    };

    const { error } = await supabase
      .from("rules")
      .update(updated)
      .eq("id", rule.id);

    if (error) {
      alertMessage("Lỗi", error.message);
    } else {
      setRule({ ...rule, ...updated });
      setIsEditing(false);
    }

    setSaving(false);
  };

  const handlePreviewEdit = async () => {
    if (!rule || !editTitle.trim() || !editKeyword.trim()) {
      alertMessage("Chưa đủ thông tin", "Nhập tên rule và từ khóa trước khi xem thử.");
      return;
    }
    setPreviewingEdit(true);
    try {
      setEditPreview(await previewRule({
        title: editTitle.trim(),
        description: editDescription.trim() || `Theo dõi ${editKeyword.trim()}`,
        keyword: editKeyword.trim(),
        category: editCategory,
        sources: editSources.trim(),
        frequency: editFrequency,
        run_at: rule.run_at ?? "",
        condition: editCondition.trim(),
        notify_mode: rule.notify_mode ?? "all",
        source_type: rule.source_type ?? "search",
        remind_at: rule.remind_at ?? "",
        watch_url: rule.watch_url ?? "",
      }, rule.id));
    } catch (err) {
      alertMessage("Chưa xem thử được", String((err as Error).message ?? err));
    } finally {
      setPreviewingEdit(false);
    }
  };

  const handleRunMonitor = async () => {
    if (!rule) return;
    setMonitoring(true);

    try {
      const { inserted, checked, quotaHit } = await runMonitorForRule(rule);

      if (quotaHit && inserted === 0) {
        alertMessage(
          "AI đang quá tải",
          "Hệ thống AI tạm hết lượt (giới hạn miễn phí). Bạn thử lại sau ít phút nhé — tin vẫn được quét tự động ở nền."
        );
      } else if (checked === 0) {
        alertMessage("Không có tin", "Chưa tìm thấy bài viết nào cho từ khóa này.");
      } else if (inserted === 0) {
        alertMessage("Đã cập nhật", "Không có tin mới — tất cả bài tìm được đã có trong thông báo.");
      } else {
        alertMessage("Thành công", `Đã tạo ${inserted} thông báo mới từ tin thật!`);
      }
      await fetchData();
    } catch (err: any) {
      alertMessage("Lỗi", err.message?.includes("fetch") || err.message?.includes("Network")
        ? "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
        : err.message);
    } finally {
      setMonitoring(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmAsync("Xóa rule", "Bạn có chắc muốn xóa rule này?");
    if (!ok) return;

    setSaving(true);

    // Thông báo con tự xóa theo nhờ FK ON DELETE CASCADE (migration 0014).
    const { data, error } = await supabase
      .from("rules")
      .delete()
      .eq("id", id)
      .select();

    setSaving(false);

    if (error) {
      alertMessage("Không xóa được", error.message);
      return;
    }

    if (!data || data.length === 0) {
      alertMessage("Không xóa được", "Rule không bị xóa. Có thể do chính sách bảo mật (RLS) chưa cho phép DELETE.");
      return;
    }

    router.back();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!rule) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.subText }}>Không tìm thấy rule</Text>
      </View>
    );
  }

  const cat = findCategory(rule.category);
  // Rule theo dõi TRANG WEB cụ thể (source_type 'url' — hoặc rule cũ có URL trong keyword).
  const isUrlRule = rule.source_type === "url" || Boolean(rule.watch_url);
  const nextScanMs = nextDueAt(rule);
  const nextScanText = !rule.is_active
    ? "Đang tạm dừng"
    : Number.isFinite(nextScanMs) && nextScanMs <= Date.now() + 60000
      ? "Đang chờ lượt quét gần nhất"
      : Number.isFinite(nextScanMs)
        ? new Date(nextScanMs).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
        : "Chưa xác định";
  const scanStatusColor = (status: RuleScanStatus) => {
    if (status === "sent") return colors.success;
    if (status === "error") return colors.danger;
    if (status === "quota") return colors.warning;
    if (status === "no_change" || status === "no_result") return colors.subText;
    return colors.primary;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          {isEditing ? (
            <TextInput
              style={styles.editTitleInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Tên rule"
              placeholderTextColor={colors.subText}
            />
          ) : (
            <Text style={styles.title}>{rule.title}</Text>
          )}

          {isEditing ? (
            <TextInput
              style={styles.editSubtitleInput}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Mô tả"
              placeholderTextColor={colors.subText}
              multiline
            />
          ) : (
            <Text style={styles.subtitle}>{rule.description}</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={isEditing ? handleSaveEdit : startEditing}
          style={styles.editButton}
          disabled={saving}
        >
          <Ionicons
            name={isEditing ? "checkmark-outline" : "pencil-outline"}
            size={24}
            color={isEditing ? colors.success : colors.subText}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleActive}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View pointerEvents="none">
            <Switch
              value={rule.is_active}
              thumbColor={rule.is_active ? colors.primary : "#999"}
              trackColor={{ true: colors.primary + "66", false: colors.border }}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* CATEGORY BADGE */}
      {!isEditing && (
        <View style={[styles.catBadge, { backgroundColor: cat.color + "22", borderColor: cat.color }]}>
          <Ionicons name={cat.icon} size={16} color={cat.color} />
          <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.label}</Text>
        </View>
      )}

      {/* RULE INFO */}
      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Thông tin rule</Text>

        {/* Từ khóa */}
        <View style={styles.infoRow}>
          <Text style={styles.label}>Từ khóa</Text>
          {isEditing ? (
            <TextInput
              style={styles.editInlineInput}
              value={editKeyword}
              onChangeText={setEditKeyword}
              placeholder="Từ khóa"
              placeholderTextColor={colors.subText}
            />
          ) : (
            <Text style={styles.value}>{rule.keyword}</Text>
          )}
        </View>

        {/* Trang web theo dõi (rule url) */}
        {!isEditing && rule.watch_url ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Trang theo dõi</Text>
            <Text style={[styles.value, styles.valueRight]} numberOfLines={2}>{rule.watch_url}</Text>
          </View>
        ) : null}

        {/* Danh mục (khi edit) */}
        {isEditing && (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Danh mục</Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((c) => {
                const active = c.key === editCategory;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.chip, active && { backgroundColor: c.color, borderColor: c.color }]}
                    onPress={() => setEditCategory(c.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={c.icon} size={14} color={active ? "white" : colors.subText} />
                    <Text style={[styles.chipText, active && { color: "white" }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Tần suất */}
        {isEditing ? (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Tần suất</Text>
            <View style={styles.chipWrap}>
              {FREQUENCIES.map((f) => {
                const active = f.key === editFrequency;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setEditFrequency(f.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && { color: "white" }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Tần suất</Text>
            <Text style={styles.value}>{formatSchedule(rule.frequency, rule.run_at)}</Text>
          </View>
        )}

        {/* Nguồn */}
        {isEditing ? (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Nguồn theo dõi</Text>
            <TextInput
              style={styles.editFullInput}
              value={editSources}
              onChangeText={setEditSources}
              placeholder="VD: VnExpress, CafeF"
              placeholderTextColor={colors.subText}
            />
          </View>
        ) : rule.sources ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Nguồn</Text>
            <Text style={[styles.value, styles.valueRight]}>{rule.sources}</Text>
          </View>
        ) : null}

        {/* Điều kiện */}
        {isEditing ? (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Điều kiện kích hoạt</Text>
            <TextInput
              style={[styles.editFullInput, { height: 70, textAlignVertical: "top" }]}
              value={editCondition}
              onChangeText={setEditCondition}
              placeholder="VD: khi giá vượt 80 triệu"
              placeholderTextColor={colors.subText}
              multiline
            />
          </View>
        ) : rule.condition ? (
          <View style={styles.conditionBlock}>
            <Text style={styles.label}>Điều kiện kích hoạt</Text>
            <Text style={styles.conditionText}>{rule.condition}</Text>
          </View>
        ) : null}

        {isEditing ? (
          <RulePreviewPanel
            result={editPreview}
            loading={previewingEdit}
            onPreview={handlePreviewEdit}
            disabled={saving}
          />
        ) : null}

        {/* Trạng thái — nhắc hẹn đã bắn xong hiện "Đã nhắc xong" thay vì "Tạm dừng" khó hiểu */}
        <View style={styles.infoRow}>
          <Text style={styles.label}>Trạng thái</Text>
          <Text style={[styles.value, { color: rule.is_active ? colors.success : colors.subText }]}>
            {rule.is_active
              ? "Đang hoạt động"
              : rule.source_type === "reminder" && rule.last_run_at && rule.remind_at &&
                  Date.parse(rule.last_run_at) >= Date.parse(rule.remind_at)
              ? "Đã nhắc xong"
              : "Tạm dừng"}
          </Text>
        </View>

        {rule.created_at && !isEditing && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Ngày tạo</Text>
            <Text style={styles.value}>
              {new Date(rule.created_at).toLocaleDateString("vi-VN")}
            </Text>
          </View>
        )}

        {/* SỨC KHỎE RULE: lần quét gần nhất + lỗi (nếu có) — trả lời câu "sao rule im?" */}
        {!isEditing && rule.source_type !== "reminder" && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Quét lần cuối</Text>
            <Text style={styles.value}>{timeAgoVi(rule.last_run_at)}</Text>
          </View>
        )}
        {!isEditing && rule.source_type !== "reminder" && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Quét tiếp theo</Text>
            <Text style={[styles.value, styles.valueRight]}>{nextScanText}</Text>
          </View>
        )}
        {!isEditing && rule.last_error ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.errorText}>
              Lần quét gần nhất gặp lỗi: {rule.last_error}. Hệ thống sẽ tự thử lại theo lịch — lỗi lặp lại nhiều lần thì kiểm tra lại nguồn/link của rule.
            </Text>
          </View>
        ) : null}
      </View>

      {/* SỬA NHANH BẰNG CHAT — gõ yêu cầu tự nhiên, AI tự đổi đúng phần cần đổi */}
      {!isEditing && (
        <View style={styles.aiEditCard}>
          <View style={styles.authHeader}>
            <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
            <Text style={styles.authTitle}>Sửa nhanh bằng chat</Text>
          </View>
          <TextInput
            style={styles.authInput}
            value={aiDraft}
            onChangeText={setAiDraft}
            placeholder={'VD: "đổi sang 7h sáng", "chỉ báo khi giảm hơn 3%", "thêm nguồn CafeF"...'}
            placeholderTextColor={colors.subText}
            multiline
            editable={!aiEditing}
          />
          <View style={styles.authActions}>
            <TouchableOpacity
              style={[styles.authSaveBtn, (aiEditing || !aiDraft.trim()) && { opacity: 0.6 }]}
              onPress={handleAiEdit}
              disabled={aiEditing || !aiDraft.trim()}
            >
              <Text style={styles.authSaveText}>{aiEditing ? "Đang xử lý..." : "Sửa rule"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isEditing && (
        <TouchableOpacity
          style={styles.cancelEditBtn}
          onPress={() => setIsEditing(false)}
          disabled={saving}
        >
          <Text style={styles.cancelEditText}>Hủy chỉnh sửa</Text>
        </TouchableOpacity>
      )}

      {/* ACTION BUTTONS — đưa lên trên danh sách thông báo */}
      {!isEditing && (
        <>
          {/* RUN MONITOR BUTTON */}
          {rule.is_active && (
            <TouchableOpacity
              style={[styles.monitorButton, monitoring && { opacity: 0.6 }]}
              onPress={handleRunMonitor}
              disabled={monitoring}
            >
              <Ionicons
                name={monitoring ? "sync-outline" : "search-outline"}
                size={20}
                color={colors.primary}
              />
              <Text style={styles.monitorText}>
                {monitoring ? "Đang quét tin..." : "Kiểm tra tin ngay"}
              </Text>
            </TouchableOpacity>
          )}

          {/* NOTIFY MODE — lọc thông báo rác: chỉ báo tin quan trọng / thỏa điều kiện */}
          <TouchableOpacity
            style={[styles.muteButton, rule.notify_mode === "important" && styles.notifyModeOn]}
            onPress={toggleNotifyMode}
            activeOpacity={0.8}
          >
            <Ionicons
              name={rule.notify_mode === "important" ? "funnel" : "funnel-outline"}
              size={20}
              color={rule.notify_mode === "important" ? colors.primary : colors.subText}
            />
            <Text style={[styles.muteText, rule.notify_mode === "important" && { color: colors.primary }]}>
              {rule.notify_mode === "important"
                ? "Chỉ báo tin quan trọng — bật lại đầy đủ"
                : "Chỉ báo tin quan trọng (lọc tin rác/lặp)"}
            </Text>
          </TouchableOpacity>

          {/* CẤP QUYỀN TRUY CẬP — chỉ rule theo dõi trang web. Flow: app tự phát hiện trang
              cần đăng nhập rồi báo; người dùng vào đây chọn CHO PHÉP (dán Cookie) hoặc
              KHÔNG (tạm dừng rule, hết bị nhắc). */}
          {isUrlRule && (
            <View style={[styles.authCard, grant === "1" && styles.authCardFocused]}>
              <View style={styles.authHeader}>
                <Ionicons
                  name={rule.watch_auth ? "lock-open-outline" : "lock-closed-outline"}
                  size={18}
                  color={rule.watch_auth ? colors.success : colors.warning}
                />
                <Text style={styles.authTitle}>Cấp quyền truy cập trang</Text>
                {rule.watch_auth ? <Text style={styles.authGranted}>Đã cho phép</Text> : null}
              </View>
              <Text style={styles.authHint}>
                {rule.watch_auth
                  ? "Hệ thống đang đọc trang bằng phiên đăng nhập bạn đã cấp. Hết hạn thì app sẽ tự báo để bạn cấp lại."
                  : "Trang này cần đăng nhập mới xem được. Cho phép app đọc bằng tài khoản của bạn: (1) bấm “Mở trang” và đăng nhập; (2) copy Cookie của trang (trên máy tính: F12 → Network → chọn request đầu → copy dòng Cookie); (3) dán vào ô dưới rồi bấm Cho phép. Cookie chỉ mình bạn và hệ thống quét đọc được."}
              </Text>
              {rule.watch_url ? (
                <TouchableOpacity
                  style={styles.authOpenBtn}
                  onPress={() =>
                    // Mobile: mở trang TRONG APP (WebView) — đăng nhập xong bấm 1 nút là
                    // cấp quyền, khỏi copy Cookie tay. Web: trình duyệt chặn đọc phiên
                    // trang khác → vẫn mở tab mới + dán Cookie thủ công.
                    Platform.OS === "web"
                      ? Linking.openURL(rule.watch_url!)
                      : router.push({
                          pathname: "/grant-login",
                          params: { id: rule.id, url: rule.watch_url! },
                        })
                  }
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={16} color={colors.primary} />
                  <Text style={styles.authOpenText}>
                    {Platform.OS === "web" ? "Mở trang để đăng nhập" : "Đăng nhập trong app (1 chạm)"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TextInput
                style={styles.authInput}
                value={authDraft}
                onChangeText={setAuthDraft}
                placeholder="Dán Cookie vào đây (VD: session=abc123; token=xyz...)"
                placeholderTextColor={colors.subText}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.authActions}>
                {rule.watch_auth ? (
                  // Đã cấp: cho thu hồi (xóa cookie đã lưu) hoặc cập nhật cookie mới.
                  <TouchableOpacity
                    style={styles.authClearBtn}
                    onPress={() => { setAuthDraft(""); saveWatchAuthWith(""); }}
                    disabled={savingAuth}
                  >
                    <Text style={styles.authClearText}>Thu hồi quyền</Text>
                  </TouchableOpacity>
                ) : (
                  // Chưa cấp: "Không cho phép" = tạm dừng rule để hệ thống thôi nhắc.
                  <TouchableOpacity
                    style={styles.authClearBtn}
                    onPress={denyWatchAuth}
                    disabled={savingAuth}
                  >
                    <Text style={styles.authClearText}>Không cho phép</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.authSaveBtn, (savingAuth || !authDraft.trim()) && { opacity: 0.6 }]}
                  onPress={saveWatchAuth}
                  disabled={savingAuth || !authDraft.trim()}
                >
                  <Text style={styles.authSaveText}>
                    {savingAuth ? "Đang lưu..." : rule.watch_auth ? "Cập nhật" : "Cho phép"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* MUTE BUTTON — vẫn nhận tin trong app, chỉ tắt push về máy */}
          <TouchableOpacity
            style={[styles.muteButton, rule.muted && styles.muteButtonOn]}
            onPress={toggleMuted}
            activeOpacity={0.8}
          >
            <Ionicons
              name={rule.muted ? "notifications-off" : "notifications-outline"}
              size={20}
              color={rule.muted ? colors.warning : colors.subText}
            />
            <Text style={[styles.muteText, rule.muted && { color: colors.warning }]}>
              {rule.muted ? "Đang để êm — bật lại push" : "Tắt push (vẫn nhận tin trong app)"}
            </Text>
          </TouchableOpacity>

          {/* DELETE BUTTON */}
          <TouchableOpacity
            style={[styles.deleteButton, saving && { opacity: 0.6 }]}
            onPress={handleDelete}
            disabled={saving}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={styles.deleteText}>{saving ? "Đang xóa..." : "Xóa rule"}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* LỊCH SỬ HOẠT ĐỘNG — giải thích mỗi lượt quét có gửi, bị lọc hay gặp lỗi. */}
      {!isEditing && (
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Lịch sử hoạt động</Text>
          {scanLogs.length === 0 ? (
            <View style={styles.historyEmpty}>
              <Ionicons name="pulse-outline" size={22} color={colors.subText} />
              <Text style={styles.historyEmptyText}>
                Chưa có lịch sử quét. Dữ liệu sẽ xuất hiện sau lượt kiểm tra tiếp theo.
              </Text>
            </View>
          ) : (
            scanLogs.map((log, index) => {
              const meta = SCAN_STATUS_UI[log.status] ?? SCAN_STATUS_UI.filtered;
              const statusColor = scanStatusColor(log.status);
              return (
                <View key={log.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={[styles.historyBadge, { backgroundColor: statusColor + "18" }]}>
                      <Ionicons name={meta.icon} size={16} color={statusColor} />
                      <Text style={[styles.historyBadgeText, { color: statusColor }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.historyTime}>
                      {new Date(log.started_at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
                    </Text>
                  </View>
                  <Text style={styles.historyReason}>{log.reason}</Text>
                  {log.candidate_title ? (
                    <Text style={styles.historyCandidate} numberOfLines={2}>
                      Kết quả: {log.candidate_title}
                    </Text>
                  ) : null}
                  <Text style={styles.historyMeta}>
                    {log.trigger === "manual" ? "Kiểm tra thủ công" : "Quét tự động"}
                    {` · ${log.duration_ms < 1000 ? `${log.duration_ms} ms` : `${(log.duration_ms / 1000).toFixed(1)} giây`}`}
                  </Text>
                  {index === 0 && rule.is_active && (log.status === "error" || log.status === "quota") ? (
                    <TouchableOpacity
                      style={[styles.historyRetry, monitoring && { opacity: 0.6 }]}
                      onPress={handleRunMonitor}
                      disabled={monitoring}
                    >
                      <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                      <Text style={styles.historyRetryText}>{monitoring ? "Đang thử lại..." : "Thử lại ngay"}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* RECENT NOTIFICATIONS */}
      {!isEditing && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Thông báo gần đây</Text>

          {notifications.length === 0 ? (
            <View style={styles.emptyNotif}>
              <Text style={{ color: colors.subText }}>Chưa có thông báo nào</Text>
            </View>
          ) : (
            (showAllNotifs ? notifications : notifications.slice(0, 5)).map((notif) => (
              <TouchableOpacity
                key={notif.id}
                style={styles.notificationCard}
                onPress={() =>
                  router.push({ pathname: "/notification-detail", params: { id: notif.id } })
                }
              >
                <View style={styles.topRow}>
                  <Ionicons name="notifications" size={20} color={colors.primary} />
                  {notif.created_at && (
                    <Text style={styles.time}>
                      {new Date(notif.created_at).toLocaleDateString("vi-VN")}
                    </Text>
                  )}
                </View>

                <Text style={styles.notificationTitle}>{notif.title}</Text>
                <Text style={styles.notificationDesc} numberOfLines={2}>{notif.content}</Text>
              </TouchableOpacity>
            ))
          )}

          {/* XEM TẤT CẢ / THU GỌN — chỉ khi có hơn 5 thông báo */}
          {notifications.length > 5 && (
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => setShowAllNotifs((v) => !v)}
              activeOpacity={0.8}
            >
              <Text style={styles.seeAllText}>
                {showAllNotifs
                  ? "Thu gọn"
                  : `Xem tất cả thông báo (${notifications.length})`}
              </Text>
              <Ionicons
                name={showAllNotifs ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: "center",
      alignItems: "center",
    },
    container: {
      flex: 1,
      backgroundColor: C.background,
      paddingTop: 70,
      paddingHorizontal: 20,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    headerText: {
      flex: 1,
      marginLeft: 14,
    },
    title: {
      color: C.text,
      fontSize: 24,
      fontWeight: "bold",
    },
    subtitle: {
      color: C.subText,
      marginTop: 6,
    },
    editTitleInput: {
      color: C.text,
      fontSize: 22,
      fontWeight: "bold",
      borderBottomWidth: 1,
      borderBottomColor: C.primary,
      paddingVertical: 4,
      marginBottom: 4,
    },
    editSubtitleInput: {
      color: C.subText,
      fontSize: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      paddingVertical: 2,
      marginTop: 4,
    },
    editInlineInput: {
      color: C.text,
      fontSize: 14,
      fontWeight: "600",
      borderBottomWidth: 1,
      borderBottomColor: C.primary,
      paddingVertical: 2,
      minWidth: 120,
      textAlign: "right",
    },
    editFullInput: {
      backgroundColor: C.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C.text,
      fontSize: 14,
      borderWidth: 1,
      borderColor: C.border,
      marginTop: 8,
    },
    editBlock: {
      marginBottom: 16,
    },
    editButton: {
      marginRight: 10,
      padding: 4,
    },
    catBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 20,
    },
    catBadgeText: {
      fontSize: 13,
      fontWeight: "bold",
    },
    infoCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 20,
      marginBottom: 22,
    },
    cardTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 18,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    label: {
      color: C.subText,
    },
    value: {
      color: C.text,
      fontWeight: "600",
    },
    valueRight: {
      flex: 1,
      textAlign: "right",
      marginLeft: 16,
    },
    conditionBlock: {
      marginBottom: 14,
    },
    conditionText: {
      color: C.text,
      fontWeight: "500",
      marginTop: 6,
      lineHeight: 21,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.inputBg,
    },
    chipText: {
      color: C.subText,
      fontSize: 12,
      fontWeight: "600",
    },
    cancelEditBtn: {
      alignItems: "center",
      paddingVertical: 14,
      marginBottom: 10,
    },
    cancelEditText: {
      color: C.subText,
      fontSize: 15,
      fontWeight: "600",
    },
    sectionTitle: {
      color: C.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 18,
    },
    emptyNotif: {
      alignItems: "center",
      paddingVertical: 24,
    },
    historySection: {
      marginTop: 24,
    },
    historyEmpty: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 18,
    },
    historyEmptyText: {
      flex: 1,
      color: C.subText,
      lineHeight: 20,
    },
    historyCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    historyHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 10,
    },
    historyBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    historyBadgeText: {
      fontSize: 12,
      fontWeight: "700",
    },
    historyTime: {
      flex: 1,
      color: C.subText,
      fontSize: 12,
      textAlign: "right",
    },
    historyReason: {
      color: C.text,
      lineHeight: 20,
    },
    historyCandidate: {
      color: C.subText,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 7,
    },
    historyMeta: {
      color: C.subText,
      fontSize: 12,
      marginTop: 9,
    },
    historyRetry: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: C.primary + "12",
    },
    historyRetryText: {
      color: C.primary,
      fontSize: 13,
      fontWeight: "700",
    },
    notificationCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 18,
      marginBottom: 18,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    time: {
      color: C.subText,
    },
    notificationTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: "bold",
      marginBottom: 8,
    },
    notificationDesc: {
      color: C.subText,
      lineHeight: 22,
    },
    monitorButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 12,
      marginBottom: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.primary,
      backgroundColor: C.primary + "11",
    },
    monitorText: {
      color: C.primary,
      fontSize: 16,
      fontWeight: "600",
    },
    muteButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 12,
      marginBottom: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    muteButtonOn: {
      borderColor: C.warning,
      backgroundColor: C.warning + "11",
    },
    notifyModeOn: {
      borderColor: C.primary,
      backgroundColor: C.primary + "11",
    },
    muteText: {
      color: C.subText,
      fontSize: 16,
      fontWeight: "600",
    },
    authCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginTop: 12,
      marginBottom: 8,
    },
    aiEditCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 22,
    },
    errorBox: {
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-start",
      backgroundColor: C.warning + "15",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.warning + "55",
      padding: 12,
      marginTop: 4,
    },
    errorText: {
      flex: 1,
      color: C.text,
      fontSize: 13,
      lineHeight: 19,
    },
    authCardFocused: {
      borderColor: C.primary,
      borderWidth: 2,
    },
    authOpenBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.primary,
      backgroundColor: C.primary + "11",
      marginBottom: 10,
    },
    authOpenText: {
      color: C.primary,
      fontSize: 13,
      fontWeight: "600",
    },
    authHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    authTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "600",
      flex: 1,
    },
    authGranted: {
      color: C.success,
      fontSize: 12,
      fontWeight: "700",
    },
    authHint: {
      color: C.subText,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 10,
    },
    authInput: {
      backgroundColor: C.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: C.text,
      fontSize: 13,
      minHeight: 64,
      textAlignVertical: "top",
    },
    authActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 10,
    },
    authClearBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    authClearText: {
      color: C.subText,
      fontWeight: "600",
    },
    authSaveBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: C.primary,
    },
    authSaveText: {
      color: "white",
      fontWeight: "700",
    },
    deleteButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 12,
      marginBottom: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.danger,
      backgroundColor: C.danger + "11",
    },
    deleteText: {
      color: C.danger,
      fontSize: 16,
      fontWeight: "600",
    },
    seeAllButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 14,
      marginTop: 4,
    },
    seeAllText: {
      color: C.primary,
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
