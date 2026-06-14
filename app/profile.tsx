import React, { useMemo, useState } from "react";

import {
  ScrollView,
  StyleSheet,
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
import { RADIUS, type AppColors } from "../lib/theme";

export default function ProfileScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      alertMessage("Lỗi", "Vui lòng nhập mật khẩu mới");
      return;
    }

    if (newPassword.length < 6) {
      alertMessage("Lỗi", "Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    if (newPassword !== confirmPassword) {
      alertMessage("Lỗi", "Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      alertMessage("Lỗi", error.message);
    } else {
      alertMessage("Thành công", "Đã đổi mật khẩu");
      setNewPassword("");
      setConfirmPassword("");
    }

    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Hồ sơ cá nhân</Text>
      </View>

      {/* AVATAR */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={48} color={colors.primary} />
        </View>
      </View>

      {/* ACCOUNT INFO */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Thông tin tài khoản</Text>

        <View style={styles.infoRow}>
          <Ionicons name="mail-outline" size={20} color={colors.subText} />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email ?? "—"}</Text>
          </View>
        </View>

        {user?.created_at && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Ngày tạo</Text>
              <Text style={styles.infoValue}>
                {new Date(user.created_at).toLocaleDateString("vi-VN")}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* CHANGE PASSWORD */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Đổi mật khẩu</Text>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Mật khẩu mới"
            placeholderTextColor={colors.subText}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword((p) => !p)}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={colors.subText}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Xác nhận mật khẩu mới"
            placeholderTextColor={colors.subText}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, loading && { opacity: 0.6 }]}
          onPress={handleChangePassword}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? "Đang lưu..." : "Đổi mật khẩu"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      paddingTop: 70,
      paddingHorizontal: 20,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 32,
    },
    backButton: {
      marginRight: 16,
    },
    title: {
      color: C.text,
      fontSize: 28,
      fontWeight: "bold",
    },
    avatarSection: {
      alignItems: "center",
      marginBottom: 32,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: C.card,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: C.primary,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: RADIUS.xl,
      padding: 22,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.border,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 18,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
      gap: 14,
    },
    infoText: {
      flex: 1,
    },
    infoLabel: {
      color: C.subText,
      fontSize: 13,
      marginBottom: 2,
    },
    infoValue: {
      color: C.text,
      fontSize: 16,
      fontWeight: "600",
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.inputBg,
      borderRadius: RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    input: {
      flex: 1,
      color: C.text,
      fontSize: 16,
    },
    saveButton: {
      backgroundColor: C.primary,
      borderRadius: RADIUS.md,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 4,
    },
    saveButtonText: {
      color: "white",
      fontWeight: "bold",
      fontSize: 16,
    },
  });
}
