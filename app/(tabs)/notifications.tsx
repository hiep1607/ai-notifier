import React, { useState } from "react";

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
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Notification } from "../../types/Notification";

const COLORS = {
  background: "#081120",
  card: "#101B35",
  primary: "#4DA6FF",
  text: "#FFFFFF",
  subText: "#8FA1C7",
  unread: "#3B82F6",
  border: "#1E2B4A",
};

export default function NotificationsScreen() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState("");

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
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

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        {searchMode ? (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm thông báo..."
              placeholderTextColor={COLORS.subText}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            <TouchableOpacity onPress={closeSearch} style={styles.searchClose}>
              <Ionicons name="close" size={24} color={COLORS.subText} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Thông báo</Text>
            <TouchableOpacity onPress={() => setSearchMode(true)}>
              <Ionicons name="search" size={24} color="white" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* TABS */}
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setActiveTab("all")}>
          <Text style={activeTab === "all" ? styles.activeTab : styles.tab}>
            Tất cả
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setActiveTab("unread")}>
          <Text style={activeTab === "unread" ? styles.activeTab : styles.tab}>
            Chưa đọc
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setActiveTab("important")}>
          <Text
            style={activeTab === "important" ? styles.activeTab : styles.tab}
          >
            Quan trọng
          </Text>
        </TouchableOpacity>
      </View>

      {/* LIST */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4DA6FF"
          />
        }
      >
        {displayedNotifications.length === 0 && (
          <View style={styles.empty}>
            <Ionicons
              name="notifications-off-outline"
              size={48}
              color={COLORS.subText}
            />
            <Text style={styles.emptyText}>
              {searchText ? "Không tìm thấy kết quả" : "Chưa có thông báo"}
            </Text>
          </View>
        )}

        {displayedNotifications.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/notification-detail",
                params: { id: item.id },
              })
            }
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="notifications" size={20} color="white" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.content}
                </Text>
              </View>
            </View>

            {!item.is_read && <View style={styles.dot} />}
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
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
    marginBottom: 24,
  },

  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "bold",
  },

  searchInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  searchClose: {
    marginLeft: 12,
    padding: 4,
  },

  tabs: {
    flexDirection: "row",
    gap: 22,
    marginBottom: 28,
  },

  activeTab: {
    color: COLORS.primary,
    fontWeight: "bold",
  },

  tab: {
    color: COLORS.subText,
  },

  empty: {
    alignItems: "center",
    marginTop: 80,
    gap: 16,
  },

  emptyText: {
    color: COLORS.subText,
    fontSize: 16,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },

  cardDesc: {
    color: COLORS.subText,
  },

  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.unread,
    marginLeft: 8,
  },
});
