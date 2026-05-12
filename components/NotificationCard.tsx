/*
  File: NotificationCard.tsx

  Chức năng:
  - Hiển thị notification của app
  - Dùng ở Notifications Screen

  Ví dụ:
  Giảm giá iPhone
  AI phát hiện giảm 12%
  5 phút trước
*/

import {
    StyleSheet,
    Text,
    View,
} from "react-native";

/*
  Props:
  - title:
    tiêu đề notification

  - summary:
    AI summary

  - time:
    thời gian notification
*/

type Props = {
  title: string;

  summary: string;

  time: string;
};

export default function NotificationCard({
  title,
  summary,
  time,
}: Props) {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.aiLabel}>
          🤖 AI Notification
        </Text>

        <Text style={styles.time}>
          {time}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>
        {title}
      </Text>

      {/* Summary */}
      <Text style={styles.summary}>
        {summary}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Card chính
  */
  card: {
    backgroundColor: "#102A56",

    borderRadius: 24,

    padding: 20,

    marginBottom: 16,
  },

  /*
    Header row
  */
  header: {
    flexDirection: "row",

    justifyContent: "space-between",

    alignItems: "center",

    marginBottom: 14,
  },

  /*
    AI label
  */
  aiLabel: {
    color: "#4DA6FF",

    fontSize: 14,

    fontWeight: "bold",
  },

  /*
    Time text
  */
  time: {
    color: "#B8C7E0",

    fontSize: 12,
  },

  /*
    Notification title
  */
  title: {
    color: "white",

    fontSize: 18,

    fontWeight: "bold",

    marginBottom: 10,
  },

  /*
    Summary text
  */
  summary: {
    color: "#D4E4FF",

    fontSize: 15,

    lineHeight: 24,
  },
});