import React, { useRef, useState } from "react";

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
import { findCategory, findFrequency } from "../lib/ruleOptions";

const COLORS = {
  background: "#081120",
  card: "#101B35",
  primary: "#4DA6FF",
  text: "#FFFFFF",
  subText: "#8FA1C7",
  border: "#1E2B4A",
  userBubble: "#2563EB",
};

interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

export default function CreateRuleScreen() {
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Lịch sử hội thoại gửi cho model (role assistant/user)
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const [previewRule, setPreviewRule] = useState<RuleDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const ruleSummaryText = (r: RuleDraft) => {
    const cat = findCategory(r.category);
    const freq = findFrequency(r.frequency);
    const lines = [
      `📌 ${r.title}`,
      `🔍 Từ khóa: ${r.keyword}`,
      `🏷️ Danh mục: ${cat.label}`,
      `⏰ Tần suất: ${freq?.label ?? r.frequency}`,
    ];
    if (r.sources) lines.push(`🌐 Nguồn: ${r.sources}`);
    if (r.condition) lines.push(`⚡ Điều kiện: ${r.condition}`);
    if (r.description) lines.push(`\n📝 ${r.description}`);
    return lines.join("\n");
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
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
        // AI hỏi lại — lưu vào lịch sử để giữ ngữ cảnh
        historyRef.current.push({ role: "assistant", content: result.message });
        setMessages((prev) => [...prev, { role: "ai", text: result.message }]);
        scrollToBottom();
        return;
      }

      // status === "ready"
      const rule = result.rule;
      historyRef.current.push({
        role: "assistant",
        content: JSON.stringify({ status: "ready", rule }),
      });
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `${result.message}\n\n${ruleSummaryText(rule)}` },
      ]);
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="white" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.title}>AI Rule Creator</Text>
          <Text style={styles.subtitle}>Mô tả điều bạn muốn theo dõi</Text>
        </View>

        <View style={styles.aiAvatar}>
          <Ionicons name="sparkles" size={28} color="white" />
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
        {/* Tin nhắn chào mặc định */}
        <View style={styles.aiBubble}>
          <Text style={styles.aiBubbleText}>
            Xin chào 👋{"\n\n"}
            Hãy mô tả điều bạn muốn AI theo dõi. Nếu còn thiếu thông tin, tôi sẽ hỏi lại bạn. Ví dụ:{"\n"}
            • "Theo dõi giá vàng SJC mỗi sáng"{"\n"}
            • "Báo khi VN30 có biến động mạnh"{"\n"}
            • "Cập nhật tin công nghệ AI hằng ngày"
          </Text>
        </View>

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
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={[styles.aiBubbleText, { marginBottom: 0 }]}>AI đang phân tích...</Text>
            </View>
          </View>
        )}

        {/* Nút Confirm / Discard khi có rule đề xuất */}
        {previewRule && !loading && (
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
                {confirming ? "Đang tạo..." : "Tạo rule này"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.discardBtn]}
              onPress={handleDiscard}
              disabled={confirming}
            >
              <Ionicons name="refresh-outline" size={20} color={COLORS.subText} />
              <Text style={[styles.actionBtnText, { color: COLORS.subText }]}>Sửa lại</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* INPUT */}
      <View style={styles.inputRow}>
        <TextInput
          placeholder="Nhập mô tả hoặc trả lời AI..."
          placeholderTextColor={COLORS.subText}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={22} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  backButton: { marginRight: 14 },

  headerContent: { flex: 1 },

  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "bold",
  },

  subtitle: {
    color: COLORS.subText,
    marginTop: 4,
    fontSize: 14,
  },

  aiAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  chat: { flex: 1 },

  aiBubble: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderTopLeftRadius: 4,
    padding: 16,
    marginBottom: 12,
    maxWidth: "85%",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  aiBubbleText: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 24,
  },

  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderRadius: 20,
    borderTopRightRadius: 4,
    padding: 16,
    marginBottom: 12,
    maxWidth: "80%",
    alignSelf: "flex-end",
  },

  userBubbleText: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
    marginBottom: 12,
  },

  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },

  confirmBtn: { backgroundColor: COLORS.primary },

  discardBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  actionBtnText: {
    color: COLORS.text,
    fontWeight: "bold",
    fontSize: 15,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },

  input: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  sendBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
});
