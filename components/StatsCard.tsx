/*
  File: StatsCard.tsx

  Chức năng:
  - Hiển thị card thống kê nhỏ
  - Dùng ở Home Screen

  Ví dụ:
  12 Rules
  5 Notifications
*/

import { StyleSheet, Text, View } from "react-native";

/*
  Props:
  - dữ liệu truyền vào component

  value:
  số liệu thống kê

  label:
  tên thống kê
*/

type Props = {
  value: string;
  label: string;
};

/*
  export default:
  cho phép file khác import component này

  function StatsCard():
  component chính
*/

export default function StatsCard({
  value,
  label,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>
        {value}
      </Text>

      <Text style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

/*
  StyleSheet:
  nơi chứa style của component
*/

const styles = StyleSheet.create({
  /*
    Card chính
  */
  card: {
    backgroundColor: "#102A56",

    width: "48%",

    padding: 24,

    borderRadius: 24,
  },

  /*
    Số thống kê
  */
  value: {
    color: "white",

    fontSize: 32,

    fontWeight: "bold",
  },

  /*
    Tên thống kê
  */
  label: {
    color: "#B8C7E0",

    marginTop: 10,

    fontSize: 16,
  },
});