import React, { useState } from "react";

import {
  KeyboardAvoidingView,
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
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { alertMessage } from "../lib/dialog";
import { useAuth } from "../contexts/AuthContext";
import { CATEGORIES, FREQUENCIES } from "../lib/ruleOptions";

const COLORS = {
  background: "#081120",
  card: "#101B35",
  primary: "#4DA6FF",
  text: "#FFFFFF",
  subText: "#8FA1C7",
  border: "#1E2B4A",
};

export default function ManualRuleScreen() {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("news");
  const [sources, setSources] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [condition, setCondition] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      alertMessage("Lỗi", "Vui lòng nhập tên rule");
      return;
    }

    if (!keyword.trim()) {
      alertMessage("Lỗi", "Vui lòng nhập từ khóa");
      return;
    }

    if (!user) {
      alertMessage("Lỗi", "Bạn chưa đăng nhập");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("rules").insert([
      {
        title: title.trim(),
        description: description.trim(),
        keyword: keyword.trim(),
        category,
        sources: sources.trim(),
        frequency,
        condition: condition.trim(),
        is_active: isActive,
        user_id: user.id,
      },
    ]);

    setLoading(false);

    if (error) {
      alertMessage("Lỗi", error.message);
      return;
    }

    // Quay lại danh sách ngay, không phụ thuộc vào nút OK của Alert
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Text style={styles.title}>Tạo rule thủ công</Text>
            <Text style={styles.subtitle}>Điền thông tin rule bạn muốn theo dõi</Text>
          </View>
        </View>

        {/* FORM */}
        <View style={styles.card}>
          <Text style={styles.label}>Tên rule *</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: Theo dõi giá vàng"
            placeholderTextColor={COLORS.subText}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Mô tả</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Mô tả ngắn về rule này..."
            placeholderTextColor={COLORS.subText}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Từ khóa *</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: giá vàng SJC"
            placeholderTextColor={COLORS.subText}
            value={keyword}
            onChangeText={setKeyword}
          />

          {/* DANH MỤC */}
          <Text style={styles.label}>Danh mục</Text>
          <View style={styles.chipWrap}>
            {CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, active && { backgroundColor: c.color, borderColor: c.color }]}
                  onPress={() => setCategory(c.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={c.icon}
                    size={15}
                    color={active ? "white" : COLORS.subText}
                  />
                  <Text style={[styles.chipText, active && { color: "white" }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* TẦN SUẤT */}
          <Text style={[styles.label, { marginTop: 18 }]}>Tần suất kiểm tra</Text>
          <View style={styles.chipWrap}>
            {FREQUENCIES.map((f) => {
              const active = f.key === frequency;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.chip, active && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                  onPress={() => setFrequency(f.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && { color: "white" }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* NGUỒN */}
          <Text style={[styles.label, { marginTop: 18 }]}>Nguồn theo dõi</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: VnExpress, CafeF (cách nhau dấu phẩy)"
            placeholderTextColor={COLORS.subText}
            value={sources}
            onChangeText={setSources}
          />

          {/* ĐIỀU KIỆN */}
          <Text style={styles.label}>Điều kiện kích hoạt</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="VD: khi giá vượt 80 triệu, khi có tin mới..."
            placeholderTextColor={COLORS.subText}
            value={condition}
            onChangeText={setCondition}
            multiline
            numberOfLines={2}
          />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Kích hoạt ngay</Text>
              <Text style={styles.switchSub}>Rule sẽ bắt đầu theo dõi ngay sau khi tạo</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              thumbColor={isActive ? COLORS.primary : "#555"}
            />
          </View>
        </View>

        {/* SUBMIT */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          <Ionicons name="add-circle-outline" size={22} color="white" />
          <Text style={styles.createButtonText}>
            {loading ? "Đang tạo..." : "Tạo rule"}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    alignItems: "flex-start",
    marginBottom: 32,
  },

  backButton: {
    marginRight: 16,
    marginTop: 4,
  },

  headerContent: {
    flex: 1,
  },

  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "bold",
  },

  subtitle: {
    color: COLORS.subText,
    marginTop: 6,
    fontSize: 15,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  label: {
    color: COLORS.subText,
    fontSize: 14,
    marginBottom: 8,
    marginTop: 4,
  },

  input: {
    backgroundColor: "#09152D",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  textarea: {
    height: 90,
    textAlignVertical: "top",
  },

  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#09152D",
  },

  chipText: {
    color: COLORS.subText,
    fontSize: 13,
    fontWeight: "600",
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },

  switchLabel: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },

  switchSub: {
    color: COLORS.subText,
    fontSize: 13,
    marginTop: 2,
    maxWidth: 240,
  },

  createButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  createButtonDisabled: {
    opacity: 0.6,
  },

  createButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 17,
  },
});
