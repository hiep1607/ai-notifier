/*
  File: notifications.tsx

  Chức năng:
  - Notification Screen
*/

import {
    StyleSheet,
    Text,
    View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons
        name="notifications"
        size={80}
        color={COLORS.primary}
      />

      <Text style={styles.title}>
        Notifications
      </Text>

      <Text style={styles.subtitle}>
        Các thông báo AI sẽ hiển thị ở đây
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor:
      COLORS.background,

    justifyContent: "center",

    alignItems: "center",

    paddingHorizontal: 24,
  },

  title: {
    color: COLORS.white,

    fontSize: 32,

    fontWeight: "bold",

    marginTop: 24,
  },

  subtitle: {
    color: COLORS.gray,

    fontSize: 16,

    textAlign: "center",

    marginTop: 12,
  },
});