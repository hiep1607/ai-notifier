import React, { useState } from "react";

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

export default function LoginScreen() {
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);

      const { error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

      if (error) {
        alertMessage("Lỗi", error.message);
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

      <Text style={styles.subtitle}>
        Đăng nhập để tiếp tục
      </Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor="#888"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push("/register")}
      >
        <Text style={styles.link}>
          Chưa có tài khoản? Đăng ký
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#081120",
    justifyContent: "center",
    padding: 24,
  },

  title: {
    color: "white",
    fontSize: 42,
    fontWeight: "bold",
    marginBottom: 10,
  },

  subtitle: {
    color: "#9DB2CE",
    fontSize: 18,
    marginBottom: 40,
  },

  input: {
    backgroundColor: "#101B35",
    borderRadius: 18,
    padding: 18,
    color: "white",
    fontSize: 16,
    marginBottom: 18,
  },

  button: {
    backgroundColor: "#4DA6FF",
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 10,
  },

  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },

  link: {
    color: "#4DA6FF",
    textAlign: "center",
    marginTop: 24,
    fontSize: 16,
  },
});
