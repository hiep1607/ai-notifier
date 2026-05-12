/*
  File: AIInsightBox.tsx

  Chức năng:
  - Hiển thị AI Insight
  - Dùng ở Home Screen

  Ví dụ:
  AI phát hiện 2 thông báo quan trọng hôm nay
*/

import {
    StyleSheet,
    Text,
    View,
} from "react-native";

/*
  Props:
  - message:
    nội dung AI insight
*/

type Props = {
  message: string;
};

export default function AIInsightBox({
  message,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        🤖 AI Insight
      </Text>

      <Text style={styles.message}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Box chính
  */
  container: {
    backgroundColor: "#123B75",

    padding: 24,

    borderRadius: 24,

    marginTop: 20,
  },

  /*
    Tiêu đề
  */
  title: {
    color: "white",

    fontSize: 20,

    fontWeight: "bold",

    marginBottom: 12,
  },

  /*
    Nội dung AI
  */
  message: {
    color: "#D4E4FF",

    fontSize: 15,

    lineHeight: 24,
  },
});