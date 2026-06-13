import { useFocusEffect } from "@react-navigation/native";
import React, { useState } from "react";
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
import { Rule } from "../../types/Rule";

export default function RulesScreen() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] =
    useState("all");

  const [rules, setRules] =
    useState<Rule[]>([]);

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

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Rules</Text>

        <View style={styles.headerIcons}>
          <Ionicons name="search" size={22} color="#FFFFFF" />
          <Ionicons name="filter" size={22} color="#FFFFFF" />
        </View>
      </View>

      {/* FILTER TABS */}
      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setActiveTab("all")}
        >
          <Text
            style={
              activeTab === "all"
                ? styles.activeTab
                : styles.tab
            }
          >
            Tất cả
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("active")}
        >
          <Text
            style={
              activeTab === "active"
                ? styles.activeTab
                : styles.tab
            }
          >
            Đang hoạt động
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("paused")}
        >
          <Text
            style={
              activeTab === "paused"
                ? styles.activeTab
                : styles.tab
            }
          >
            Tạm dừng
          </Text>
        </TouchableOpacity>
      </View>

      {/* RULE LIST */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4DA6FF" />}
      >
        {filteredRules.map((item) => (
          <View key={item.id} style={styles.ruleCard}>
            <TouchableOpacity
              style={styles.ruleLeft}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: "/rule-detail",
                  params: { id: item.id },
                })
              }
            >
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: "#204BFF" },
                ]}
              >
                <Ionicons
                  name="notifications"
                  size={20}
                  color="white"
                />
              </View>

              <View>
                <Text style={styles.ruleTitle}>
                  {item.title}
                </Text>

                <Text style={styles.ruleDesc}>
                  {item.description}
                </Text>
              </View>
            </TouchableOpacity>

            <Switch
              value={item.is_active}
              onValueChange={async () => {
                const newValue = !item.is_active;

                setRules((prev) =>
                  prev.map((rule) =>
                    rule.id === item.id
                      ? { ...rule, is_active: newValue }
                      : rule
                  )
                );

                await supabase
                  .from("rules")
                  .update({ is_active: newValue })
                  .eq("id", item.id);
              }}
            />
          </View>
        ))}

        <View style={{ height: 120 }} />
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
              <View style={[styles.optionIcon, { backgroundColor: "#204BFF" }]}>
                <Ionicons name="create-outline" size={24} color="white" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Tạo thủ công</Text>
                <Text style={styles.optionDesc}>
                  Tự điền tên, mô tả và từ khóa theo dõi
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#7B8AA0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              activeOpacity={0.8}
              onPress={() => {
                setCreateMenuVisible(false);
                router.push("/create-rule");
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#7C3AED" }]}>
                <Ionicons name="sparkles-outline" size={24} color="white" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Dùng AI</Text>
                <Text style={styles.optionDesc}>
                  Mô tả mong muốn, AI tạo rule giúp bạn
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#7B8AA0" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#081120",
    paddingTop: 70,
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },

  title: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
  },

  headerIcons: {
    flexDirection: "row",
    gap: 18,
  },

  tabs: {
    flexDirection: "row",
    marginBottom: 24,
    gap: 20,
  },

  activeTab: {
    color: "#4DA6FF",
    fontWeight: "bold",
    fontSize: 15,
  },

  tab: {
    color: "#7B8AA0",
    fontSize: 15,
  },

  ruleCard: {
    backgroundColor: "#101B35",
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  ruleLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  ruleTitle: {
    color: "white",
    fontSize: 17,
    fontWeight: "bold",
  },

  ruleDesc: {
    color: "#7B8AA0",
    marginTop: 4,
  },

  addButton: {
    position: "absolute",
    bottom: 100,
    right: 24,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },

  sheet: {
    backgroundColor: "#101B35",
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
    backgroundColor: "#2A3A5C",
    marginBottom: 18,
  },

  sheetTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0C1730",
    borderRadius: 18,
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
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },

  optionDesc: {
    color: "#7B8AA0",
    fontSize: 13,
    marginTop: 4,
  },

  cancelButton: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 6,
  },

  cancelText: {
    color: "#7B8AA0",
    fontSize: 16,
    fontWeight: "600",
  },
});
