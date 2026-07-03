import { useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { supabase } from "../../lib/supabase";
import { confirmAsync, alertMessage } from "../../lib/dialog";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Rule } from "../../types/Rule";
import { SCREEN, RADIUS, GLOW, type AppColors } from "../../lib/theme";
import { findCategory, formatSchedule } from "../../lib/ruleOptions";
import IconBadge from "../../components/IconBadge";
import FilterTabs from "../../components/FilterTabs";

const TABS = [
  { key: "all", label: "Tất cả" },
  { key: "active", label: "Đang hoạt động" },
  { key: "paused", label: "Tạm dừng" },
];

// Nhắc hẹn ĐÃ NHẮC XONG: server bắn thông báo rồi tự tắt rule (is_active=false,
// last_run_at >= remind_at). Không còn việc gì để làm với nó → tách khỏi danh sách
// chính (kể cả tab Tạm dừng), gom vào mục "Nhắc hẹn đã xong" để xem lại / xóa.
// KHÔNG tự xóa hộ: xóa rule sẽ kéo thông báo nhắc bị xóa theo (FK cascade 0014).
function isDoneReminder(r: Rule): boolean {
  return (
    r.source_type === "reminder" &&
    !r.is_active &&
    Boolean(r.last_run_at && r.remind_at) &&
    Date.parse(r.last_run_at!) >= Date.parse(r.remind_at!)
  );
}

function formatRemindTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${d.toLocaleDateString("vi-VN")}`;
}

export default function RulesScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState("all");
  const [rules, setRules] = useState<Rule[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [createMenuVisible, setCreateMenuVisible] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState("");
  // Banner "bật lọc rác cho rule cũ": ẩn vĩnh viễn sau khi user đóng (nhớ qua AsyncStorage).
  const [noiseBannerHidden, setNoiseBannerHidden] = useState(true);
  const [applyingImportant, setApplyingImportant] = useState(false);
  const [showDoneReminders, setShowDoneReminders] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("@noise_banner_hidden").then((v) => setNoiseBannerHidden(v === "1"));
  }, []);

  // Nút "+" nổi: kéo thả tự do, vẫn bấm để mở menu. Lưu vị trí để lần sau giữ nguyên.
  const fabX = useSharedValue(0);
  const fabY = useSharedValue(0);
  const fabStartX = useSharedValue(0);
  const fabStartY = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem("@fab_pos").then((raw) => {
      if (!raw) return;
      try {
        const { x, y } = JSON.parse(raw);
        if (typeof x === "number") fabX.value = x;
        if (typeof y === "number") fabY.value = y;
      } catch {}
    });
  }, [fabX, fabY]);

  const saveFabPos = (x: number, y: number) => {
    AsyncStorage.setItem("@fab_pos", JSON.stringify({ x, y })).catch(() => {});
  };

  const openCreateMenu = () => setCreateMenuVisible(true);

  const dragGesture = Gesture.Pan()
    .onStart(() => {
      fabStartX.value = fabX.value;
      fabStartY.value = fabY.value;
    })
    .onUpdate((e) => {
      fabX.value = fabStartX.value + e.translationX;
      fabY.value = fabStartY.value + e.translationY;
    })
    .onEnd(() => {
      runOnJS(saveFabPos)(fabX.value, fabY.value);
    });

  // Chạm (di chuyển nhỏ) → mở menu; kéo → di chuyển. Race: cái nào nhận trước thì thắng.
  const tapGesture = Gesture.Tap()
    .maxDistance(10)
    .onEnd(() => {
      runOnJS(openCreateMenu)();
    });

  const fabGesture = Gesture.Race(dragGesture, tapGesture);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fabX.value }, { translateY: fabY.value }],
  }));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRules();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) fetchRules();
      // fetchRules chỉ đọc `user` (đã có trong deps) → không thêm vào deps để tránh tạo lại mỗi render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  const fetchRules = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("rules")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.log(error);
      return;
    }

    if (data) {
      setRules(data as Rule[]);

      const ids = data.map((r) => r.id);
      if (ids.length > 0) {
        const { data: notifs } = await supabase
          .from("notifications")
          .select("rule_id")
          .in("rule_id", ids)
          .eq("is_read", false);

        const counts: Record<string, number> = {};
        notifs?.forEach((n) => {
          counts[n.rule_id] = (counts[n.rule_id] ?? 0) + 1;
        });
        setUnreadCounts(counts);
      }
    }
  };

  const handleDeleteRule = async (id: string) => {
    const ok = await confirmAsync("Xóa rule", "Rule và tất cả thông báo liên quan sẽ bị xóa vĩnh viễn?");
    if (!ok) return;
    // Thông báo con tự xóa theo nhờ FK ON DELETE CASCADE (migration 0014).
    await supabase.from("rules").delete().eq("id", id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  // Dọn 1 lần mọi nhắc hẹn đã xong (kèm thông báo nhắc của chúng — cascade).
  const deleteAllDoneReminders = async () => {
    const ids = rules.filter(isDoneReminder).map((r) => r.id);
    if (ids.length === 0) return;
    const ok = await confirmAsync(
      "Xóa nhắc hẹn đã xong",
      `Xóa ${ids.length} nhắc hẹn đã nhắc xong (kèm thông báo nhắc của chúng)?`,
    );
    if (!ok) return;
    await supabase.from("rules").delete().in("id", ids);
    setRules((prev) => prev.filter((r) => !ids.includes(r.id)));
  };

  const renderRightActions = (id: string) => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => handleDeleteRule(id)}>
      <Ionicons name="trash-outline" size={22} color="white" />
      <Text style={styles.deleteText}>Xóa</Text>
    </TouchableOpacity>
  );

  // Nhắc hẹn đã xong tách riêng khỏi danh sách chính.
  const doneReminders = rules.filter(isDoneReminder);
  const liveRules = rules.filter((r) => !isDoneReminder(r));

  const tabFiltered =
    activeTab === "all"
      ? liveRules
      : activeTab === "active"
      ? liveRules.filter((r) => r.is_active)
      : liveRules.filter((r) => !r.is_active);

  const q = searchText.trim().toLowerCase();
  const filteredRules =
    q === ""
      ? tabFiltered
      : tabFiltered.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q) ||
            (r.keyword ?? "").toLowerCase().includes(q) ||
            (r.condition ?? "").toLowerCase().includes(q)
        );

  const closeSearch = () => {
    setSearchMode(false);
    setSearchText("");
  };

  // Rule "dễ ồn": định kỳ (không phải theo điều kiện), không có condition, còn chế độ Đầy đủ.
  // Đây là nhóm hay sinh filler/tin nhạt nhất — gợi ý bật "chỉ tin quan trọng" 1 chạm.
  // LOẠI rule ĐẶT GIỜ (run_at): đó là lịch hẹn chủ động (bản tin 8h sáng...), server luôn
  // giao bản tin đúng hẹn bất kể chế độ — gợi ý bật lọc cho nó chỉ gây hiểu lầm.
  const noisyRules = rules.filter(
    (r) =>
      r.is_active &&
      r.frequency !== "change" &&
      r.source_type !== "reminder" && // nhắc hẹn không phải rule tin tức
      !(r.run_at ?? "").trim() &&
      !(r.condition ?? "").trim() &&
      r.notify_mode !== "important"
  );

  const dismissNoiseBanner = () => {
    setNoiseBannerHidden(true);
    AsyncStorage.setItem("@noise_banner_hidden", "1").catch(() => {});
  };

  const applyImportantAll = async () => {
    if (noisyRules.length === 0 || applyingImportant) return;
    setApplyingImportant(true);
    const ids = noisyRules.map((r) => r.id);
    const { error } = await supabase
      .from("rules")
      .update({ notify_mode: "important" })
      .in("id", ids);
    setApplyingImportant(false);
    if (error) {
      // Cột chưa có (migration 0015 chưa chạy) → báo rõ thay vì im lặng.
      alertMessage("Chưa bật được", "Cần chạy migration 0015 (cột notify_mode) trong Supabase trước.");
      return;
    }
    setRules((prev) =>
      prev.map((r) => (ids.includes(r.id) ? { ...r, notify_mode: "important" } : r))
    );
    alertMessage("Đã bật", `${ids.length} rule chuyển sang "Chỉ báo tin quan trọng" — hết filler, chỉ còn tin đáng chú ý. Đổi lại được trong chi tiết từng rule.`);
  };

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
        {searchMode ? (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm rule theo tên, từ khóa, điều kiện..."
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
            <Text style={styles.title}>Rules</Text>
            <TouchableOpacity onPress={() => setSearchMode(true)} style={styles.searchBtn}>
              <Ionicons name="search" size={22} color={colors.text} />
            </TouchableOpacity>
          </>
        )}
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
        {/* BANNER LỌC RÁC — chỉ hiện khi có rule cũ dễ ồn còn chế độ Đầy đủ */}
        {!noiseBannerHidden && noisyRules.length > 0 && !searchText && (
          <View style={styles.noiseBanner}>
            <View style={styles.noiseBannerHead}>
              <Ionicons name="funnel-outline" size={16} color={colors.primary} />
              <Text style={styles.noiseBannerTitle}>Bớt thông báo rác?</Text>
              <TouchableOpacity onPress={dismissNoiseBanner} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.subText} />
              </TouchableOpacity>
            </View>
            <Text style={styles.noiseBannerText}>
              {noisyRules.length} rule định kỳ đang báo cả khi không có tin đáng chú ý.
              Bật &quot;Chỉ báo tin quan trọng&quot; để lọc bớt (đổi lại được trong chi tiết rule).
            </Text>
            <TouchableOpacity
              style={[styles.noiseBannerBtn, applyingImportant && { opacity: 0.6 }]}
              onPress={applyImportantAll}
              disabled={applyingImportant}
            >
              <Text style={styles.noiseBannerBtnText}>
                {applyingImportant ? "Đang bật..." : `Bật cho ${noisyRules.length} rule`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {filteredRules.length === 0 && (
          <View style={styles.empty}>
            <Ionicons
              name={searchText ? "search-outline" : "albums-outline"}
              size={44}
              color={colors.muted}
            />
            <Text style={styles.emptyText}>
              {searchText
                ? "Không tìm thấy rule phù hợp"
                : activeTab === "active"
                ? "Chưa có rule nào đang hoạt động"
                : activeTab === "paused"
                ? "Không có rule nào tạm dừng"
                : "Chưa có rule nào"}
            </Text>
          </View>
        )}

        {filteredRules.map((item) => {
          const cat = findCategory(item.category);
          return (
            <ReanimatedSwipeable
              key={item.id}
              renderRightActions={() => renderRightActions(item.id)}
            >
            <View style={styles.ruleCard}>
              <TouchableOpacity
                style={styles.ruleLeft}
                activeOpacity={0.8}
                onPress={() =>
                  router.push({ pathname: "/rule-detail", params: { id: item.id } })
                }
              >
                <IconBadge
                  category={item.category}
                  size={50}
                  unreadCount={unreadCounts[item.id] ?? 0}
                />
                <View style={styles.ruleText}>
                  <Text style={styles.ruleTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.ruleDesc} numberOfLines={1}>{item.description}</Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.catTag, { backgroundColor: cat.color + "22" }]}>
                      <Text style={[styles.catTagText, { color: cat.color }]}>{cat.label}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Ionicons
                        name={item.frequency === "change" ? "flash-outline" : "time-outline"}
                        size={11}
                        color={colors.subText}
                      />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {formatSchedule(item.frequency, item.run_at)}
                      </Text>
                    </View>
                    {item.muted ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="notifications-off-outline" size={11} color={colors.warning} />
                        <Text style={[styles.metaText, { color: colors.warning }]} numberOfLines={1}>
                          Để êm
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {item.condition ? (
                    <View style={styles.condRow}>
                      <Ionicons name="filter-outline" size={11} color={colors.subText} />
                      <Text style={styles.metaText} numberOfLines={1}>{item.condition}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => toggleRule(item)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View pointerEvents="none">
                  <Switch
                    value={item.is_active}
                    thumbColor={item.is_active ? colors.primary : "#999"}
                    trackColor={{ true: colors.primary + "66", false: colors.border }}
                  />
                </View>
              </TouchableOpacity>
            </View>
            </ReanimatedSwipeable>
          );
        })}

        {/* NHẮC HẸN ĐÃ XONG — server nhắc rồi tự tắt; gom gọn ở đây để xem lại / dọn dẹp */}
        {!searchText && doneReminders.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.doneHeader}
              onPress={() => setShowDoneReminders((v) => !v)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-done-outline" size={16} color={colors.subText} />
              <Text style={styles.doneHeaderText}>Nhắc hẹn đã xong ({doneReminders.length})</Text>
              <Ionicons
                name={showDoneReminders ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.subText}
              />
            </TouchableOpacity>

            {showDoneReminders &&
              doneReminders.map((item) => (
                <View key={item.id} style={styles.doneCard}>
                  <Ionicons name="alarm-outline" size={18} color={colors.subText} />
                  <TouchableOpacity
                    style={{ flex: 1, marginHorizontal: 10 }}
                    activeOpacity={0.7}
                    onPress={() => router.push({ pathname: "/rule-detail", params: { id: item.id } })}
                  >
                    <Text style={styles.doneTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.doneTime}>Đã nhắc lúc {formatRemindTime(item.remind_at)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteRule(item.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}

            {showDoneReminders && doneReminders.length > 1 && (
              <TouchableOpacity style={styles.doneClearBtn} onPress={deleteAllDoneReminders}>
                <Text style={styles.doneClearText}>Xóa tất cả nhắc hẹn đã xong</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* ADD BUTTON — nổi, kéo thả tự do (giữ vị trí), bấm để mở menu */}
      <GestureDetector gesture={fabGesture}>
        <Animated.View style={[styles.addButton, fabStyle]}>
          <Ionicons name="add" size={32} color="white" />
        </Animated.View>
      </GestureDetector>

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
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
    },
    catTag: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
    },
    catTagText: {
      fontSize: 11,
      fontWeight: "700",
    },
    metaChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 1,
    },
    condRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 5,
    },
    metaText: {
      color: C.subText,
      fontSize: 12,
      flexShrink: 1,
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
    doneHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 4,
      marginTop: 4,
    },
    doneHeaderText: {
      color: C.subText,
      fontSize: 13.5,
      fontWeight: "700",
      flex: 1,
    },
    doneCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
      opacity: 0.85,
    },
    doneTitle: {
      color: C.text,
      fontSize: 14,
      fontWeight: "600",
    },
    doneTime: {
      color: C.subText,
      fontSize: 12,
      marginTop: 2,
    },
    doneClearBtn: {
      alignItems: "center",
      paddingVertical: 10,
      marginBottom: 8,
    },
    doneClearText: {
      color: C.danger,
      fontSize: 13,
      fontWeight: "600",
    },
    noiseBanner: {
      backgroundColor: C.primary + "11",
      borderWidth: 1,
      borderColor: C.primary + "44",
      borderRadius: RADIUS.md,
      padding: 14,
      marginBottom: 16,
    },
    noiseBannerHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    noiseBannerTitle: {
      color: C.primary,
      fontSize: 14,
      fontWeight: "700",
      flex: 1,
    },
    noiseBannerText: {
      color: C.text,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 10,
    },
    noiseBannerBtn: {
      backgroundColor: C.primary,
      borderRadius: RADIUS.sm,
      paddingVertical: 10,
      alignItems: "center",
    },
    noiseBannerBtnText: {
      color: "#fff",
      fontSize: 13.5,
      fontWeight: "700",
    },
  });
}
