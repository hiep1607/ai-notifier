/*
  File: ChatBubble.tsx

  Chức năng:
  - Hiển thị tin nhắn chat
  - Dùng ở AI Create Rule Screen

  Có 2 loại:
  - AI message
  - User message
*/

import {
    StyleSheet,
    Text,
    View,
} from "react-native";

/*
  Props:
  - message:
    nội dung tin nhắn

  - sender:
    người gửi tin nhắn
*/

type Props = {
  message: string;

  sender: "ai" | "user";
};

/*
  sender:
  chỉ được phép là:
  - ai
  - user
*/

export default function ChatBubble({
  message,
  sender,
}: Props) {
  /*
    Kiểm tra có phải AI không
  */
  const isAI = sender === "ai";

  return (
    <View
      style={[
        styles.container,

        isAI
          ? styles.aiContainer
          : styles.userContainer,
      ]}
    >
      <Text
        style={[
          styles.message,

          isAI
            ? styles.aiText
            : styles.userText,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Bubble chung
  */
  container: {
    maxWidth: "80%",

    padding: 16,

    borderRadius: 20,

    marginBottom: 14,
  },

  /*
    Bubble AI
  */
  aiContainer: {
    backgroundColor: "#102A56",

    alignSelf: "flex-start",
  },

  /*
    Bubble User
  */
  userContainer: {
    backgroundColor: "#4DA6FF",

    alignSelf: "flex-end",
  },

  /*
    Text chung
  */
  message: {
    fontSize: 15,

    lineHeight: 22,
  },

  /*
    Text AI
  */
  aiText: {
    color: "white",
  },

  /*
    Text User
  */
  userText: {
    color: "white",
  },
});