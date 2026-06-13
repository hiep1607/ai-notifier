import React, { useState } from "react";

import {
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
import { Rule } from "../../types/Rule";
import { Notification } from "../../types/Notification";

const COLORS = {
  background: "#081120",
  card: "#101B35",
  primary: "#4DA6FF",
  text: "#FFFFFF",
  subText: "#8A9BB5",
  success: "#39D98A",
  danger: "#FF5B7F",
};

export default function HomeScreen() {
  const { user } = useAuth();

  const [rules, setRules] =
    useState<Rule[]>([]);

  const [notificationsCount, setNotificationsCount] =
    useState(0);

  const [importantCount, setImportantCount] =
    useState(0);

  const [refreshing, setRefreshing] = useState(false);

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

    const { data: userRules } = await supabase
      .from("rules")
      .select("id")
      .eq("user_id", user.id);

    const ruleIds =
      userRules?.map((r) => r.id) ?? [];

    if (ruleIds.length > 0) {
      const { data: notificationsData } =
        await supabase
          .from("notifications")
          .select("*")
          .in("rule_id", ruleIds);

      if (notificationsData) {
        const typed =
          notificationsData as Notification[];

        setNotificationsCount(typed.length);

        setImportantCount(
          typed.filter((n) => n.is_important).length
        );
      }
    } else {
      setNotificationsCount(0);
      setImportantCount(0);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4DA6FF" />}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Chào bạn 👋
            </Text>

            <Text style={styles.subtitle}>
              AI đang theo dõi thông tin cho bạn
            </Text>
          </View>

          <View style={styles.avatar}>
            <Ionicons
              name="person"
              size={24}
              color={COLORS.text}
            />
          </View>
        </View>

        {/* AI INSIGHT */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push("/(tabs)/notifications")}
        >
          <LinearGradient
            colors={["#1E3A8A", "#172554"]}
            style={styles.aiCard}
          >
            <View style={styles.aiHeader}>
              <Text style={styles.aiEmoji}>🤖</Text>

              <Text style={styles.aiTitle}>
                AI Insight
              </Text>
            </View>

            <Text style={styles.aiText}>
              Có {importantCount} thông báo quan trọng
              cần bạn xem hôm nay.
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* STATS */}
        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statsNumber}>
              {rules.filter((r) => r.is_active).length}
            </Text>

            <Text style={styles.statsLabel}>
              Rules hoạt động
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statsNumber}>
              {notificationsCount}
            </Text>

            <Text style={styles.statsLabel}>
              Thông báo
            </Text>
          </View>
        </View>

        {/* RULE HEADER */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Rules đang hoạt động
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push("/(tabs)/rules" as any)
            }
          >
            <Text style={styles.viewAll}>
              Xem tất cả
            </Text>
          </TouchableOpacity>
        </View>

        {/* RULE LIST */}
        {rules
          .filter((r) => r.is_active)
          .map((rule) => (
            <TouchableOpacity
              key={rule.id}
              style={styles.ruleCard}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: "/rule-detail",
                  params: { id: rule.id },
                })
              }
            >
              <View>
                <Text style={styles.ruleTitle}>
                  {rule.title}
                </Text>

                <Text style={styles.ruleDescription}>
                  {rule.description}
                </Text>
              </View>

              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: COLORS.success },
                ]}
              />
            </TouchableOpacity>
          ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FLOAT BUTTON */}
      <TouchableOpacity
        style={styles.floatButton}
        onPress={() => router.push("/create-rule")}
      >
        <Ionicons name="add" size={34} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 70,
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },

  greeting: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "bold",
  },

  subtitle: {
    color: COLORS.subText,
    marginTop: 6,
    fontSize: 16,
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  aiCard: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 28,
  },

  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  aiEmoji: {
    fontSize: 22,
    marginRight: 10,
  },

  aiTitle: {
    color: COLORS.primary,
    fontSize: 26,
    fontWeight: "bold",
  },

  aiText: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
  },

  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },

  statCard: {
    width: "48%",
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 22,
  },

  statsNumber: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },

  statsLabel: {
    color: COLORS.subText,
    fontSize: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "bold",
  },

  viewAll: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  ruleCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  ruleTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },

  ruleDescription: {
    color: COLORS.subText,
    fontSize: 16,
  },

  statusDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
  },

  floatButton: {
    position: "absolute",
    bottom: 100,
    right: 24,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
  },
});
