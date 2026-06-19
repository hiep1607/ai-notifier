import React, { useMemo, useRef, useState } from "react";

import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../contexts/ThemeContext";
import { RADIUS, GLOW, type AppColors } from "../lib/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    icon: "sparkles" as const,
    title: "Theo dõi mọi thứ bằng AI",
    desc: "Mô tả bằng lời điều bạn muốn theo dõi — giá vàng, tỷ giá, thời tiết, tin công nghệ… AI lo phần còn lại.",
  },
  {
    icon: "create-outline" as const,
    title: "Mô tả, AI tự tạo rule",
    desc: "Chỉ cần gõ \"theo dõi giá vàng SJC mỗi sáng\", AI tạo rule với từ khóa, lịch quét và điều kiện phù hợp.",
  },
  {
    icon: "notifications" as const,
    title: "Nhận thông báo thông minh",
    desc: "Hệ thống quét tin thật 24/7, chỉ báo khi có thay đổi đáng chú ý. Có thể \"để êm\" từng rule khi cần yên tĩnh.",
  },
];

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    await AsyncStorage.setItem("@onboarded", "1").catch(() => {});
    router.replace("/(tabs)");
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const next = () => {
    if (index >= SLIDES.length - 1) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex(index + 1);
  };

  return (
    <LinearGradient
      colors={isDark ? ["#0B1220", "#111827"] : [colors.background, colors.background]}
      style={styles.container}
    >
      {/* SKIP */}
      <TouchableOpacity
        style={[styles.skip, { top: insets.top + 12 }]}
        onPress={finish}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.skipText}>Bỏ qua</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={s.icon} size={56} color={colors.primary} />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.desc}>{s.desc}</Text>
          </View>
        ))}
      </ScrollView>

      {/* DOTS */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.button, { marginBottom: insets.bottom + 24 }]}
        onPress={next}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>
          {index >= SLIDES.length - 1 ? "Bắt đầu" : "Tiếp tục"}
        </Text>
        <Ionicons name="arrow-forward" size={20} color="white" />
      </TouchableOpacity>
    </LinearGradient>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    skip: {
      position: "absolute",
      right: 20,
      zIndex: 10,
    },
    skipText: {
      color: C.subText,
      fontSize: 15,
      fontWeight: "600",
    },
    slide: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 36,
    },
    iconCircle: {
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: C.primary + "1A",
      borderWidth: 1,
      borderColor: C.primary + "55",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 40,
    },
    title: {
      color: C.text,
      fontSize: 26,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 16,
    },
    desc: {
      color: C.subText,
      fontSize: 16,
      lineHeight: 25,
      textAlign: "center",
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      marginBottom: 24,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.border,
    },
    dotActive: {
      width: 24,
      backgroundColor: C.primary,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginHorizontal: 24,
      backgroundColor: C.primary,
      paddingVertical: 17,
      borderRadius: RADIUS.lg,
      ...GLOW,
    },
    buttonText: {
      color: "white",
      fontSize: 17,
      fontWeight: "bold",
    },
  });
}
