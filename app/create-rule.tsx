import React, { useMemo, useRef, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { alertMessage } from "../lib/dialog";
import { chatRule, RuleDraft } from "../lib/ruleAI";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { findCategory, formatSchedule } from "../lib/ruleOptions";
import { SCREEN, RADIUS, type AppColors } from "../lib/theme";
import SuggestionChip from "../components/SuggestionChip";

interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

const SUGGESTIONS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Theo dõi giá iPhone trên Shopee", icon: "phone-portrait-outline" },
  { label: "Theo dõi tin tức về AI mới nhất", icon: "newspaper-outline" },
  { label: "Thông báo deadline bài tập", icon: "school-outline" },
];

// Mẫu rule TẠO NGAY: bấm 1 chạm là tạo luôn, KHÔNG gọi AI (chạy được cả khi kẹt quota Gemini).
interface TemplateRule {
  title: string;
  keyword: string;
  category: string;
  frequency: string;
  run_at?: string | null;
  condition?: string;
}
const QUICK_TEMPLATES: { label: string; icon: keyof typeof Ionicons.glyphMap; rule: TemplateRule }[] = [
  { label: "Giá vàng", icon: "cash-outline", rule: { title: "Giá vàng SJC", keyword: "giá vàng SJC hôm nay", category: "finance", frequency: "1440", run_at: "08:00" } },
  { label: "Tỷ giá USD", icon: "card-outline", rule: { title: "Tỷ giá USD", keyword: "tỷ giá USD/VND hôm nay", category: "finance", frequency: "1440", run_at: "08:00" } },
  { label: "Giá Bitcoin", icon: "logo-bitcoin", rule: { title: "Giá Bitcoin", keyword: "giá Bitcoin BTC hôm nay", category: "finance", frequency: "480" } },
  { label: "Giá xăng", icon: "car-outline", rule: { title: "Giá xăng dầu", keyword: "giá xăng dầu Việt Nam hôm nay", category: "news", frequency: "1440", run_at: "08:00" } },
  { label: "Thời tiết Hà Nội", icon: "partly-sunny-outline", rule: { title: "Thời tiết Hà Nội", keyword: "dự báo thời tiết Hà Nội hôm nay", category: "weather", frequency: "1440", run_at: "07:00" } },
  { label: "Tin công nghệ", icon: "hardware-chip-outline", rule: { title: "Tin công nghệ", keyword: "tin công nghệ mới nhất", category: "tech", frequency: "1440", run_at: "08:00" } },
];

export default function CreateRuleScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const [previewRules, setPreviewRules] = useState<RuleDraft[]>([]);
  // important[i] = true → rule i sẽ lưu notify_mode "important" (chỉ báo tin quan trọng).
  // Mặc định bật sẵn cho rule mà AI chấm noise_risk = "high".
  const [important, setImportant] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Hiện preview + khởi tạo lựa chọn "chỉ tin quan trọng" theo đánh giá độ ồn của AI.
  const showPreview = (rules: RuleDraft[]) => {
    setPreviewRules(rules);
    setImportant(rules.map((r) => r.noise_risk === "high"));
  };
  const toggleImportant = (idx: number) =>
    setImportant((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  // Chọn mẫu → KHÔNG tạo ngay, mà hiện thẻ preview để người dùng XEM LẠI rồi mới bấm Tạo.
  // Không gọi AI nên dùng được cả khi Gemini kẹt quota.
  const applyTemplate = (t: (typeof QUICK_TEMPLATES)[number]) => {
    if (loading || confirming) return;
    const draft: RuleDraft = {
      title: t.rule.title,
      description: "",
      keyword: t.rule.keyword,
      category: t.rule.category,
      sources: "",
      frequency: t.rule.frequency,
      run_at: t.rule.run_at ?? "",
      condition: t.rule.condition ?? "",
    };
    setMessages((prev) => [
      ...prev,
      { role: "user", text: `Dùng mẫu: ${t.label}` },
      { role: "ai", text: "Đây là rule từ mẫu. Bạn xem lại thông tin bên dưới — muốn đổi gì thì bấm \"Chỉnh sửa\" rồi mô tả, ưng thì bấm \"Tạo rule\" nhé." },
    ]);
    historyRef.current.push({ role: "user", content: `Tạo rule mẫu: ${t.rule.keyword}` });
    historyRef.current.push({ role: "assistant", content: JSON.stringify({ status: "ready", rules: [draft] }) });
    showPreview([draft]);
    scrollToBottom();
  };

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    if (!user) {
      alertMessage("Lỗi", "Bạn chưa đăng nhập");
      return;
    }

    setMessages((prev) => [...prev, { role: "user", text }]);
    historyRef.current.push({ role: "user", content: text });
    setInput("");
    setPreviewRules([]);
    setLoading(true);
    scrollToBottom();

    try {
      const result = await chatRule(historyRef.current);
      setLoading(false);

      if (result.status === "need_info") {
        historyRef.current.push({ role: "assistant", content: result.message });
        setMessages((prev) => [...prev, { role: "ai", text: result.message }]);
        scrollToBottom();
        return;
      }

      const rules = result.rules;
      historyRef.current.push({
        role: "assistant",
        content: JSON.stringify({ status: "ready", rules }),
      });
      setMessages((prev) => [...prev, { role: "ai", text: result.message }]);
      showPreview(rules);
      scrollToBottom();
    } catch (err: any) {
      setLoading(false);
      setMessages((prev) => [...prev, { role: "ai", text: `Lỗi: ${err.message}` }]);
      scrollToBottom();
    }
  };

  const handleConfirm = async () => {
    if (previewRules.length === 0 || !user) return;
    setConfirming(true);

    const { error } = await supabase.from("rules").insert(
      previewRules.map((r, i) => ({
        title: r.title,
        description: r.description,
        keyword: r.keyword,
        category: r.category,
        sources: r.sources,
        frequency: r.frequency,
        run_at: r.run_at,
        condition: r.condition,
        notify_mode: important[i] ? "important" : "all",
        // NHẮC HẸN: chỉ đính kèm 2 cột này khi thật sự là reminder — rule thường không
        // gửi field nên vẫn tạo được kể cả khi migration 0016 chưa chạy.
        ...(r.source_type === "reminder" && r.remind_at
          ? { source_type: "reminder", remind_at: r.remind_at }
          : {}),
        is_active: true,
        user_id: user.id,
      }))
    );

    setConfirming(false);

    if (error) {
      alertMessage("Lỗi", error.message);
      return;
    }

    router.back();
  };

  const handleDiscard = () => {
    setPreviewRules([]);
    setMessages((prev) => [
      ...prev,
      { role: "ai", text: "Đã bỏ các rule đó. Bạn muốn chỉnh gì hoặc mô tả lại nhé!" },
    ]);
    scrollToBottom();
  };

  // Bỏ 1 rule khỏi danh sách preview trước khi tạo (khi tách ra nhiều rule).
  const removePreviewAt = (idx: number) => {
    setPreviewRules((prev) => prev.filter((_, i) => i !== idx));
    setImportant((prev) => prev.filter((_, i) => i !== idx));
  };

  const renderRuleCard = (r: RuleDraft, idx: number, total: number) => {
    const cat = findCategory(r.category);
    const isReminder = r.source_type === "reminder" && r.remind_at;
    const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
      { icon: "pricetag-outline", label: "Tên", value: r.title },
    ];
    if (isReminder) {
      // Nhắc hẹn: hiện thời điểm nhắc thay cho từ khóa/tần suất (không theo dõi tin).
      rows.push({
        icon: "alarm-outline",
        label: "Nhắc lúc",
        value: new Date(r.remind_at!).toLocaleString("vi-VN", {
          hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
        }),
      });
    } else {
      rows.push(
        { icon: "search-outline", label: "Từ khóa", value: r.keyword },
        { icon: cat.icon, label: "Danh mục", value: cat.label },
        { icon: "time-outline", label: "Tần suất", value: formatSchedule(r.frequency, r.run_at) },
      );
    }
    if (r.sources) rows.push({ icon: "globe-outline", label: "Nguồn", value: r.sources });
    if (r.condition) rows.push({ icon: "flash-outline", label: "Điều kiện", value: r.condition });

    return (
      <View key={idx} style={styles.ruleCard}>
        {total > 1 && (
          <View style={styles.ruleCardHeader}>
            <Text style={styles.ruleCardHeaderText}>Rule {idx + 1}/{total}</Text>
            <TouchableOpacity onPress={() => removePreviewAt(idx)} disabled={confirming} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.subText} />
            </TouchableOpacity>
          </View>
        )}
        {rows.map((row, i) => (
          <View key={i} style={[styles.ruleRow, i < rows.length - 1 && styles.ruleRowDivider]}>
            <Ionicons name={row.icon} size={16} color={colors.primary} />
            <Text style={styles.ruleRowLabel}>{row.label}</Text>
            <Text style={styles.ruleRowValue} numberOfLines={2}>{row.value}</Text>
          </View>
        ))}

        {/* CẢNH BÁO ĐỘ ỒN — chỉ hiện khi AI chấm rule này dễ tạo thông báo rác.
            Tick bật sẵn → lưu notify_mode "important" (chỉ báo tin quan trọng). */}
        {r.noise_risk === "high" && (
          <View style={styles.noiseBox}>
            <View style={styles.noiseHeader}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.noiseTitle}>Chủ đề dễ tạo thông báo rác</Text>
            </View>
            <Text style={styles.noiseReason}>
              {r.noise_reason || "Chủ đề khá rộng nên có thể tạo nhiều thông báo ít giá trị."}
            </Text>
            <TouchableOpacity style={styles.noiseToggle} onPress={() => toggleImportant(idx)} activeOpacity={0.8}>
              <Ionicons
                name={important[idx] ? "checkbox" : "square-outline"}
                size={20}
                color={important[idx] ? colors.primary : colors.subText}
              />
              <Text style={styles.noiseToggleText}>
                Chỉ báo tin quan trọng (bỏ tin lặp / không có gì mới)
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // Android bật edge-to-edge nên hệ thống KHÔNG tự resize → phải tự né bàn phím
      // (trước đây để undefined nên bàn phím che mất ô nhập chat).
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.title}>AI Rule Creator</Text>
          <Text style={styles.subtitle}>Mô tả điều bạn muốn theo dõi</Text>
        </View>

        <View style={styles.aiAvatar}>
          <Ionicons name="sparkles" size={26} color="white" />
        </View>
      </View>

      {/* CHAT */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        {/* Welcome */}
        <View style={styles.welcomeRow}>
          <View style={styles.botAvatar}>
            <Ionicons name="happy-outline" size={22} color="white" />
          </View>
          <View style={styles.aiBubble}>
            <Text style={styles.aiBubbleTitle}>Xin chào 👋</Text>
            <Text style={styles.aiBubbleText}>
              Tôi là AI Assistant. Hãy mô tả điều bạn muốn theo dõi — nếu thiếu thông tin, tôi sẽ hỏi lại bạn.
            </Text>
          </View>
        </View>

        {/* Mẫu nhanh — tạo NGAY, không cần AI (chỉ hiện khi chưa chat) */}
        {messages.length === 0 && (
          <View style={styles.templateBox}>
            <Text style={styles.templateTitle}>⚡ Mẫu nhanh — chọn để xem trước rồi tạo (không cần AI)</Text>
            <View style={styles.templateGrid}>
              {QUICK_TEMPLATES.map((t) => (
                <TouchableOpacity
                  key={t.label}
                  style={styles.templateChip}
                  onPress={() => applyTemplate(t)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={t.icon} size={16} color={colors.primary} />
                  <Text style={styles.templateChipText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Suggestion chips (qua AI) chỉ hiện khi chưa chat */}
        {messages.length === 0 && (
          <>
            <Text style={styles.templateTitle}>💬 Hoặc mô tả cho AI</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <SuggestionChip key={s.label} label={s.label} icon={s.icon} onPress={() => send(s.label)} />
              ))}
            </View>
          </>
        )}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <View key={i} style={styles.userBubble}>
              <Text style={styles.userBubbleText}>{msg.text}</Text>
            </View>
          ) : (
            <View key={i} style={styles.aiBubble}>
              <Text style={styles.aiBubbleText}>{msg.text}</Text>
            </View>
          )
        )}

        {loading && (
          <View style={styles.aiBubble}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.aiBubbleText, { marginBottom: 0 }]}>AI đang phân tích...</Text>
            </View>
          </View>
        )}

        {/* Card tóm tắt rule + nút */}
        {previewRules.length > 0 && !loading && (
          <>
            {previewRules.map((r, i) => renderRuleCard(r, i, previewRules.length))}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.confirmBtn, confirming && { opacity: 0.6 }]}
                onPress={handleConfirm}
                disabled={confirming}
              >
                {confirming ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={20} color="white" />
                )}
                <Text style={styles.actionBtnText}>
                  {confirming
                    ? "Đang tạo..."
                    : previewRules.length > 1
                      ? `Tạo ${previewRules.length} rule`
                      : "Tạo rule"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.discardBtn]}
                onPress={handleDiscard}
                disabled={confirming}
              >
                <Ionicons name="refresh-outline" size={20} color={colors.subText} />
                <Text style={[styles.actionBtnText, { color: colors.subText }]}>Chỉnh sửa</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* INPUT */}
      <View style={styles.inputRow}>
        <TextInput
          placeholder="Nhập mô tả hoặc trả lời AI..."
          placeholderTextColor={colors.subText}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <TouchableOpacity
          testID="send-button"
          style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
          onPress={() => send(input)}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={20} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 18,
    },
    backButton: { marginRight: 14 },
    headerContent: { flex: 1 },
    title: {
      color: C.text,
      fontSize: 24,
      fontWeight: "bold",
    },
    subtitle: {
      color: C.subText,
      marginTop: 4,
      fontSize: 13,
    },
    aiAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    chat: { flex: 1 },
    welcomeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 14,
    },
    botAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    suggestions: {
      marginBottom: 12,
    },
    templateBox: {
      marginBottom: 16,
    },
    templateTitle: {
      color: C.subText,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 10,
      marginLeft: 2,
    },
    templateGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    templateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.primary + "44",
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    templateChipText: {
      color: C.text,
      fontSize: 13.5,
      fontWeight: "600",
    },
    aiBubble: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      borderTopLeftRadius: 4,
      padding: 16,
      marginBottom: 12,
      maxWidth: "88%",
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: C.border,
      flexShrink: 1,
    },
    aiBubbleTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 6,
    },
    aiBubbleText: {
      color: C.text,
      fontSize: 15,
      lineHeight: 23,
    },
    userBubble: {
      backgroundColor: C.primaryDark,
      borderRadius: RADIUS.lg,
      borderTopRightRadius: 4,
      padding: 16,
      marginBottom: 12,
      maxWidth: "80%",
      alignSelf: "flex-end",
    },
    userBubbleText: {
      color: "#FFFFFF",
      fontSize: 15,
      lineHeight: 22,
    },
    ruleCard: {
      backgroundColor: C.cardAlt,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: C.primary + "44",
      padding: 6,
      marginBottom: 14,
    },
    ruleCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 4,
    },
    ruleCardHeaderText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    ruleRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 10,
      gap: 10,
    },
    ruleRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    ruleRowLabel: {
      color: C.subText,
      fontSize: 13,
      width: 72,
    },
    ruleRowValue: {
      color: C.text,
      fontSize: 14,
      fontWeight: "600",
      flex: 1,
      textAlign: "right",
    },
    noiseBox: {
      marginTop: 6,
      marginHorizontal: 6,
      marginBottom: 6,
      padding: 12,
      borderRadius: RADIUS.md,
      backgroundColor: C.warning + "14",
      borderWidth: 1,
      borderColor: C.warning + "44",
    },
    noiseHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    noiseTitle: {
      color: C.warning,
      fontSize: 13,
      fontWeight: "700",
    },
    noiseReason: {
      color: C.text,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 10,
    },
    noiseToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    noiseToggleText: {
      color: C.text,
      fontSize: 13.5,
      fontWeight: "600",
      flex: 1,
    },
    actionRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 12,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: RADIUS.md,
    },
    confirmBtn: { backgroundColor: C.primary },
    discardBtn: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },
    actionBtnText: {
      color: C.text,
      fontWeight: "bold",
      fontSize: 15,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 12,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: C.border,
      gap: 12,
    },
    input: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 14,
      color: C.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: C.border,
    },
    sendBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: C.primary,
      justifyContent: "center",
      alignItems: "center",
    },
  });
}
