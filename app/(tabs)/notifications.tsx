import React, { useMemo, useState } from "react";

import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Notification } from "../../types/Notification";
import { SCREEN, RADIUS, type AppColors } from "../../lib/theme";
import IconBadge from "../../components/IconBadge";
import FilterTabs from "../../components/FilterTabs";

const TABS = [
  { key: "all", label: "Tất cả" },
  { key: "unread", label: "Chưa đọc" },
  { key: "important", label: "Quan trọng" },
];

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      AsyncStorage.getItem("@settings").then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.aiSummaryEnabled === "boolean") {
            setAiSummaryEnabled(parsed.aiSummaryEnabled);
          }
        }
      });
      if (user) fetchNotifications();
    }, [user])
  );

  const fetchNotifications = async () => {
    if (!user) return;

    const { data: userRules } = await supabase
      .from("rules")
      .select("id")
      .eq("user_id", user.id);

    const ruleIds = userRules?.map((r) => r.id) ?? [];

    if (ruleIds.length === 0) {
      setNotifications([]);
      return;
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .in("rule_id", ruleIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.log(error);
      return;
    }

    if (data) {
      setNotifications(data as Notification[]);
    }
  };

  const tabFiltered =
    activeTab === "all"
      ? notifications
      : activeTab === "unread"
      ? notifications.filter((n) => !n.is_read)
      : notifications.filter((n) => n.is_important);

  const displayedNotifications =
    searchText.trim() === ""
      ? tabFiltered
      : tabFiltered.filter(
          (n) =>
            n.title.toLowerCase().includes(searchText.toLowerCase()) ||
            n.content.toLowerCase().includes(searchText.toLowerCase())
        );

  const closeSearch = () => {
    setSearchMode(false);
    setSearchText("");
  };

  const unreadNotifications = notifications.filter((n) => !n.is_read);

  const handleMarkAllRead = async () => {
    if (!unreadNotifications.length) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadNotifications.map((n) => n.id));
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const renderRightActions = (id: string) => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => handleDelete(id)}>
      <Ionicons name="trash-outline" size={22} color="white" />
      <Text style={styles.deleteText}>Xóa</Text>
    </TouchableOpacity>
  );

  const timeAgo = (iso?: string) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Vừa xong";
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return new Date(iso).toLocaleDateString("vi-VN");
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        {searchMode ? (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm thông báo..."
              placeholderTextColor={colors.subText}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            <TouchableOpacity onPress={closeSearch} style={styles.searchClose}>
              <Ionicons name="close" size={24} color={colors.subText} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Thông báo</Text>
            <View style={styles.headerActions}>
              {unreadNotifications.length > 0 && (
                <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
                  <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
                  <Text style={styles.markAllText}>Đọc hết</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setSearchMode(true)} style={styles.searchBtn}>
                <Ionicons name="search" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* TABS */}
      <FilterTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* LIST */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {displayedNotifications.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>
              {searchText ? "Không tìm thấy kết quả" : "Chưa có thông báo"}
            </Text>
          </View>
        )}

        {displayedNotifications.map((item) => (
          <ReanimatedSwipeable key={item.id} renderRightActions={() => renderRightActions(item.id)}>
          <TouchableOpacity
            style={[styles.card, !item.is_read && styles.cardUnread]}
            activeOpacity={0.85}
            onPress={() =>
              router.push({ pathname: "/notification-detail", params: { id: item.id } })
            }
          >
            <IconBadge category={item.category} size={48} />

            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                {!item.is_read && <View style={styles.dot} />}
              </View>

              <Text style={styles.cardDesc} numberOfLines={2}>
                {aiSummaryEnabled && item.ai_summary ? item.ai_summary : item.content}
              </Text>

              <View style={styles.cardFooter}>
                {item.is_important && (
                  <View style={styles.importantBadge}>
                    <Ionicons name="alert-circle" size={12} color={colors.danger} />
                    <Text style={styles.importantText}>Quan trọng</Text>
                  </View>
                )}
                {item.source ? <Text style={styles.source}>{item.source}</Text> : null}
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
            </View>
          </TouchableOpacity>
          </ReanimatedSwipeable>
        ))}
      </ScrollView>
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
      marginBottom: 22,
    },
    title: {
      color: C.text,
      fontSize: 32,
      fontWeight: "bold",
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    markAllBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: C.card,
    },
    markAllText: {
      color: C.primary,
      fontSize: 13,
      fontWeight: "600",
    },
    searchBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.card,
      justifyContent: "center",
      alignItems: "center",
    },
    searchInput: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: C.text,
      fontSize: 16,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchClose: {
      marginLeft: 12,
      padding: 4,
    },
    empty: {
      alignItems: "center",
      marginTop: 80,
      gap: 16,
    },
    emptyText: {
      color: C.muted,
      fontSize: 15,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 16,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    cardUnread: {
      borderWidth: 1,
      borderColor: C.primary + "44",
    },
    cardBody: {
      flex: 1,
      marginLeft: 14,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cardTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "bold",
      flex: 1,
      marginRight: 8,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: C.primary,
    },
    cardDesc: {
      color: C.subText,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 10,
    },
    importantBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: C.danger + "22",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    importantText: {
      color: C.danger,
      fontSize: 11,
      fontWeight: "700",
    },
    source: {
      color: C.muted,
      fontSize: 12,
      fontWeight: "500",
    },
    time: {
      color: C.muted,
      fontSize: 12,
      marginLeft: "auto",
    },
    deleteAction: {
      backgroundColor: C.danger,
      justifyContent: "center",
      alignItems: "center",
      width: 80,
      borderRadius: RADIUS.lg,
      marginBottom: 14,
    },
    deleteText: {
      color: "white",
      fontSize: 12,
      fontWeight: "700",
      marginTop: 2,
    },
  });
}
