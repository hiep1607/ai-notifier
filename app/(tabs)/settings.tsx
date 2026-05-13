/*
  File: settings.tsx

  Chức năng:
  - Settings Screen
*/

import {
    StyleSheet,
    Text,
    View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons
        name="settings"
        size={80}
        color={COLORS.primary}
      />

      <Text style={styles.title}>
        Settings
      </Text>

      <Text style={styles.subtitle}>
        Cài đặt ứng dụng sẽ hiển thị ở đây
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