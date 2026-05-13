/*
  File: index.tsx

  Chức năng:
  - Home Screen chính
  - AI Neon Dashboard
*/

import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/*
  Import Design System
*/

import { COLORS } from "@/constants/colors";

import { SPACING } from "@/constants/spacing";

import { THEME } from "@/constants/theme";

/*
  Import Mock Data
*/

import { mockRules } from "@/data/mockRules";

/*
  Import Icons
*/

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Chào Hiệp 👋
            </Text>

            <Text style={styles.subtitle}>
              AI đang theo dõi thông tin cho bạn
            </Text>
          </View>

          <View style={styles.avatar}>
            <Ionicons
              name="person"
              size={24}
              color={COLORS.white}
            />
          </View>
        </View>

        {/* AI INSIGHT */}
        <LinearGradient
  colors={["#0F172A", "#111827", "#172554"]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}
  style={styles.insightCard}
>
  <Text style={styles.insightTitle}>
    🤖 AI INSIGHT
  </Text>

  <Text style={styles.insightText}>
    Phát hiện 3 xu hướng AI mới
    có thể bạn quan tâm hôm nay.
  </Text>

  <TouchableOpacity
    style={styles.insightButton}
  >
    <Text style={styles.insightButtonText}>
      Xem ngay
    </Text>
  </TouchableOpacity>

  {/* Glow Circle */}
  <View style={styles.glowCircle} />
</LinearGradient>

        {/* STATS */}
        <View style={styles.statsContainer}>
          <View style={styles.statsCard}>
            <Text style={styles.statsNumber}>
              12
            </Text>

            <Text style={styles.statsLabel}>
              Rules hoạt động
            </Text>
          </View>

          <View style={styles.statsCard}>
            <Text style={styles.statsNumber}>
              5
            </Text>

            <Text style={styles.statsLabel}>
              Thông báo hôm nay
            </Text>
          </View>
        </View>

        {/* SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Rules đang hoạt động
          </Text>

          <Text style={styles.viewAll}>
            Xem tất cả
          </Text>
        </View>

        {/* RULE LIST */}
        {mockRules.map((rule) => (
          <View
            key={rule.id}
            style={styles.ruleCard}
          >
            <View>
              <Text style={styles.ruleTitle}>
                {rule.title}
              </Text>

              <Text
                style={styles.ruleDescription}
              >
                {rule.description}
              </Text>
            </View>

            <View
              style={[
                styles.statusDot,

                {
                  backgroundColor:
                    rule.active
                      ? COLORS.success
                      : COLORS.danger,
                },
              ]}
            />
          </View>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FLOATING BUTTON */}
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => router.push("/create-rule")}
      >
        <Ionicons
          name="add"
          size={34}
          color={COLORS.white}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Container
  */
  container: {
    flex: 1,

    backgroundColor: COLORS.background,

    paddingHorizontal: SPACING.lg,
  },

  /*
    Header
  */
  header: {
    marginTop: 70,

    flexDirection: "row",

    justifyContent: "space-between",

    alignItems: "center",

    marginBottom: SPACING.xl,
  },

  /*
    Greeting
  */
  greeting: {
    color: COLORS.white,

    fontSize: 32,

    fontWeight: "bold",
  },

  /*
    Subtitle
  */
  subtitle: {
    color: COLORS.gray,

    marginTop: 6,

    fontSize: 15,
  },

  /*
    Avatar
  */
  avatar: {
    width: 52,

    height: 52,

    borderRadius: 26,

    backgroundColor: COLORS.card,

    justifyContent: "center",

    alignItems: "center",

    borderWidth: 1,

    borderColor: COLORS.primary,
  },

  /*
    Insight Card
  */
  insightCard: {
    backgroundColor: COLORS.card,

    borderRadius: THEME.radius,

    padding: SPACING.lg,

    marginBottom: SPACING.xl,

    borderWidth: 1,

    borderColor: COLORS.primary,

    ...THEME.shadow,
  },

  insightTitle: {
    color: COLORS.primary,

    fontSize: 14,

    fontWeight: "bold",

    marginBottom: 14,
  },

  insightText: {
    color: COLORS.white,

    fontSize: 20,

    lineHeight: 30,

    marginBottom: 24,
  },

  insightButton: {
    backgroundColor: COLORS.primary,

    alignSelf: "flex-start",

    paddingHorizontal: 20,

    paddingVertical: 10,

    borderRadius: 999,
  },

  insightButtonText: {
    color: COLORS.white,

    fontWeight: "600",
  },

  /*
    Stats
  */
  statsContainer: {
    flexDirection: "row",

    justifyContent: "space-between",

    marginBottom: SPACING.xl,
  },

  statsCard: {
    width: "48%",

    backgroundColor: COLORS.card,

    borderRadius: THEME.radius,

    padding: SPACING.lg,

    borderWidth: 1,

    borderColor: COLORS.border,
  },

  statsNumber: {
    color: COLORS.white,

    fontSize: 36,

    fontWeight: "bold",

    marginBottom: 10,
  },

  statsLabel: {
    color: COLORS.gray,

    fontSize: 14,
  },

  /*
    Section Header
  */
  sectionHeader: {
    flexDirection: "row",

    justifyContent: "space-between",

    alignItems: "center",

    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    color: COLORS.white,

    fontSize: 24,

    fontWeight: "bold",
  },

  viewAll: {
    color: COLORS.primary,
  },

  /*
    Rule Card
  */
  ruleCard: {
    backgroundColor: COLORS.card,

    borderRadius: THEME.radius,

    padding: SPACING.lg,

    marginBottom: SPACING.md,

    flexDirection: "row",

    justifyContent: "space-between",

    alignItems: "center",

    borderWidth: 1,

    borderColor: COLORS.border,
  },

  ruleTitle: {
    color: COLORS.white,

    fontSize: 18,

    fontWeight: "600",

    marginBottom: 8,
  },

  ruleDescription: {
    color: COLORS.gray,
  },

  /*
    Status Dot
  */
  statusDot: {
    width: 14,

    height: 14,

    borderRadius: 7,
  },

  /*
    Floating Button
  */
  floatingButton: {
    position: "absolute",

    bottom: 30,

    right: 24,

    width: 70,

    height: 70,

    borderRadius: 35,

    backgroundColor: COLORS.primary,

    justifyContent: "center",

    alignItems: "center",

    ...THEME.shadow,
  },
  /*
  Glow Circle
*/
glowCircle: {
  position: "absolute",

  width: 140,

  height: 140,

  borderRadius: 70,

  backgroundColor: "rgba(77,166,255,0.15)",

  top: -20,

  right: -20,
},
});