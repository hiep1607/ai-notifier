import React, { useState } from "react";

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

export default function RegisterScreen() {
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    try {
      setLoading(true);

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) {
        alertMessage("Lỗi", error.message);
        return;
      }

      alertMessage("Thành công", "Đăng ký thành công! Vui lòng đăng nhập.");
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

        <Text style={styles.subtitle}>
          Đăng ký để dùng AI Notifier
        </Text>
      </View>

      <TextInput
        placeholder="Email"
        placeholderTextColor="#7B8AA0"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        placeholder="Mật khẩu"
        placeholderTextColor="#7B8AA0"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Đang đăng ký..." : "Đăng ký"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push("/login")}
      >
        <Text style={styles.link}>
          Đã có tài khoản? Đăng nhập
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#081120",
    paddingHorizontal: 26,
    justifyContent: "center",
  },

  header: {
    marginBottom: 40,
  },

  title: {
    color: "white",
    fontSize: 52,
    fontWeight: "bold",
    marginBottom: 14,
  },

  subtitle: {
    color: "#9AB4E0",
    fontSize: 18,
  },

  input: {
    backgroundColor: "#101B35",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 20,
    color: "white",
    fontSize: 18,
    marginBottom: 22,
  },

  button: {
    backgroundColor: "#4DA6FF",
    borderRadius: 24,
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
    color: "#4DA6FF",
    textAlign: "center",
    marginTop: 36,
    fontSize: 16,
    fontWeight: "600",
  },
});
