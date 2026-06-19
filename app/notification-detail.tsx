import React, { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "../lib/supabase";
import { useTheme } from "../contexts/ThemeContext";
import { Notification } from "../types/Notification";
import { findCategory, findSentiment } from "../lib/ruleOptions";
import { RADIUS, type AppColors } from "../lib/theme";

export default function NotificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("@settings").then((raw) => {
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.aiSummaryEnabled === "boolean") {
          setAiSummaryEnabled(parsed.aiSummaryEnabled);
        }
      }
    });
    if (id) fetchNotification();
  }, [id]);

  const fetchNotification = async () => {
    setLoading(true);

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setNotification(data as Notification);

      if (!data.is_read) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("id", id);
      }
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!notification) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.subText }}>Không tìm thấy thông báo</Text>
      </View>
    );
  }

  const cat = notification.category ? findCategory(notification.category) : null;
  const sentiment = findSentiment(notification.sentiment);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.titleBox}>
            <Text style={styles.title}>{notification.title}</Text>

            {notification.is_important && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Quan trọng</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* META: nguồn + thời gian */}
      <View style={styles.metaRow}>
        {notification.source ? (
          <View style={styles.metaItem}>
            <Ionicons name="globe-outline" size={14} color={colors.subText} />
            <Text style={styles.metaText}>{notification.source}</Text>
          </View>
        ) : null}

        {notification.created_at && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={colors.subText} />
            <Text style={styles.metaText}>
              {new Date(notification.created_at).toLocaleString("vi-VN")}
            </Text>
          </View>
        )}
      </View>

      {/* TAGS: danh mục + sắc thái */}
      <View style={styles.tagRow}>
        {cat && (
          <View style={[styles.tag, { backgroundColor: cat.color + "22", borderColor: cat.color }]}>
            <Ionicons name={cat.icon} size={14} color={cat.color} />
            <Text style={[styles.tagText, { color: cat.color }]}>{cat.label}</Text>
          </View>
        )}

        {sentiment && (
          <View style={[styles.tag, { backgroundColor: sentiment.color + "22", borderColor: sentiment.color }]}>
            <Ionicons name={sentiment.icon} size={14} color={sentiment.color} />
            <Text style={[styles.tagText, { color: sentiment.color }]}>{sentiment.label}</Text>
          </View>
        )}
      </View>

      {/* AI SUMMARY */}
      {aiSummaryEnabled && notification.ai_summary ? (
        <View style={[styles.box, styles.summaryBox]}>
          <View style={styles.boxTitleRow}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={styles.boxTitle}>AI tóm tắt</Text>
          </View>
          <Text style={styles.boxText}>{notification.ai_summary}</Text>
        </View>
      ) : null}

      {/* ORIGINAL CONTENT */}
      <View style={styles.box}>
        <Text style={styles.boxTitle}>Nội dung</Text>
        <Text style={styles.boxText}>{notification.content}</Text>
      </View>

      {/* DETAILS */}
      {notification.details ? (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Phân tích chi tiết</Text>
          <Text style={styles.boxText}>{notification.details}</Text>
        </View>
      ) : null}

      {/* ĐỌC BÀI GỐC — hoặc, nếu không có URL, mở thông báo trước (fallback "chưa có thay đổi") */}
      {notification.source_url ? (
        <TouchableOpacity
          style={styles.sourceButton}
          onPress={() => Linking.openURL(notification.source_url!)}
          activeOpacity={0.85}
        >
          <Ionicons name="open-outline" size={20} color="white" />
          <Text style={styles.sourceButtonText}>Đọc bài gốc</Text>
        </TouchableOpacity>
      ) : notification.related_notification_id ? (
        <TouchableOpacity
          style={styles.sourceButton}
          onPress={() =>
            router.push({
              pathname: "/notification-detail",
              params: { id: notification.related_notification_id! },
            })
          }
          activeOpacity={0.85}
        >
          <Ionicons name="albums-outline" size={20} color="white" />
          <Text style={styles.sourceButtonText}>Xem thông báo trước</Text>
        </TouchableOpacity>
      ) : null}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: "center",
      alignItems: "center",
    },
    container: {
      flex: 1,
      backgroundColor: C.background,
      paddingTop: 70,
      paddingHorizontal: 20,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    backButton: {
      marginRight: 14,
      marginTop: 4,
    },
    headerContent: {
      flex: 1,
    },
    titleBox: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      color: C.text,
      fontSize: 24,
      fontWeight: "bold",
      flex: 1,
      marginRight: 12,
    },
    badge: {
      backgroundColor: C.danger + "22",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.danger + "55",
    },
    badgeText: {
      color: C.danger,
      fontSize: 12,
      fontWeight: "bold",
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 16,
      marginBottom: 14,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    metaText: {
      color: C.subText,
      fontSize: 13,
    },
    tagRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 24,
    },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
    },
    tagText: {
      fontSize: 13,
      fontWeight: "bold",
    },
    box: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 20,
      marginBottom: 22,
    },
    summaryBox: {
      borderWidth: 1,
      borderColor: C.primary + "55",
    },
    boxTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    boxTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 12,
    },
    boxText: {
      color: C.subText,
      lineHeight: 24,
    },
    sourceButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: RADIUS.md,
      paddingVertical: 16,
    },
    sourceButtonText: {
      color: "white",
      fontSize: 16,
      fontWeight: "bold",
    },
  });
}
