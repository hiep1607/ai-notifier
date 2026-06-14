import React, { useMemo, useState } from "react";

import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";

import { supabase } from "../lib/supabase";
import { alertMessage } from "../lib/dialog";
import { useTheme } from "../contexts/ThemeContext";
import { RADIUS, type AppColors } from "../lib/theme";

export default function RegisterScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) {
        alertMessage("Lỗi", error.message);
        return;
      }

      // Nếu Supabase tắt "Confirm email" → signUp trả về session luôn → vào thẳng app
      if (data.session) {
        router.replace("/(tabs)");
        return;
      }

      // Còn lại: cần xác nhận email trước khi đăng nhập được
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
      <View style={styles.header}>
        <Text style={styles.title}>Tạo tài khoản</Text>
        <Text style={styles.subtitle}>Đăng ký để dùng AI Notifier</Text>
      </View>

      <TextInput
        placeholder="Email"
        placeholderTextColor={colors.subText}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        placeholder="Mật khẩu"
        placeholderTextColor={colors.subText}
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Đang đăng ký..." : "Đăng ký"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/login")}>
        <Text style={styles.link}>Đã có tài khoản? Đăng nhập</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      paddingHorizontal: 26,
      justifyContent: "center",
    },
    header: {
      marginBottom: 40,
    },
    title: {
      color: C.text,
      fontSize: 52,
      fontWeight: "bold",
      marginBottom: 14,
    },
    subtitle: {
      color: C.subText,
      fontSize: 18,
    },
    input: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 22,
      paddingVertical: 20,
      color: C.text,
      fontSize: 18,
      marginBottom: 22,
      borderWidth: 1,
      borderColor: C.border,
    },
    button: {
      backgroundColor: C.primary,
      borderRadius: RADIUS.lg,
      paddingVertical: 22,
      alignItems: "center",
      marginTop: 12,
    },
    buttonText: {
      color: "white",
      fontSize: 22,
      fontWeight: "bold",
    },
    link: {
      color: C.primary,
      textAlign: "center",
      marginTop: 36,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
