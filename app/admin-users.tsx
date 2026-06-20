// Quản trị — danh sách người dùng + thống kê nhanh. Tap để xem chi tiết.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { SCREEN, RADIUS, type AppColors } from "../lib/theme";
import { adminCall, isAdminEmail, type AdminUser } from "../lib/admin";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const allowed = isAdminEmail(user?.email);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await adminCall<{ users: AdminUser[] }>("users");
      setUsers(res.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  if (!allowed) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Không có quyền.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Người dùng</Text>
          <Text style={styles.subtitle}>{users.length} tài khoản</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        users.map((u) => (
          <Pressable
            key={u.id}
            style={styles.userCard}
            onPress={() => router.push({ pathname: "/admin-user-detail" as never, params: { id: u.id } as never })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(u.email || "?").charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
              <Text style={styles.meta}>
                {u.rules} rule · {u.notifications} tb · tạo {fmtDate(u.created_at)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background, paddingTop: SCREEN.paddingTop, paddingHorizontal: SCREEN.paddingHorizontal },
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
    header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
    headerBack: { padding: 2 },
    title: { color: C.text, fontSize: 30, fontWeight: "bold" },
    subtitle: { color: C.subText, marginTop: 4, fontSize: 14 },
    userCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary + "33", alignItems: "center", justifyContent: "center" },
    avatarText: { color: C.primary, fontSize: 18, fontWeight: "800" },
    email: { color: C.text, fontSize: 14.5, fontWeight: "700" },
    meta: { color: C.subText, fontSize: 12.5, marginTop: 3 },
    muted: { color: C.muted, fontSize: 14 },
    error: { color: C.danger, fontSize: 13.5, textAlign: "center", paddingVertical: 20 },
  });
}
