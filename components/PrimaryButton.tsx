/*
  File: PrimaryButton.tsx

  Chức năng:
  - Button chính của app
  - Dùng cho:
    + Tạo Rule
    + Lưu
    + Confirm

  Mục tiêu:
  - Tạo button đồng bộ toàn app
*/

import {
    StyleSheet,
    Text,
    TouchableOpacity,
} from "react-native";

/*
  Props:
  - title:
    text hiển thị trên button

  - onPress:
    hàm chạy khi bấm button
*/

type Props = {
  title: string;

  onPress?: () => void;
};

/*
  onPress?:
  optional
*/

export default function PrimaryButton({
  title,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
    >
      <Text style={styles.text}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  /*
    Button chính
  */
  button: {
    backgroundColor: "#4DA6FF",

    paddingVertical: 18,

    borderRadius: 24,

    alignItems: "center",
  },

  /*
    Text button
  */
  text: {
    color: "white",

    fontSize: 18,

    fontWeight: "bold",
  },
});