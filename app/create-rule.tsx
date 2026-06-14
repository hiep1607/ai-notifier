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
import { chatRule, RuleDraft } from "../lib/claude";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { findCategory, findFrequency } from "../lib/ruleOptions";
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

export default function CreateRuleScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const [previewRule, setPreviewRule] = useState<RuleDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    setPreviewRule(null);
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

      const rule = result.rule;
      historyRef.current.push({
        role: "assistant",
        content: JSON.stringify({ status: "ready", rule }),
      });
      setMessages((prev) => [...prev, { role: "ai", text: result.message }]);
      setPreviewRule(rule);
      scrollToBottom();
    } catch (err: any) {
      setLoading(false);
      setMessages((prev) => [...prev, { role: "ai", text: `Lỗi: ${err.message}` }]);
      scrollToBottom();
    }
  };

  const handleConfirm = async () => {
    if (!previewRule || !user) return;
    setConfirming(true);

    const { error } = await supabase.from("rules").insert([{
      title: previewRule.title,
      description: previewRule.description,
      keyword: previewRule.keyword,
      category: previewRule.category,
      sources: previewRule.sources,
      frequency: previewRule.frequency,
      condition: previewRule.condition,
      is_active: true,
      user_id: user.id,
    }]);

    setConfirming(false);

    if (error) {
      alertMessage("Lỗi", error.message);
      return;
    }

    router.back();
  };

  const handleDiscard = () => {
    setPreviewRule(null);
    setMessages((prev) => [
      ...prev,
      { role: "ai", text: "Đã bỏ rule đó. Bạn muốn chỉnh gì hoặc mô tả lại nhé!" },
    ]);
    scrollToBottom();
  };

  const renderRuleCard = (r: RuleDraft) => {
    const cat = findCategory(r.category);
    const freq = findFrequency(r.frequency);
    const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
      { icon: "pricetag-outline", label: "Tên", value: r.title },
      { icon: "search-outline", label: "Từ khóa", value: r.keyword },
      { icon: cat.icon, label: "Danh mục", value: cat.label },
      { icon: "time-outline", label: "Tần suất", value: freq?.label ?? r.frequency },
    ];
    if (r.sources) rows.push({ icon: "globe-outline", label: "Nguồn", value: r.sources });
    if (r.condition) rows.push({ icon: "flash-outline", label: "Điều kiện", value: r.condition });

    return (
      <View style={styles.ruleCard}>
        {rows.map((row, i) => (
          <View key={i} style={[styles.ruleRow, i < rows.length - 1 && styles.ruleRowDivider]}>
            <Ionicons name={row.icon} size={16} color={colors.primary} />
            <Text style={styles.ruleRowLabel}>{row.label}</Text>
            <Text style={styles.ruleRowValue} numberOfLines={2}>{row.value}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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

        {/* Suggestion chips chỉ hiện khi chưa chat */}
        {messages.length === 0 && (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <SuggestionChip key={s.label} label={s.label} icon={s.icon} onPress={() => send(s.label)} />
            ))}
          </View>
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
        {previewRule && !loading && (
          <>
            {renderRuleCard(previewRule)}
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
                <Text style={styles.actionBtnText}>{confirming ? "Đang tạo..." : "Tạo rule"}</Text>
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
