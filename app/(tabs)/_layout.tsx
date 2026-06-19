import { useEffect, useState } from "react";

import { Tabs, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeRulesCount, setActiveRulesCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchUnread();
      fetchActiveRules();
    }
  }, [user, pathname]);

  const fetchActiveRules = async () => {
    const { count } = await supabase
      .from("rules")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .eq("is_active", true);
    setActiveRulesCount(count ?? 0);
  };

  const fetchUnread = async () => {
    const { data: ruleRows } = await supabase
      .from("rules")
      .select("id")
      .eq("user_id", user!.id);

    if (!ruleRows?.length) {
      setUnreadCount(0);
      return;
    }

    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .in("rule_id", ruleRows.map((r) => r.id))
      .eq("is_read", false);

    setUnreadCount(count ?? 0);
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: isDark ? 0 : 1,
          borderTopColor: colors.border,
          height: 72,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subText,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="rules"
        options={{
          title: "Rules",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
          tabBarBadge: activeRulesCount > 0 ? activeRulesCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            fontSize: 11,
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.danger,
            fontSize: 11,
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
