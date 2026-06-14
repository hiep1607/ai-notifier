import React, { useEffect, useMemo, useState } from "react";

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
import { alertMessage, confirmAsync } from "../lib/dialog";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { RADIUS, SCREEN, type AppColors } from "../lib/theme";

export default function ProfileScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Thông tin cá nhân
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? "");
  const [phone, setPhone] = useState(user?.user_metadata?.phone ?? "");
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Đổi mật khẩu
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Stats
  const [rulesCount, setRulesCount] = useState(0);
  const [notificationsCount, setNotificationsCount] = useState(0);

  useEffect(() => {
    if (user) fetchStats();
  }, [user]);

  const fetchStats = async () => {
    const { count: rc } = await supabase
      .from("rules")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id);

    setRulesCount(rc ?? 0);

    if (rc && rc > 0) {
      const { data: ruleRows } = await supabase
        .from("rules")
        .select("id")
        .eq("user_id", user!.id);

      if (ruleRows && ruleRows.length > 0) {
        const { count: nc } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .in("rule_id", ruleRows.map((r) => r.id));
        setNotificationsCount(nc ?? 0);
      }
    }
  };

  // Avatar: 1-2 chữ cái đầu của họ tên, fallback là chữ cái đầu email
  const initials = fullName.trim()
    ? fullName.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : (user?.email?.[0] ?? "?").toUpperCase();

  const displayName = fullName.trim() || user?.email?.split("@")[0] || "Người dùng";

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), phone: phone.trim() },
    });
    setSavingProfile(false);

    if (error) {
      alertMessage("Lỗi", error.message);
    } else {
      alertMessage("Thành công", "Đã cập nhật thông tin cá nhân");
      setEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setFullName(user?.user_metadata?.full_name ?? "");
    setPhone(user?.user_metadata?.phone ?? "");
    setEditing(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      alertMessage("Lỗi", "Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      alertMessage("Lỗi", "Mật khẩu xác nhận không khớp");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      alertMessage("Lỗi", error.message);
    } else {
      alertMessage("Thành công", "Đã đổi mật khẩu thành công");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleSignOut = async () => {
    const ok = await confirmAsync("Đăng xuất", "Bạn muốn đăng xuất khỏi tài khoản này?");
    if (!ok) return;
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("vi-VN", { month: "long", year: "numeric" })
    : "—";

  const passwordMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Hồ sơ cá nhân</Text>
      </View>

      {/* AVATAR */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.avatarName}>{displayName}</Text>
        <Text style={styles.avatarEmail}>{user?.email}</Text>
      </View>

      {/* STATS */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{rulesCount}</Text>
          <Text style={styles.statLabel}>Rules</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{notificationsCount}</Text>
          <Text style={styles.statLabel}>Thông báo</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{joinDate}</Text>
          <Text style={styles.statLabel}>Tham gia</Text>
        </View>
      </View>

      {/* THÔNG TIN CÁ NHÂN */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Thông tin cá nhân</Text>
          {!editing ? (
            <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
              <Ionicons name="pencil-outline" size={16} color={colors.primary} />
              <Text style={styles.editBtnText}>Chỉnh sửa</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleCancelEdit}>
              <Text style={styles.cancelText}>Hủy</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={20} color={colors.subText} />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>Họ và tên</Text>
            {editing ? (
              <TextInput
                style={styles.inlineInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Nhập họ tên"
                placeholderTextColor={colors.muted}
              />
            ) : (
              <Text style={[styles.infoValue, !fullName && styles.infoEmpty]}>
                {fullName || "Chưa cập nhật"}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="call-outline" size={20} color={colors.subText} />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>Số điện thoại</Text>
            {editing ? (
              <TextInput
                style={styles.inlineInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Nhập số điện thoại"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={[styles.infoValue, !phone && styles.infoEmpty]}>
                {phone || "Chưa cập nhật"}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.infoRow, { marginBottom: 0 }]}>
          <Ionicons name="mail-outline" size={20} color={colors.subText} />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email ?? "—"}</Text>
          </View>
        </View>

        {editing && (
          <TouchableOpacity
            style={[styles.saveButton, savingProfile && { opacity: 0.6 }, { marginTop: 20 }]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            <Text style={styles.saveButtonText}>
              {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ĐỔI MẬT KHẨU */}
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
              size={20}
              color={colors.subText}
            />
          </TouchableOpacity>
        </View>

        <View style={[
          styles.inputWrapper,
          passwordMismatch && { borderColor: colors.danger },
          passwordMatch && { borderColor: colors.success },
        ]}>
          <TextInput
            style={styles.input}
            placeholder="Xác nhận mật khẩu mới"
            placeholderTextColor={colors.subText}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
          />
          {passwordMatch && (
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          )}
          {passwordMismatch && (
            <Ionicons name="close-circle" size={20} color={colors.danger} />
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, savingPassword && { opacity: 0.6 }]}
          onPress={handleChangePassword}
          disabled={savingPassword}
        >
          <Text style={styles.saveButtonText}>
            {savingPassword ? "Đang lưu..." : "Đổi mật khẩu"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ĐĂNG XUẤT */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.signOutText}>Đăng xuất</Text>
      </TouchableOpacity>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    scroll: {
      paddingTop: SCREEN.paddingTop,
      paddingHorizontal: 20,
      paddingBottom: 48,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 28,
    },
    backButton: {
      marginRight: 16,
    },
    title: {
      color: C.text,
      fontSize: 26,
      fontWeight: "bold",
    },
    avatarSection: {
      alignItems: "center",
      marginBottom: 28,
    },
    avatar: {
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: C.primary,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 14,
    },
    avatarText: {
      color: "white",
      fontSize: 34,
      fontWeight: "bold",
    },
    avatarName: {
      color: C.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 4,
    },
    avatarEmail: {
      color: C.subText,
      fontSize: 14,
    },
    statsRow: {
      flexDirection: "row",
      backgroundColor: C.card,
      borderRadius: RADIUS.xl,
      paddingVertical: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.border,
    },
    statItem: {
      flex: 1,
      alignItems: "center",
    },
    statValue: {
      color: C.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 4,
    },
    statLabel: {
      color: C.subText,
      fontSize: 12,
    },
    statDivider: {
      width: 1,
      backgroundColor: C.border,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: RADIUS.xl,
      padding: 22,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: "bold",
    },
    editBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    editBtnText: {
      color: C.primary,
      fontSize: 14,
      fontWeight: "600",
    },
    cancelText: {
      color: C.muted,
      fontSize: 14,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 18,
      gap: 14,
    },
    infoText: {
      flex: 1,
    },
    infoLabel: {
      color: C.subText,
      fontSize: 12,
      marginBottom: 4,
    },
    infoValue: {
      color: C.text,
      fontSize: 15,
      fontWeight: "500",
    },
    infoEmpty: {
      color: C.muted,
      fontStyle: "italic",
      fontWeight: "400",
    },
    inlineInput: {
      color: C.text,
      fontSize: 15,
      fontWeight: "500",
      borderBottomWidth: 1.5,
      borderBottomColor: C.primary,
      paddingBottom: 4,
      paddingTop: 0,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.cardAlt,
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
      paddingVertical: 14,
      alignItems: "center",
    },
    saveButtonText: {
      color: "white",
      fontWeight: "bold",
      fontSize: 16,
    },
    signOutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 16,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: C.danger,
    },
    signOutText: {
      color: C.danger,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
