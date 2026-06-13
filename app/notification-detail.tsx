import React, { useEffect, useState } from "react";

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "../lib/supabase";
import { Notification } from "../types/Notification";
import { findCategory, findSentiment } from "../lib/ruleOptions";

const COLORS = {
  background: "#081120",
  card: "#101B35",
  primary: "#4DA6FF",
  text: "#FFFFFF",
  subText: "#7B8AA0",
};

export default function NotificationDetailScreen() {
  const { id } =
    useLocalSearchParams<{ id: string }>();

  const [notification, setNotification] =
    useState<Notification | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />
      </View>
    );
  }

  if (!notification) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: COLORS.subText }}>
          Không tìm thấy thông báo
        </Text>
      </View>
    );
  }

  const cat = notification.category ? findCategory(notification.category) : null;
  const sentiment = findSentiment(notification.sentiment);

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={28}
            color="white"
          />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.titleBox}>
            <Text style={styles.title}>
              {notification.title}
            </Text>

            {notification.is_important && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  Quan trọng
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* META: nguồn + thời gian */}
      <View style={styles.metaRow}>
        {notification.source ? (
          <View style={styles.metaItem}>
            <Ionicons name="globe-outline" size={14} color={COLORS.subText} />
            <Text style={styles.metaText}>{notification.source}</Text>
          </View>
        ) : null}

        {notification.created_at && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={COLORS.subText} />
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
      {notification.ai_summary ? (
        <View style={[styles.box, styles.summaryBox]}>
          <View style={styles.boxTitleRow}>
            <Ionicons name="sparkles" size={16} color={COLORS.primary} />
            <Text style={styles.boxTitle}>AI tóm tắt</Text>
          </View>
          <Text style={styles.boxText}>
            {notification.ai_summary}
          </Text>
        </View>
      ) : null}

      {/* ORIGINAL CONTENT */}
      <View style={styles.box}>
        <Text style={styles.boxTitle}>Nội dung</Text>
        <Text style={styles.boxText}>
          {notification.content}
        </Text>
      </View>

      {/* DETAILS / PHÂN TÍCH */}
      {notification.details ? (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Phân tích chi tiết</Text>
          <Text style={styles.boxText}>
            {notification.details}
          </Text>
        </View>
      ) : null}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    flex: 1,
    marginRight: 12,
  },

  badge: {
    backgroundColor: "#3B1D1D",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  badgeText: {
    color: "#FF6B6B",
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
    color: COLORS.subText,
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
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 20,
    marginBottom: 22,
  },

  summaryBox: {
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },

  boxTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  boxTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },

  boxText: {
    color: "#B8C7E0",
    lineHeight: 24,
  },
});
