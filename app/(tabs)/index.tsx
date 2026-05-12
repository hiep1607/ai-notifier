/*
  File: index.tsx

  Chức năng:
  - Home Screen chính của app
  - Hiển thị:
    + thống kê
    + danh sách Rules
    + AI Insight
    + Button tạo Rule
*/

import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

/*
  Import Components
*/

import StatsCard from "@/components/StatsCard";

import RuleCard from "@/components/RuleCard";

import PrimaryButton from "@/components/PrimaryButton";

import AIInsightBox from "@/components/AIInsightBox";

/*
  Import Mock Data
*/

import { mockRules } from "@/data/mockRules";

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.logo}>
          AI Notifier 🔔
        </Text>

        <Text style={styles.subtitle}>
          Theo dõi thông tin bằng AI
        </Text>
      </View>

      {/* STATS */}
      <View style={styles.statsContainer}>
        <StatsCard
          value="12"
          label="Rules"
        />

        <StatsCard
          value="5"
          label="Notifications"
        />
      </View>

      {/* SECTION TITLE */}
      <Text style={styles.sectionTitle}>
        Rules đang hoạt động
      </Text>

      {/* RULE LIST */}
      {mockRules.map((rule) => (
        <RuleCard
          key={rule.id}
          title={rule.title}
          description={rule.description}
          active={rule.active}
        />
      ))}

      {/* AI INSIGHT */}
      <AIInsightBox
        message="AI phát hiện 2 thông báo quan trọng hôm nay liên quan đến AI và công nghệ."
      />

      {/* BUTTON */}
      <View style={styles.buttonContainer}>
        <PrimaryButton
          title="+ Tạo Rule mới"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /*
    Container chính
  */
  container: {
    flex: 1,

    backgroundColor: "#081B3C",

    padding: 20,
  },

  /*
    Header
  */
  header: {
    marginTop: 60,

    marginBottom: 30,
  },

  /*
    Logo
  */
  logo: {
    color: "white",

    fontSize: 34,

    fontWeight: "bold",
  },

  /*
    Subtitle
  */
  subtitle: {
    color: "#B8C7E0",

    fontSize: 16,

    marginTop: 10,
  },

  /*
    Stats Container
  */
  statsContainer: {
    flexDirection: "row",

    justifyContent: "space-between",

    marginBottom: 30,
  },

  /*
    Section Title
  */
  sectionTitle: {
    color: "white",

    fontSize: 22,

    fontWeight: "bold",

    marginBottom: 20,
  },

  /*
    Button Container
  */
  buttonContainer: {
    marginTop: 30,

    marginBottom: 80,
  },
});