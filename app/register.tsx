import React, { useMemo, useState } from "react";

import {
  KeyboardAvoidingView,
  Platform,
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
import { useTheme } from "../contexts/ThemeContext";
import { RADIUS, type AppColors } from "../lib/theme";

export default function RegisterScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleRegister = async () => {
    if (!fullName.trim()) {
      alertMessage("Lỗi", "Vui lòng nhập họ và tên");
      return;
    }
    if (!email.trim()) {
      alertMessage("Lỗi", "Vui lòng nhập email");
      return;
    }
    if (password.length < 6) {
      alertMessage("Lỗi", "Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (password !== confirmPassword) {
      alertMessage("Lỗi", "Mật khẩu xác nhận không khớp");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
          },
        },
      });

      if (error) {
        alertMessage("Lỗi", error.message);
        return;
      }

      if (data.session) {
        router.replace("/(tabs)");
        return;
      }

      alertMessage(
        "Kiểm tra email",
        "Đăng ký thành công! Vui lòng xác nhận email trong hộp thư, sau đó đăng nhập."
      );
      router.replace("/login");
    } catch (err: any) {
      alertMessage("Lỗi", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Tạo tài khoản</Text>
        <Text style={styles.subtitle}>Điền thông tin để bắt đầu</Text>

        {/* Họ và tên */}
        <Text style={styles.label}>Họ và tên <Text style={styles.required}>*</Text></Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={20} color={colors.subText} />
          <TextInput
            style={styles.input}
            placeholder="Nguyễn Văn A"
            placeholderTextColor={colors.subText}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        {/* Số điện thoại */}
        <Text style={styles.label}>Số điện thoại</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={20} color={colors.subText} />
          <TextInput
            style={styles.input}
            placeholder="0912 345 678"
            placeholderTextColor={colors.subText}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Email */}
        <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={20} color={colors.subText} />
          <TextInput
            style={styles.input}
            placeholder="example@email.com"
            placeholderTextColor={colors.subText}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        {/* Mật khẩu */}
        <Text style={styles.label}>Mật khẩu <Text style={styles.required}>*</Text></Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.subText} />
          <TextInput
            style={styles.input}
            placeholder="Ít nhất 6 ký tự"
            placeholderTextColor={colors.subText}
            value={password}
            onChangeText={setPassword}
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

        {/* Xác nhận mật khẩu */}
        <Text style={styles.label}>Xác nhận mật khẩu <Text style={styles.required}>*</Text></Text>
        <View style={[
          styles.inputWrapper,
          passwordMismatch && { borderColor: colors.danger },
          passwordMatch && { borderColor: colors.success },
        ]}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.subText} />
          <TextInput
            style={styles.input}
            placeholder="Nhập lại mật khẩu"
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
        {passwordMismatch && (
          <Text style={styles.errorHint}>Mật khẩu không khớp</Text>
        )}

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.6 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Đang đăng ký..." : "Đăng ký"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/login")}>
          <Text style={styles.link}>Đã có tài khoản? Đăng nhập</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    scroll: {
      paddingHorizontal: 24,
      paddingTop: 72,
      paddingBottom: 48,
    },
    title: {
      color: C.text,
      fontSize: 36,
      fontWeight: "bold",
      marginBottom: 8,
    },
    subtitle: {
      color: C.subText,
      fontSize: 16,
      marginBottom: 36,
    },
    label: {
      color: C.subText,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 8,
      marginLeft: 2,
    },
    required: {
      color: C.danger,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
      gap: 10,
    },
    input: {
      flex: 1,
      color: C.text,
      fontSize: 16,
    },
    errorHint: {
      color: C.danger,
      fontSize: 12,
      marginTop: -14,
      marginBottom: 16,
      marginLeft: 2,
    },
    button: {
      backgroundColor: C.primary,
      borderRadius: RADIUS.md,
      paddingVertical: 18,
      alignItems: "center",
      marginTop: 8,
      marginBottom: 24,
    },
    buttonText: {
      color: "white",
      fontSize: 18,
      fontWeight: "bold",
    },
    link: {
      color: C.primary,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
