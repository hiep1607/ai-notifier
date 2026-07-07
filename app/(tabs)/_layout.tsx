import { useEffect, useRef, useState } from "react";

import { Tabs, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";
import { countNotificationsFor } from "../../lib/notifQuery";
import { loadCache, saveCache } from "../../lib/screenCache";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeRulesCount, setActiveRulesCount] = useState(0);
  // Đã có số liệu thật từ mạng chưa — cache về muộn thì không được ghi đè.
  const badgeNetDone = useRef(false);

  useEffect(() => {
    if (!user) return;
    // Mở app: vẽ badge NGAY từ cache lần trước, mạng về sau thì thay số mới.
    if (!badgeNetDone.current) {
      loadCache<{ unread: number; active: number }>(`@cache_badges_${user.id}`).then((c) => {
        if (c && !badgeNetDone.current) {
          setUnreadCount(c.unread);
          setActiveRulesCount(c.active);
        }
      });
    }
    fetchBadges();
    // Chỉ chạy lại khi đổi user/route — không đưa fetch* vào deps để khỏi tạo lại mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pathname]);

  const fetchBadges = async () => {
    // Đếm theo user_id (0021) — tính cả thông báo "mồ côi rule"; helper tự fallback
    // qua rule_id khi 0021 chưa chạy nên KHÔNG cần query rules trước ở đây nữa.
    const [unread, rulesRes] = await Promise.all([
      countNotificationsFor(user!.id, { unreadOnly: true }),
      supabase
        .from("rules")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_active", true),
    ]);
    badgeNetDone.current = true;
    const active = rulesRes.count ?? 0;
    setUnreadCount(unread);
    setActiveRulesCount(active);
    saveCache(`@cache_badges_${user!.id}`, { unread, active });
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
