/*
  File: ChatInput.tsx

  Chức năng:
  - Ô nhập chat với AI
  - Dùng ở AI Create Rule Screen

  Bao gồm:
  - TextInput
  - Send Button
*/

import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/*
  Props:
  - value:
    nội dung input

  - onChangeText:
    cập nhật text khi nhập

  - onSend:
    gửi message
*/

type Props = {
  value: string;

  onChangeText?: (text: string) => void;

  onSend?: () => void;
};

export default function ChatInput({
  value,
  onChangeText,
  onSend,
}: Props) {
  return (
    <View style={styles.container}>
      {/* Input */}
      <TextInput
        style={styles.input}
        placeholder="Nhập tin nhắn..."

        placeholderTextColor="#B8C7E0"

        value={value}

        onChangeText={onChangeText}
      />

      {/* Send Button */}
      <TouchableOpacity
        style={styles.button}
        onPress={onSend}
      >
        <Text style={styles.buttonText}>
          Gửi
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Container chính
  */
  container: {
    flexDirection: "row",

    alignItems: "center",

    marginTop: 12,
  },

  /*
    Input chat
  */
  input: {
    flex: 1,

    backgroundColor: "#102A56",

    color: "white",

    borderRadius: 20,

    paddingHorizontal: 18,

    paddingVertical: 14,

    marginRight: 10,
  },

  /*
    Button gửi
  */
  button: {
    backgroundColor: "#4DA6FF",

    paddingHorizontal: 20,

    paddingVertical: 14,

    borderRadius: 18,
  },

  /*
    Text button
  */
  buttonText: {
    color: "white",

    fontWeight: "bold",
  },
});