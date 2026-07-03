import React, { useMemo, useState } from "react";

import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { supabase } from "../../lib/supabase";
import { fetchNotificationsFor } from "../../lib/notifQuery";
import { loadCache, saveCache } from "../../lib/screenCache";
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
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ruleNames, setRuleNames] = useState<Record<string, string>>({});
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
      // fetchNotifications chỉ đọc `user` (đã có trong deps) → không thêm vào deps để tránh tạo lại mỗi render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  const fetchNotifications = async () => {
    if (!user) return;

    // (1) Lần vào đầu: vẽ NGAY từ cache lần trước — hết cảnh tab trống chờ mạng.
    if (notifications.length === 0) {
      const cached = await loadCache<{ nameMap: Record<string, string>; notifs: Notification[] }>(
        `@cache_notifs_${user.id}`,
      );
      if (cached) {
        setRuleNames(cached.nameMap);
        setNotifications(cached.notifs);
      }
    }

    // (2) Bản mới: 2 truy vấn SONG SONG; thông báo lọc theo user_id (0021 — thấy cả
    // "mồ côi rule", helper tự fallback rule_id) và chỉ lấy 100 dòng gần nhất
    // (trước đây tải TOÀN BỘ lịch sử nên vừa chậm mạng vừa chậm render).
    const [rulesRes, notifs] = await Promise.all([
      supabase.from("rules").select("id, title, keyword").eq("user_id", user.id),
      fetchNotificationsFor(user.id, { limit: 100 }),
    ]);

    // Map rule_id → tên rule để gắn nhãn lên từng thông báo (nhìn là biết của rule nào).
    const nameMap: Record<string, string> = {};
    (rulesRes.data ?? []).forEach((r: { id: string; title?: string; keyword?: string }) => {
      nameMap[r.id] = r.title || r.keyword || "Rule";
    });
    setRuleNames(nameMap);
    setNotifications(notifs);
    saveCache(`@cache_notifs_${user.id}`, { nameMap, notifs });
  };

  const tabFiltered =
    activeTab === "all"
      ? notifications
      : activeTab === "unread"
      ? notifications.filter((n) => !n.is_read)
      : notifications.filter((n) => n.is_important);

  const ruleFiltered = selectedRuleId
    ? tabFiltered.filter((n) => n.rule_id === selectedRuleId)
    : tabFiltered;

  const displayedNotifications =
    searchText.trim() === ""
      ? ruleFiltered
      : ruleFiltered.filter(
          (n) =>
            n.title.toLowerCase().includes(searchText.toLowerCase()) ||
            n.content.toLowerCase().includes(searchText.toLowerCase())
        );

  const ruleList = Object.entries(ruleNames).map(([id, name]) => ({ id, name }));

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

  // Nhãn ngày cho tiêu đề nhóm: Hôm nay / Hôm qua / dd/mm/yyyy.
  const dayLabel = (iso?: string) => {
    if (!iso) return "Khác";
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    if (sameDay(d, today)) return "Hôm nay";
    if (sameDay(d, yesterday)) return "Hôm qua";
    return d.toLocaleDateString("vi-VN");
  };

  // Gom danh sách (đã sắp xếp mới→cũ) thành các nhóm theo ngày, giữ nguyên thứ tự.
  const groupedNotifications = (() => {
    const groups: { label: string; items: Notification[] }[] = [];
    for (const n of displayedNotifications) {
      const label = dayLabel(n.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(n);
      else groups.push({ label, items: [n] });
    }
    return groups;
  })();

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

      {/* RULE FILTER — chỉ hiện khi có > 1 rule */}
      {ruleList.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.ruleFilterScroll}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          <TouchableOpacity
            style={[styles.ruleFilterChip, !selectedRuleId && styles.ruleFilterChipActive]}
            onPress={() => setSelectedRuleId(null)}
            activeOpacity={0.75}
          >
            <Text style={[styles.ruleFilterChipText, !selectedRuleId && styles.ruleFilterChipTextActive]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          {ruleList.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.ruleFilterChip, selectedRuleId === r.id && styles.ruleFilterChipActive]}
              onPress={() => setSelectedRuleId(selectedRuleId === r.id ? null : r.id)}
              activeOpacity={0.75}
            >
              <Text
                style={[styles.ruleFilterChipText, selectedRuleId === r.id && styles.ruleFilterChipTextActive]}
                numberOfLines={1}
              >
                {r.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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
            {!searchText && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push("/(tabs)/rules" as any)}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color="white" />
                <Text style={styles.emptyButtonText}>Tạo rule để nhận thông báo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {groupedNotifications.map((group) => (
          <View key={group.label}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            {group.items.map((item) => (
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
              {item.rule_id && ruleNames[item.rule_id] ? (
                <View style={styles.ruleChip}>
                  <Ionicons name="pricetag" size={11} color={colors.primary} />
                  <Text style={styles.ruleChipText} numberOfLines={1}>
                    {ruleNames[item.rule_id]}
                  </Text>
                </View>
              ) : null}

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
          </View>
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
    emptyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: C.primary,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: RADIUS.md,
      marginTop: 4,
    },
    emptyButtonText: {
      color: "white",
      fontSize: 15,
      fontWeight: "700",
    },
    groupLabel: {
      color: C.muted,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 10,
      marginTop: 4,
      marginLeft: 2,
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
    ruleChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 4,
      backgroundColor: C.primary + "1A",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      marginBottom: 6,
      maxWidth: "100%",
    },
    ruleChipText: {
      color: C.primary,
      fontSize: 11,
      fontWeight: "700",
      maxWidth: 180,
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
    ruleFilterScroll: {
      marginBottom: 12,
      flexGrow: 0,
    },
    ruleFilterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      marginRight: 8,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      maxWidth: Platform.OS === "web" ? 180 : 160,
    },
    ruleFilterChipActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    ruleFilterChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: C.subText,
    },
    ruleFilterChipTextActive: {
      color: "white",
    },
  });
}
