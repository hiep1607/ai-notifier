import React, { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "../lib/supabase";
import { confirmAsync, alertMessage } from "../lib/dialog";
import { runMonitorForRule } from "../lib/monitor";
import { CATEGORIES, FREQUENCIES, findCategory, formatSchedule, toFreqKey } from "../lib/ruleOptions";
import { useTheme } from "../contexts/ThemeContext";
import { Rule } from "../types/Rule";
import { Notification } from "../types/Notification";
import { RADIUS, type AppColors } from "../lib/theme";

export default function RuleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [rule, setRule] = useState<Rule | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editKeyword, setEditKeyword] = useState("");
  const [editCategory, setEditCategory] = useState("news");
  const [editSources, setEditSources] = useState("");
  const [editFrequency, setEditFrequency] = useState("daily");
  const [editCondition, setEditCondition] = useState("");
  const [saving, setSaving] = useState(false);
  const [monitoring, setMonitoring] = useState(false);

  // "Cấp quyền đăng nhập" cho rule theo dõi trang web (source_type 'url'): người dùng
  // dán Cookie/headers → server fetch trang kèm các header này. Lưu ở cột watch_auth.
  const [authDraft, setAuthDraft] = useState("");
  const [savingAuth, setSavingAuth] = useState(false);

  useEffect(() => {
    if (id) fetchData();
    // Chỉ fetch lại khi đổi id — không đưa fetchData vào deps để khỏi tạo lại mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchData = async () => {
    setLoading(true);

    const { data: ruleData } = await supabase
      .from("rules")
      .select("*")
      .eq("id", id)
      .single();

    if (ruleData) {
      setRule(ruleData as Rule);
      setAuthDraft((ruleData as Rule).watch_auth ?? "");
    }

    const { data: notifData } = await supabase
      .from("notifications")
      .select("*")
      .eq("rule_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (notifData) {
      setNotifications(notifData as Notification[]);
    }

    setLoading(false);
  };

  const toggleActive = async () => {
    if (!rule) return;

    const newValue = !rule.is_active;
    setRule({ ...rule, is_active: newValue });

    await supabase
      .from("rules")
      .update({ is_active: newValue })
      .eq("id", rule.id);
  };

  // "Để êm": rule vẫn chạy & vẫn nhận thông báo trong app, chỉ KHÔNG đẩy push về máy.
  const toggleMuted = async () => {
    if (!rule) return;

    const newValue = !rule.muted;
    setRule({ ...rule, muted: newValue });

    const { error } = await supabase
      .from("rules")
      .update({ muted: newValue })
      .eq("id", rule.id);

    if (error) {
      // Cột chưa có (migration 0010 chưa chạy) → khôi phục trạng thái + báo nhẹ.
      setRule({ ...rule, muted: !newValue });
      alertMessage("Chưa bật được", "Cần chạy migration 0010 (cột muted) trong Supabase trước.");
    }
  };

  // Chế độ thông báo: "all" (đầy đủ) ⇄ "important" (chỉ báo tin quan trọng, bỏ tin lặp/không có gì mới).
  const toggleNotifyMode = async () => {
    if (!rule) return;

    const newValue = rule.notify_mode === "important" ? "all" : "important";
    setRule({ ...rule, notify_mode: newValue });

    const { error } = await supabase
      .from("rules")
      .update({ notify_mode: newValue })
      .eq("id", rule.id);

    if (error) {
      // Cột chưa có (migration 0015 chưa chạy) → khôi phục + báo nhẹ.
      setRule({ ...rule, notify_mode: rule.notify_mode });
      alertMessage("Chưa đổi được", "Cần chạy migration 0015 (cột notify_mode) trong Supabase trước.");
    }
  };

  // Lưu quyền đăng nhập (Cookie/headers) cho trang cần login. Xóa trắng = thu hồi quyền.
  const saveWatchAuth = async () => {
    if (!rule) return;
    setSavingAuth(true);

    const value = authDraft.trim() || null;
    const { error } = await supabase
      .from("rules")
      .update({ watch_auth: value })
      .eq("id", rule.id);

    setSavingAuth(false);

    if (error) {
      alertMessage("Chưa lưu được", "Cần chạy migration 0018 (cột watch_url/watch_auth) trong Supabase trước.");
      return;
    }
    setRule({ ...rule, watch_auth: value ?? undefined });
    alertMessage(
      value ? "Đã cấp quyền" : "Đã thu hồi quyền",
      value
        ? "Hệ thống sẽ dùng Cookie này khi đọc trang ở các lần quét tới. Cookie hết hạn thì bạn sẽ nhận thông báo nhắc dán lại."
        : "Đã xóa Cookie đã lưu. Trang cần đăng nhập sẽ không đọc được nữa."
    );
  };

  const startEditing = () => {
    if (!rule) return;
    setEditTitle(rule.title);
    setEditDescription(rule.description);
    setEditKeyword(rule.keyword);
    setEditCategory(rule.category ?? "news");
    setEditSources(rule.sources ?? "");
    setEditFrequency(toFreqKey(rule.frequency));
    setEditCondition(rule.condition ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!rule || !editTitle.trim()) {
      alertMessage("Lỗi", "Tên rule không được để trống");
      return;
    }

    setSaving(true);

    const updated = {
      title: editTitle.trim(),
      description: editDescription.trim(),
      keyword: editKeyword.trim(),
      category: editCategory,
      sources: editSources.trim(),
      frequency: editFrequency,
      condition: editCondition.trim(),
    };

    const { error } = await supabase
      .from("rules")
      .update(updated)
      .eq("id", rule.id);

    if (error) {
      alertMessage("Lỗi", error.message);
    } else {
      setRule({ ...rule, ...updated });
      setIsEditing(false);
    }

    setSaving(false);
  };

  const handleRunMonitor = async () => {
    if (!rule) return;
    setMonitoring(true);

    try {
      const { inserted, checked, quotaHit } = await runMonitorForRule(rule);

      if (quotaHit && inserted === 0) {
        alertMessage(
          "AI đang quá tải",
          "Hệ thống AI tạm hết lượt (giới hạn miễn phí). Bạn thử lại sau ít phút nhé — tin vẫn được quét tự động ở nền."
        );
      } else if (checked === 0) {
        alertMessage("Không có tin", "Chưa tìm thấy bài viết nào cho từ khóa này.");
      } else if (inserted === 0) {
        alertMessage("Đã cập nhật", "Không có tin mới — tất cả bài tìm được đã có trong thông báo.");
      } else {
        alertMessage("Thành công", `Đã tạo ${inserted} thông báo mới từ tin thật!`);
        fetchData();
      }
    } catch (err: any) {
      alertMessage("Lỗi", err.message?.includes("fetch") || err.message?.includes("Network")
        ? "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
        : err.message);
    } finally {
      setMonitoring(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmAsync("Xóa rule", "Bạn có chắc muốn xóa rule này?");
    if (!ok) return;

    setSaving(true);

    // Thông báo con tự xóa theo nhờ FK ON DELETE CASCADE (migration 0014).
    const { data, error } = await supabase
      .from("rules")
      .delete()
      .eq("id", id)
      .select();

    setSaving(false);

    if (error) {
      alertMessage("Không xóa được", error.message);
      return;
    }

    if (!data || data.length === 0) {
      alertMessage("Không xóa được", "Rule không bị xóa. Có thể do chính sách bảo mật (RLS) chưa cho phép DELETE.");
      return;
    }

    router.back();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!rule) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.subText }}>Không tìm thấy rule</Text>
      </View>
    );
  }

  const cat = findCategory(rule.category);
  // Rule theo dõi TRANG WEB cụ thể (source_type 'url' — hoặc rule cũ có URL trong keyword).
  const isUrlRule = rule.source_type === "url" || Boolean(rule.watch_url);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          {isEditing ? (
            <TextInput
              style={styles.editTitleInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Tên rule"
              placeholderTextColor={colors.subText}
            />
          ) : (
            <Text style={styles.title}>{rule.title}</Text>
          )}

          {isEditing ? (
            <TextInput
              style={styles.editSubtitleInput}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Mô tả"
              placeholderTextColor={colors.subText}
              multiline
            />
          ) : (
            <Text style={styles.subtitle}>{rule.description}</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={isEditing ? handleSaveEdit : startEditing}
          style={styles.editButton}
          disabled={saving}
        >
          <Ionicons
            name={isEditing ? "checkmark-outline" : "pencil-outline"}
            size={24}
            color={isEditing ? colors.success : colors.subText}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleActive}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View pointerEvents="none">
            <Switch
              value={rule.is_active}
              thumbColor={rule.is_active ? colors.primary : "#999"}
              trackColor={{ true: colors.primary + "66", false: colors.border }}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* CATEGORY BADGE */}
      {!isEditing && (
        <View style={[styles.catBadge, { backgroundColor: cat.color + "22", borderColor: cat.color }]}>
          <Ionicons name={cat.icon} size={16} color={cat.color} />
          <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.label}</Text>
        </View>
      )}

      {/* RULE INFO */}
      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Thông tin rule</Text>

        {/* Từ khóa */}
        <View style={styles.infoRow}>
          <Text style={styles.label}>Từ khóa</Text>
          {isEditing ? (
            <TextInput
              style={styles.editInlineInput}
              value={editKeyword}
              onChangeText={setEditKeyword}
              placeholder="Từ khóa"
              placeholderTextColor={colors.subText}
            />
          ) : (
            <Text style={styles.value}>{rule.keyword}</Text>
          )}
        </View>

        {/* Trang web theo dõi (rule url) */}
        {!isEditing && rule.watch_url ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Trang theo dõi</Text>
            <Text style={[styles.value, styles.valueRight]} numberOfLines={2}>{rule.watch_url}</Text>
          </View>
        ) : null}

        {/* Danh mục (khi edit) */}
        {isEditing && (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Danh mục</Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((c) => {
                const active = c.key === editCategory;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.chip, active && { backgroundColor: c.color, borderColor: c.color }]}
                    onPress={() => setEditCategory(c.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={c.icon} size={14} color={active ? "white" : colors.subText} />
                    <Text style={[styles.chipText, active && { color: "white" }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Tần suất */}
        {isEditing ? (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Tần suất</Text>
            <View style={styles.chipWrap}>
              {FREQUENCIES.map((f) => {
                const active = f.key === editFrequency;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setEditFrequency(f.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && { color: "white" }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Tần suất</Text>
            <Text style={styles.value}>{formatSchedule(rule.frequency, rule.run_at)}</Text>
          </View>
        )}

        {/* Nguồn */}
        {isEditing ? (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Nguồn theo dõi</Text>
            <TextInput
              style={styles.editFullInput}
              value={editSources}
              onChangeText={setEditSources}
              placeholder="VD: VnExpress, CafeF"
              placeholderTextColor={colors.subText}
            />
          </View>
        ) : rule.sources ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Nguồn</Text>
            <Text style={[styles.value, styles.valueRight]}>{rule.sources}</Text>
          </View>
        ) : null}

        {/* Điều kiện */}
        {isEditing ? (
          <View style={styles.editBlock}>
            <Text style={styles.label}>Điều kiện kích hoạt</Text>
            <TextInput
              style={[styles.editFullInput, { height: 70, textAlignVertical: "top" }]}
              value={editCondition}
              onChangeText={setEditCondition}
              placeholder="VD: khi giá vượt 80 triệu"
              placeholderTextColor={colors.subText}
              multiline
            />
          </View>
        ) : rule.condition ? (
          <View style={styles.conditionBlock}>
            <Text style={styles.label}>Điều kiện kích hoạt</Text>
            <Text style={styles.conditionText}>{rule.condition}</Text>
          </View>
        ) : null}

        {/* Trạng thái */}
        <View style={styles.infoRow}>
          <Text style={styles.label}>Trạng thái</Text>
          <Text style={[styles.value, { color: rule.is_active ? colors.success : colors.subText }]}>
            {rule.is_active ? "Đang hoạt động" : "Tạm dừng"}
          </Text>
        </View>

        {rule.created_at && !isEditing && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Ngày tạo</Text>
            <Text style={styles.value}>
              {new Date(rule.created_at).toLocaleDateString("vi-VN")}
            </Text>
          </View>
        )}
      </View>

      {isEditing && (
        <TouchableOpacity
          style={styles.cancelEditBtn}
          onPress={() => setIsEditing(false)}
          disabled={saving}
        >
          <Text style={styles.cancelEditText}>Hủy chỉnh sửa</Text>
        </TouchableOpacity>
      )}

      {/* ACTION BUTTONS — đưa lên trên danh sách thông báo */}
      {!isEditing && (
        <>
          {/* RUN MONITOR BUTTON */}
          {rule.is_active && (
            <TouchableOpacity
              style={[styles.monitorButton, monitoring && { opacity: 0.6 }]}
              onPress={handleRunMonitor}
              disabled={monitoring}
            >
              <Ionicons
                name={monitoring ? "sync-outline" : "search-outline"}
                size={20}
                color={colors.primary}
              />
              <Text style={styles.monitorText}>
                {monitoring ? "Đang quét tin..." : "Kiểm tra tin ngay"}
              </Text>
            </TouchableOpacity>
          )}

          {/* NOTIFY MODE — lọc thông báo rác: chỉ báo tin quan trọng / thỏa điều kiện */}
          <TouchableOpacity
            style={[styles.muteButton, rule.notify_mode === "important" && styles.notifyModeOn]}
            onPress={toggleNotifyMode}
            activeOpacity={0.8}
          >
            <Ionicons
              name={rule.notify_mode === "important" ? "funnel" : "funnel-outline"}
              size={20}
              color={rule.notify_mode === "important" ? colors.primary : colors.subText}
            />
            <Text style={[styles.muteText, rule.notify_mode === "important" && { color: colors.primary }]}>
              {rule.notify_mode === "important"
                ? "Chỉ báo tin quan trọng — bật lại đầy đủ"
                : "Chỉ báo tin quan trọng (lọc tin rác/lặp)"}
            </Text>
          </TouchableOpacity>

          {/* CẤP QUYỀN ĐĂNG NHẬP — chỉ rule theo dõi trang web: dán Cookie cho trang cần login */}
          {isUrlRule && (
            <View style={styles.authCard}>
              <View style={styles.authHeader}>
                <Ionicons
                  name={rule.watch_auth ? "lock-open-outline" : "lock-closed-outline"}
                  size={18}
                  color={rule.watch_auth ? colors.success : colors.subText}
                />
                <Text style={styles.authTitle}>Cấp quyền đăng nhập</Text>
                {rule.watch_auth ? <Text style={styles.authGranted}>Đã cấp</Text> : null}
              </View>
              <Text style={styles.authHint}>
                Trang cần đăng nhập mới xem được? Đăng nhập trang đó trên trình duyệt → F12 →
                tab Network → copy giá trị header Cookie rồi dán vào đây (hoặc từng dòng
                &quot;Tên-Header: giá trị&quot;). Chỉ mình bạn và hệ thống quét đọc được.
              </Text>
              <TextInput
                style={styles.authInput}
                value={authDraft}
                onChangeText={setAuthDraft}
                placeholder="VD: session=abc123; token=xyz..."
                placeholderTextColor={colors.subText}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.authActions}>
                {rule.watch_auth ? (
                  <TouchableOpacity
                    style={styles.authClearBtn}
                    onPress={() => { setAuthDraft(""); }}
                    disabled={savingAuth}
                  >
                    <Text style={styles.authClearText}>Xóa</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.authSaveBtn, savingAuth && { opacity: 0.6 }]}
                  onPress={saveWatchAuth}
                  disabled={savingAuth || (!authDraft.trim() && !rule.watch_auth)}
                >
                  <Text style={styles.authSaveText}>
                    {savingAuth ? "Đang lưu..." : authDraft.trim() ? "Lưu quyền" : "Thu hồi quyền"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* MUTE BUTTON — vẫn nhận tin trong app, chỉ tắt push về máy */}
          <TouchableOpacity
            style={[styles.muteButton, rule.muted && styles.muteButtonOn]}
            onPress={toggleMuted}
            activeOpacity={0.8}
          >
            <Ionicons
              name={rule.muted ? "notifications-off" : "notifications-outline"}
              size={20}
              color={rule.muted ? colors.warning : colors.subText}
            />
            <Text style={[styles.muteText, rule.muted && { color: colors.warning }]}>
              {rule.muted ? "Đang để êm — bật lại push" : "Tắt push (vẫn nhận tin trong app)"}
            </Text>
          </TouchableOpacity>

          {/* DELETE BUTTON */}
          <TouchableOpacity
            style={[styles.deleteButton, saving && { opacity: 0.6 }]}
            onPress={handleDelete}
            disabled={saving}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={styles.deleteText}>{saving ? "Đang xóa..." : "Xóa rule"}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* RECENT NOTIFICATIONS */}
      {!isEditing && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Thông báo gần đây</Text>

          {notifications.length === 0 ? (
            <View style={styles.emptyNotif}>
              <Text style={{ color: colors.subText }}>Chưa có thông báo nào</Text>
            </View>
          ) : (
            (showAllNotifs ? notifications : notifications.slice(0, 5)).map((notif) => (
              <TouchableOpacity
                key={notif.id}
                style={styles.notificationCard}
                onPress={() =>
                  router.push({ pathname: "/notification-detail", params: { id: notif.id } })
                }
              >
                <View style={styles.topRow}>
                  <Ionicons name="notifications" size={20} color={colors.primary} />
                  {notif.created_at && (
                    <Text style={styles.time}>
                      {new Date(notif.created_at).toLocaleDateString("vi-VN")}
                    </Text>
                  )}
                </View>

                <Text style={styles.notificationTitle}>{notif.title}</Text>
                <Text style={styles.notificationDesc} numberOfLines={2}>{notif.content}</Text>
              </TouchableOpacity>
            ))
          )}

          {/* XEM TẤT CẢ / THU GỌN — chỉ khi có hơn 5 thông báo */}
          {notifications.length > 5 && (
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => setShowAllNotifs((v) => !v)}
              activeOpacity={0.8}
            >
              <Text style={styles.seeAllText}>
                {showAllNotifs
                  ? "Thu gọn"
                  : `Xem tất cả thông báo (${notifications.length})`}
              </Text>
              <Ionicons
                name={showAllNotifs ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
        </>
      )}

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
      alignItems: "center",
      marginBottom: 16,
    },
    headerText: {
      flex: 1,
      marginLeft: 14,
    },
    title: {
      color: C.text,
      fontSize: 24,
      fontWeight: "bold",
    },
    subtitle: {
      color: C.subText,
      marginTop: 6,
    },
    editTitleInput: {
      color: C.text,
      fontSize: 22,
      fontWeight: "bold",
      borderBottomWidth: 1,
      borderBottomColor: C.primary,
      paddingVertical: 4,
      marginBottom: 4,
    },
    editSubtitleInput: {
      color: C.subText,
      fontSize: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      paddingVertical: 2,
      marginTop: 4,
    },
    editInlineInput: {
      color: C.text,
      fontSize: 14,
      fontWeight: "600",
      borderBottomWidth: 1,
      borderBottomColor: C.primary,
      paddingVertical: 2,
      minWidth: 120,
      textAlign: "right",
    },
    editFullInput: {
      backgroundColor: C.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C.text,
      fontSize: 14,
      borderWidth: 1,
      borderColor: C.border,
      marginTop: 8,
    },
    editBlock: {
      marginBottom: 16,
    },
    editButton: {
      marginRight: 10,
      padding: 4,
    },
    catBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 20,
    },
    catBadgeText: {
      fontSize: 13,
      fontWeight: "bold",
    },
    infoCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 20,
      marginBottom: 22,
    },
    cardTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 18,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    label: {
      color: C.subText,
    },
    value: {
      color: C.text,
      fontWeight: "600",
    },
    valueRight: {
      flex: 1,
      textAlign: "right",
      marginLeft: 16,
    },
    conditionBlock: {
      marginBottom: 14,
    },
    conditionText: {
      color: C.text,
      fontWeight: "500",
      marginTop: 6,
      lineHeight: 21,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.inputBg,
    },
    chipText: {
      color: C.subText,
      fontSize: 12,
      fontWeight: "600",
    },
    cancelEditBtn: {
      alignItems: "center",
      paddingVertical: 14,
      marginBottom: 10,
    },
    cancelEditText: {
      color: C.subText,
      fontSize: 15,
      fontWeight: "600",
    },
    sectionTitle: {
      color: C.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 18,
    },
    emptyNotif: {
      alignItems: "center",
      paddingVertical: 24,
    },
    notificationCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: 18,
      marginBottom: 18,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    time: {
      color: C.subText,
    },
    notificationTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: "bold",
      marginBottom: 8,
    },
    notificationDesc: {
      color: C.subText,
      lineHeight: 22,
    },
    monitorButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 12,
      marginBottom: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.primary,
      backgroundColor: C.primary + "11",
    },
    monitorText: {
      color: C.primary,
      fontSize: 16,
      fontWeight: "600",
    },
    muteButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 12,
      marginBottom: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    muteButtonOn: {
      borderColor: C.warning,
      backgroundColor: C.warning + "11",
    },
    notifyModeOn: {
      borderColor: C.primary,
      backgroundColor: C.primary + "11",
    },
    muteText: {
      color: C.subText,
      fontSize: 16,
      fontWeight: "600",
    },
    authCard: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginTop: 12,
      marginBottom: 8,
    },
    authHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    authTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "600",
      flex: 1,
    },
    authGranted: {
      color: C.success,
      fontSize: 12,
      fontWeight: "700",
    },
    authHint: {
      color: C.subText,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 10,
    },
    authInput: {
      backgroundColor: C.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: C.text,
      fontSize: 13,
      minHeight: 64,
      textAlignVertical: "top",
    },
    authActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 10,
    },
    authClearBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    authClearText: {
      color: C.subText,
      fontWeight: "600",
    },
    authSaveBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: C.primary,
    },
    authSaveText: {
      color: "white",
      fontWeight: "700",
    },
    deleteButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 12,
      marginBottom: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.danger,
      backgroundColor: C.danger + "11",
    },
    deleteText: {
      color: C.danger,
      fontSize: 16,
      fontWeight: "600",
    },
    seeAllButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 14,
      marginTop: 4,
    },
    seeAllText: {
      color: C.primary,
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
