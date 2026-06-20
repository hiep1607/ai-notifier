import React, { useMemo, useState } from "react";

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
import { useTheme } from "../contexts/ThemeContext";
import { CATEGORIES, FREQUENCIES } from "../lib/ruleOptions";
import { SCREEN, RADIUS, type AppColors } from "../lib/theme";
import PrimaryButton from "../components/PrimaryButton";

export default function ManualRuleScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={26} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Text style={styles.title}>Tạo rule mới</Text>
            <Text style={styles.subtitle}>Điền thông tin bạn muốn theo dõi</Text>
          </View>
        </View>

        {/* FORM */}
        <View style={styles.card}>
          <Text style={styles.label}>Tên rule *</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: Theo dõi giá vàng"
            placeholderTextColor={colors.subText}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Nguồn / Website theo dõi</Text>
          <View style={styles.inputIconRow}>
            <Ionicons name="globe-outline" size={18} color={colors.subText} style={styles.inputIcon} />
            <TextInput
              style={styles.inputWithIcon}
              placeholder="VD: VnExpress, CafeF hoặc URL"
              placeholderTextColor={colors.subText}
              value={sources}
              onChangeText={setSources}
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.label}>Từ khóa *</Text>
          <View style={styles.inputIconRow}>
            <Ionicons name="search-outline" size={18} color={colors.subText} style={styles.inputIcon} />
            <TextInput
              style={styles.inputWithIcon}
              placeholder="VD: giá vàng SJC"
              placeholderTextColor={colors.subText}
              value={keyword}
              onChangeText={setKeyword}
            />
          </View>

          <Text style={styles.label}>Mô tả</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Mô tả ngắn về rule này..."
            placeholderTextColor={colors.subText}
            value={description}
            onChangeText={setDescription}
            multiline
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
                  <Ionicons name={c.icon} size={15} color={active ? "white" : colors.subText} />
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
                  style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setFrequency(f.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && { color: "white" }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ĐIỀU KIỆN */}
          <Text style={[styles.label, { marginTop: 18 }]}>Điều kiện kích hoạt</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="VD: khi giá vượt 80 triệu, khi có tin mới..."
            placeholderTextColor={colors.subText}
            value={condition}
            onChangeText={setCondition}
            multiline
          />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Kích hoạt ngay</Text>
              <Text style={styles.switchSub}>Rule sẽ bắt đầu theo dõi ngay sau khi tạo</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              thumbColor={isActive ? colors.primary : "#999"}
              trackColor={{ true: colors.primary + "66", false: colors.border }}
            />
          </View>
        </View>

        <PrimaryButton
          label={loading ? "Đang tạo..." : "Tạo rule"}
          icon="add-circle-outline"
          onPress={handleCreate}
          loading={loading}
        />
      </ScrollView>
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
      marginBottom: 26,
    },
    backButton: {
      marginRight: 14,
    },
    headerContent: {
      flex: 1,
    },
    title: {
      color: C.text,
      fontSize: 24,
      fontWeight: "bold",
    },
    subtitle: {
      color: C.subText,
      marginTop: 4,
      fontSize: 14,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: RADIUS.xl,
      padding: 20,
      marginBottom: 22,
      borderWidth: 1,
      borderColor: C.border,
    },
    label: {
      color: C.subText,
      fontSize: 14,
      marginBottom: 8,
      marginTop: 4,
    },
    input: {
      backgroundColor: C.inputBg,
      borderRadius: RADIUS.sm,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: C.text,
      fontSize: 15,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
    },
    inputIconRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.inputBg,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,
      paddingHorizontal: 14,
    },
    inputIcon: {
      marginRight: 10,
    },
    inputWithIcon: {
      flex: 1,
      paddingVertical: 14,
      color: C.text,
      fontSize: 15,
    },
    textarea: {
      height: 84,
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
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.inputBg,
    },
    chipText: {
      color: C.subText,
      fontSize: 13,
      fontWeight: "600",
    },
    switchRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 22,
    },
    switchLabel: {
      color: C.text,
      fontSize: 15,
      fontWeight: "600",
    },
    switchSub: {
      color: C.subText,
      fontSize: 13,
      marginTop: 2,
    },
  });
}
