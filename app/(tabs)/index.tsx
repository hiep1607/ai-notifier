import React, { useMemo, useState } from "react";

import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Rule } from "../../types/Rule";
import { Notification } from "../../types/Notification";
import { SCREEN, RADIUS, GLOW, type AppColors } from "../../lib/theme";
import StatCard from "../../components/StatCard";
import IconBadge from "../../components/IconBadge";
import PrimaryButton from "../../components/PrimaryButton";

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [rules, setRules] = useState<Rule[]>([]);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [importantCount, setImportantCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [createMenuVisible, setCreateMenuVisible] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) fetchData();
    }, [user])
  );

  const fetchData = async () => {
    if (!user) return;

    const { data: rulesData } = await supabase
      .from("rules")
      .select("*")
      .eq("user_id", user.id);

    if (rulesData) {
      setRules(rulesData as Rule[]);
    }

    const ruleIds = (rulesData ?? []).map((r) => r.id);

    if (ruleIds.length > 0) {
      const { data: notificationsData } = await supabase
        .from("notifications")
        .select("*")
        .in("rule_id", ruleIds);

      if (notificationsData) {
        const typed = notificationsData as Notification[];
        setNotificationsCount(typed.length);
        setImportantCount(typed.filter((n) => n.is_important).length);
      }
    } else {
      setNotificationsCount(0);
      setImportantCount(0);
    }
  };

  const activeRules = rules.filter((r) => r.is_active);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>AI Notifier</Text>
              <Text style={styles.brandEmoji}>⚡</Text>
            </View>
            <Text style={styles.subtitle}>Theo dõi thông tin thông minh bằng AI</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.bell}
              onPress={() => router.push("/(tabs)/notifications")}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {importantCount > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bell}
              onPress={() => router.push("/profile")}
            >
              <Ionicons name="person-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* STATS */}
        <View style={styles.stats}>
          <StatCard
            value={rules.length}
            label="Rules"
            icon="list-outline"
            color={colors.primary}
            onPress={() => router.push("/(tabs)/rules" as any)}
          />
          <StatCard
            value={notificationsCount}
            label="Thông báo"
            icon="notifications-outline"
            color={colors.accent}
            onPress={() => router.push("/(tabs)/notifications" as any)}
          />
          <StatCard
            value={activeRules.length}
            label="Active"
            icon="pulse-outline"
            color={colors.success}
            onPress={() => router.push("/(tabs)/rules" as any)}
          />
        </View>

        {/* AI INSIGHT */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/(tabs)/notifications")}
        >
          <LinearGradient
            colors={isDark ? ["#1E3A8A", "#172554"] : [colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiCard}
          >
            <View style={styles.aiHeader}>
              <View style={styles.aiIcon}>
                <Ionicons name="sparkles" size={18} color="white" />
              </View>
              <Text style={styles.aiTitle}>AI Insight</Text>
            </View>
            <Text style={styles.aiText}>
              {importantCount > 0
                ? `Có ${importantCount} thông báo quan trọng cần bạn xem hôm nay.`
                : "Chưa có thông báo quan trọng nào. AI vẫn đang theo dõi cho bạn."}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* RULE SECTION HEADER */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rules đang hoạt động</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/rules" as any)}>
            <Text style={styles.viewAll}>Xem tất cả</Text>
          </TouchableOpacity>
        </View>

        {/* RULE LIST */}
        {activeRules.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="moon-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyText}>Chưa có rule nào hoạt động</Text>
          </View>
        ) : (
          activeRules.map((rule) => (
            <TouchableOpacity
              key={rule.id}
              style={styles.ruleCard}
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: "/rule-detail", params: { id: rule.id } })
              }
            >
              <IconBadge category={rule.category} size={48} />
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleTitle} numberOfLines={1}>{rule.title}</Text>
                <Text style={styles.ruleDesc} numberOfLines={1}>{rule.description}</Text>
              </View>
              <View style={styles.statusDot} />
            </TouchableOpacity>
          ))
        )}

        {/* CREATE BUTTON */}
        <PrimaryButton
          label="Tạo Rule mới"
          icon="add"
          onPress={() => setCreateMenuVisible(true)}
          style={{ marginTop: 10, ...GLOW }}
        />
      </ScrollView>

      {/* CREATE RULE MENU */}
      <Modal
        visible={createMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCreateMenuVisible(false)}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Tạo rule mới</Text>

            <TouchableOpacity
              style={styles.option}
              activeOpacity={0.8}
              onPress={() => {
                setCreateMenuVisible(false);
                router.push("/manual-rule");
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="create-outline" size={24} color="white" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Tạo thủ công</Text>
                <Text style={styles.optionDesc}>Tự điền tên, mô tả và từ khóa theo dõi</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              activeOpacity={0.8}
              onPress={() => {
                setCreateMenuVisible(false);
                router.push("/create-rule");
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.accent }]}>
                <Ionicons name="sparkles-outline" size={24} color="white" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Dùng AI</Text>
                <Text style={styles.optionDesc}>Mô tả mong muốn, AI tạo rule giúp bạn</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setCreateMenuVisible(false)}
            >
              <Text style={styles.cancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
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
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    brand: {
      color: C.text,
      fontSize: 28,
      fontWeight: "bold",
    },
    brandEmoji: {
      fontSize: 22,
    },
    subtitle: {
      color: C.subText,
      marginTop: 6,
      fontSize: 14,
    },
    headerActions: {
      flexDirection: "row",
      gap: 10,
    },
    bell: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.card,
      justifyContent: "center",
      alignItems: "center",
    },
    bellDot: {
      position: "absolute",
      top: 12,
      right: 13,
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: C.danger,
      borderWidth: 1.5,
      borderColor: C.card,
    },
    stats: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 24,
    },
    aiCard: {
      borderRadius: RADIUS.xl,
      padding: 22,
      marginBottom: 28,
    },
    aiHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    aiIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.18)",
      justifyContent: "center",
      alignItems: "center",
    },
    aiTitle: {
      color: "white",
      fontSize: 18,
      fontWeight: "bold",
    },
    aiText: {
      color: "#DCE6FF",
      fontSize: 15,
      lineHeight: 23,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "bold",
    },
    viewAll: {
      color: C.primary,
      fontWeight: "600",
      fontSize: 14,
    },
    empty: {
      alignItems: "center",
      paddingVertical: 30,
      gap: 12,
    },
    emptyText: {
      color: C.muted,
      fontSize: 14,
    },
    ruleCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 16,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "center",
    },
    ruleInfo: {
      flex: 1,
      marginLeft: 14,
    },
    ruleTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "bold",
    },
    ruleDesc: {
      color: C.subText,
      fontSize: 13,
      marginTop: 4,
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: C.success,
      marginLeft: 10,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: C.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 40,
    },
    sheetHandle: {
      alignSelf: "center",
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.border,
      marginBottom: 18,
    },
    sheetTitle: {
      color: C.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 20,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.cardAlt,
      borderRadius: RADIUS.md,
      padding: 16,
      marginBottom: 14,
    },
    optionIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    optionText: {
      flex: 1,
    },
    optionTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "bold",
    },
    optionDesc: {
      color: C.subText,
      fontSize: 13,
      marginTop: 4,
    },
    cancelButton: {
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 6,
    },
    cancelText: {
      color: C.muted,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
