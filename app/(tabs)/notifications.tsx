import React, { useMemo, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
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
import {
  countNotificationsFor,
  fetchNotificationsFor,
  NOTIFICATIONS_PAGE_SIZE,
} from "../../lib/notifQuery";
import { getMemCache, loadCache, saveCache } from "../../lib/screenCache";
import { notifsCacheKey, type NotifsCache } from "../../lib/prefetch";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Notification } from "../../types/Notification";
import { SCREEN, RADIUS, type AppColors } from "../../lib/theme";
import IconBadge from "../../components/IconBadge";
import FilterTabs from "../../components/FilterTabs";
import { alertMessage } from "../../lib/dialog";

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
  // Khởi tạo THẲNG từ cache RAM (prefetch lúc mở app đã đổ sẵn) — khung hình
  // đầu tiên đã có dữ liệu, không còn chớp "Chưa có thông báo" rồi mới hiện.
  const initialCache = user ? getMemCache<NotifsCache>(notifsCacheKey(user.id)) : null;
  const [notifications, setNotifications] = useState<Notification[]>(initialCache?.notifs ?? []);
  const [ruleNames, setRuleNames] = useState<Record<string, string>>(initialCache?.nameMap ?? {});
  const [unreadCount, setUnreadCount] = useState(initialCache?.unreadCount ?? 0);
  // Chưa từng có dữ liệu (cache trống + mạng chưa về) → hiện vòng xoay thay vì
  // câu "Chưa có thông báo" gây hiểu lầm.
  const [firstLoadDone, setFirstLoadDone] = useState(Boolean(initialCache));
  const [refreshing, setRefreshing] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState(true);
  const [hasMore, setHasMore] = useState((initialCache?.notifs.length ?? 0) >= NOTIFICATIONS_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications(true);
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
      if (user) fetchNotifications(true);
      // fetchNotifications chỉ đọc `user` (đã có trong deps) → không thêm vào deps để tránh tạo lại mỗi render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  const fetchNotifications = async (reset: boolean) => {
    if (!user) return;

    if (!reset) {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
      try {
        const more = await fetchNotificationsFor(user.id, {
          limit: NOTIFICATIONS_PAGE_SIZE,
          offset: notifications.length,
        });
        setNotifications((prev) => {
          const known = new Set(prev.map((n) => n.id));
          return [...prev, ...more.filter((n) => !known.has(n.id))];
        });
        setHasMore(more.length === NOTIFICATIONS_PAGE_SIZE);
      } catch (error) {
        alertMessage("Chưa tải thêm được", error instanceof Error ? error.message : String(error));
      } finally {
        setLoadingMore(false);
      }
      return;
    }

    // (1) Lần vào đầu: vẽ NGAY từ cache lần trước — chạy SONG SONG với mạng
    // (trước đây chờ đọc cache xong mới gọi mạng); mạng về trước thì bỏ qua cache.
    let networkDone = false;
    if (notifications.length === 0) {
      loadCache<NotifsCache>(notifsCacheKey(user.id)).then((cached) => {
        if (cached && !networkDone) {
          setRuleNames(cached.nameMap);
          setNotifications(cached.notifs);
          setFirstLoadDone(true);
        }
      });
    }

    // (2) Bản mới: 2 truy vấn SONG SONG; thông báo lọc theo user_id (0021 — thấy cả
    // "mồ côi rule", helper tự fallback rule_id) và chỉ lấy 100 dòng gần nhất
    // (trước đây tải TOÀN BỘ lịch sử nên vừa chậm mạng vừa chậm render).
    try {
      const [rulesRes, notifs, unread] = await Promise.all([
        supabase.from("rules").select("id, title, keyword").eq("user_id", user.id),
        fetchNotificationsFor(user.id, { limit: NOTIFICATIONS_PAGE_SIZE }),
        countNotificationsFor(user.id, { unreadOnly: true }),
      ]);
      if (rulesRes.error) throw new Error(rulesRes.error.message);
      networkDone = true;

      const nameMap: Record<string, string> = {};
      (rulesRes.data ?? []).forEach((r: { id: string; title?: string; keyword?: string }) => {
        nameMap[r.id] = r.title || r.keyword || "Rule";
      });
      setRuleNames(nameMap);
      setNotifications(notifs);
      setUnreadCount(unread);
      setHasMore(notifs.length === NOTIFICATIONS_PAGE_SIZE);
      setLoadError(null);
      setFirstLoadDone(true);
      saveCache(notifsCacheKey(user.id), { nameMap, notifs, unreadCount: unread });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      setFirstLoadDone(true);
      console.log("Không thể làm mới thông báo, giữ cache cũ:", error);
    }
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

  const handleMarkAllRead = async () => {
    if (!user || unreadCount === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (error) {
      alertMessage("Chưa đánh dấu được", error.message);
      return;
    }
    const next = notifications.map((n) => ({ ...n, is_read: true }));
    setNotifications(next);
    setUnreadCount(0);
    saveCache(notifsCacheKey(user.id), { nameMap: ruleNames, notifs: next, unreadCount: 0 });
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const removed = notifications.find((n) => n.id === id);
    const { error } = await supabase.from("notifications").delete()
      .eq("id", id).eq("user_id", user.id);
    if (error) {
      alertMessage("Chưa xóa được", error.message);
      return;
    }
    const next = notifications.filter((n) => n.id !== id);
    const nextUnread = removed && !removed.is_read ? Math.max(0, unreadCount - 1) : unreadCount;
    setNotifications(next);
    setUnreadCount(nextUnread);
    saveCache(notifsCacheKey(user.id), {
      nameMap: ruleNames,
      notifs: next.slice(0, NOTIFICATIONS_PAGE_SIZE),
      unreadCount: nextUnread,
    });
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

  // Gom danh sách (đã sắp xếp mới→cũ) thành dãy dòng phẳng cho FlatList: dòng nhãn
  // ngày (Hôm nay/Hôm qua/dd-mm) chen giữa các dòng thông báo, giữ nguyên thứ tự.
  // FlatList ẢO HÓA: chỉ vẽ ~chục dòng quanh khung nhìn — trước đây ScrollView+map
  // dựng cả 100 card Swipeable một lượt làm LẦN ĐẦU mở tab đứng hình vài giây.
  type ListRow =
    | { kind: "label"; key: string; label: string }
    | { kind: "notif"; key: string; item: Notification };
  const listRows: ListRow[] = (() => {
    const rows: ListRow[] = [];
    let lastLabel = "";
    for (const n of displayedNotifications) {
      const label = dayLabel(n.created_at);
      if (label !== lastLabel) {
        rows.push({ kind: "label", key: `label:${label}`, label });
        lastLabel = label;
      }
      rows.push({ kind: "notif", key: n.id, item: n });
    }
    return rows;
  })();

  const renderRow = ({ item: row }: { item: ListRow }) => {
    if (row.kind === "label") {
      return <Text style={styles.groupLabel}>{row.label}</Text>;
    }
    const item = row.item;
    return (
      <ReanimatedSwipeable renderRightActions={() => renderRightActions(item.id)}>
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
    );
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
              {unreadCount > 0 && (
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

      {/* LIST — FlatList ảo hóa: cuộn tới đâu vẽ tới đó, mở tab lần đầu không đứng hình.
          flex:1 = chiếm đúng phần còn lại, không chèn ép hàng chip lọc phía trên. */}
      <FlatList
        style={{ flex: 1 }}
        data={listRows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        onEndReached={() => fetchNotifications(false)}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          !firstLoadDone ? (
            // Đang tải lần đầu (chưa từng có cache) — xoay vòng, đừng nói "chưa có".
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.emptyText}>Đang tải thông báo...</Text>
            </View>
          ) : loadError && notifications.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Không thể tải thông báo</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={() => fetchNotifications(true)}>
                <Text style={styles.emptyButtonText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
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
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ paddingVertical: 18 }} color={colors.primary} /> : null
        }
      />
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
      // Đứng cạnh FlatList (flex:1) phải KHÓA cao độ, không thì bị bóp dẹp mất chữ:
      // chip = text ~20 + padding 7×2 + viền 1×2 ≈ 36.
      flexShrink: 0,
      height: 36,
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
