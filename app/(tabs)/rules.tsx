import { useFocusEffect } from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Rule } from "../../types/Rule";
import { SCREEN, RADIUS, GLOW, type AppColors } from "../../lib/theme";
import { findCategory } from "../../lib/ruleOptions";
import IconBadge from "../../components/IconBadge";
import FilterTabs from "../../components/FilterTabs";

const TABS = [
  { key: "all", label: "Tất cả" },
  { key: "active", label: "Đang hoạt động" },
  { key: "paused", label: "Tạm dừng" },
];

export default function RulesScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState("all");
  const [rules, setRules] = useState<Rule[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [createMenuVisible, setCreateMenuVisible] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRules();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) fetchRules();
    }, [user])
  );

  const fetchRules = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("rules")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.log(error);
      return;
    }

    if (data) {
      setRules(data as Rule[]);
    }
  };

  const filteredRules =
    activeTab === "all"
      ? rules
      : activeTab === "active"
      ? rules.filter((r) => r.is_active)
      : rules.filter((r) => !r.is_active);

  const toggleRule = async (item: Rule) => {
    const newValue = !item.is_active;
    setRules((prev) =>
      prev.map((rule) => (rule.id === item.id ? { ...rule, is_active: newValue } : rule))
    );
    await supabase.from("rules").update({ is_active: newValue }).eq("id", item.id);
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Rules</Text>
        <View style={styles.headerIcons}>
          <Ionicons name="search" size={22} color={colors.text} />
          <Ionicons name="filter" size={22} color={colors.text} />
        </View>
      </View>

      {/* FILTER TABS */}
      <FilterTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* RULE LIST */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {filteredRules.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={44} color={colors.muted} />
            <Text style={styles.emptyText}>Chưa có rule nào</Text>
          </View>
        )}

        {filteredRules.map((item) => {
          const cat = findCategory(item.category);
          return (
            <View key={item.id} style={styles.ruleCard}>
              <TouchableOpacity
                style={styles.ruleLeft}
                activeOpacity={0.8}
                onPress={() =>
                  router.push({ pathname: "/rule-detail", params: { id: item.id } })
                }
              >
                <IconBadge category={item.category} size={50} />
                <View style={styles.ruleText}>
                  <Text style={styles.ruleTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.ruleDesc} numberOfLines={1}>{item.description}</Text>
                  <View style={[styles.catTag, { backgroundColor: cat.color + "22" }]}>
                    <Text style={[styles.catTagText, { color: cat.color }]}>{cat.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              <Switch
                value={item.is_active}
                onValueChange={() => toggleRule(item)}
                thumbColor={item.is_active ? colors.primary : "#999"}
                trackColor={{ true: colors.primary + "66", false: colors.border }}
              />
            </View>
          );
        })}
      </ScrollView>

      {/* ADD BUTTON */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setCreateMenuVisible(true)}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

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
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
    },
    title: {
      color: C.text,
      fontSize: 32,
      fontWeight: "bold",
    },
    headerIcons: {
      flexDirection: "row",
      gap: 18,
    },
    empty: {
      alignItems: "center",
      paddingVertical: 60,
      gap: 14,
    },
    emptyText: {
      color: C.muted,
      fontSize: 15,
    },
    ruleCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 16,
      marginBottom: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    ruleLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: 10,
    },
    ruleText: {
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
      marginTop: 3,
    },
    catTag: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      marginTop: 8,
    },
    catTagText: {
      fontSize: 11,
      fontWeight: "700",
    },
    addButton: {
      position: "absolute",
      bottom: 100,
      right: 24,
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: C.primary,
      justifyContent: "center",
      alignItems: "center",
      ...GLOW,
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
