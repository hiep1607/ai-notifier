/*
  File: RuleCard.tsx

  Chức năng:
  - Hiển thị thông tin Rule
  - Dùng ở Home Screen và Rules Screen

  Ví dụ:
  Shopee - iPhone
  Theo dõi giảm giá
*/

import {
    StyleSheet,
    Text,
    View,
} from "react-native";

/*
  Props:
  dữ liệu truyền vào component
*/

type Props = {
  title: string;

  description: string;

  active?: boolean;
};

/*
  active?:
  dấu ? nghĩa là optional
  có thể truyền hoặc không
*/

export default function RuleCard({
  title,
  description,
  active = true,
}: Props) {
  return (
    <View style={styles.card}>
      {/* Nội dung bên trái */}
      <View>
        <Text style={styles.title}>
          {title}
        </Text>

        <Text style={styles.description}>
          {description}
        </Text>
      </View>

      {/* Chấm trạng thái */}
      <View
        style={[
          styles.statusDot,

          {
            backgroundColor: active
              ? "#4DFF91"
              : "#FF5C5C",
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Card chính
  */
  card: {
    backgroundColor: "#102A56",

    borderRadius: 22,

    padding: 20,

    marginBottom: 15,

    flexDirection: "row",

    justifyContent: "space-between",

    alignItems: "center",
  },

  /*
    Tiêu đề Rule
  */
  title: {
    color: "white",

    fontSize: 18,

    fontWeight: "bold",
  },

  /*
    Mô tả Rule
  */
  description: {
    color: "#B8C7E0",

    marginTop: 8,

    fontSize: 14,
  },

  /*
    Chấm trạng thái
  */
  statusDot: {
    width: 14,

    height: 14,

    borderRadius: 10,
  },
});