import { Text, View } from "react-native";

export default function AIChatScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#081120",
      }}
    >
      <Text
        style={{
          color: "white",
          fontSize: 28,
          fontWeight: "bold",
        }}
      >
        AI Chat Screen
      </Text>
    </View>
  );
}