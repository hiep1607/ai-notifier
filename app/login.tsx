import React, { useMemo, useState } from "react";

import {
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

// Dịch lỗi auth của Supabase sang tiếng Việt dễ hiểu
function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Email hoặc mật khẩu không đúng. Nếu vừa đăng ký, hãy kiểm tra xem tài khoản đã được xác nhận email chưa.";
  if (m.includes("email not confirmed"))
    return "Tài khoản chưa xác nhận email. Vui lòng kiểm tra hộp thư để xác nhận trước khi đăng nhập.";
  if (m.includes("network") || m.includes("fetch"))
    return "Lỗi kết nối mạng. Kiểm tra internet trên thiết bị và thử lại.";
  return msg;
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        alertMessage("Lỗi", translateAuthError(error.message));
        return;
      }

      router.replace("/(tabs)");
    } catch (err: any) {
      alertMessage("Lỗi", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Notifier</Text>
      <Text style={styles.subtitle}>Đăng nhập để tiếp tục</Text>

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
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/register")}>
        <Text style={styles.link}>Chưa có tài khoản? Đăng ký</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: "center",
      padding: 24,
    },
    title: {
      color: C.text,
      fontSize: 42,
      fontWeight: "bold",
      marginBottom: 10,
    },
    subtitle: {
      color: C.subText,
      fontSize: 18,
      marginBottom: 40,
    },
    input: {
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      padding: 18,
      color: C.text,
      fontSize: 16,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: C.border,
    },
    button: {
      backgroundColor: C.primary,
      padding: 18,
      borderRadius: RADIUS.md,
      alignItems: "center",
      marginTop: 10,
    },
    buttonText: {
      color: "white",
      fontSize: 18,
      fontWeight: "bold",
    },
    link: {
      color: C.primary,
      textAlign: "center",
      marginTop: 24,
      fontSize: 16,
    },
  });
}
