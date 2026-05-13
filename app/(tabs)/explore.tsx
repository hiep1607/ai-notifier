/*
  File: explore.tsx

  Chức năng:
  - Explore Screen đơn giản
*/

import {
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Explore Screen 🚀
      </Text>

      <Text style={styles.subtitle}>
        Màn hình này sẽ chứa:
      </Text>

      <Text style={styles.item}>
        • Notifications
      </Text>

      <Text style={styles.item}>
        • AI Insights
      </Text>

      <Text style={styles.item}>
        • Trending Topics
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#081B3C",

    justifyContent: "center",

    padding: 24,
  },

  title: {
    color: "white",

    fontSize: 30,

    fontWeight: "bold",

    marginBottom: 20,
  },

  subtitle: {
    color: "#B8C7E0",

    fontSize: 18,

    marginBottom: 20,
  },

  item: {
    color: "white",

    fontSize: 16,

    marginBottom: 12,
  },
});