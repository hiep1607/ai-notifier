import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../contexts/ThemeContext";
import { PreviewKind, RulePreviewResult } from "../lib/monitor";
import { RADIUS, type AppColors } from "../lib/theme";

const PROVIDERS: Record<string, string> = {
  weather: "Open-Meteo",
  crypto: "CoinGecko",
  fx: "Tỷ giá trực tiếp",
  rss: "RSS báo chí",
  url: "Trang web theo dõi",
  reminder: "Lịch nhắc trên hệ thống",
};

const KIND_LABELS: Record<PreviewKind, string> = {
  real: "Sẽ tạo thông báo mới",
  nochange: "Sẽ báo chưa có thay đổi",
  related: "Chỉ có kết quả liên quan",
  none: "Chưa tìm thấy kết quả",
  skipped: "Chưa đủ điều kiện để báo",
};

interface Props {
  result?: RulePreviewResult | null;
  loading?: boolean;
  onPreview: () => void;
  disabled?: boolean;
}

export default function RulePreviewPanel({ result, loading = false, onPreview, disabled = false }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentWillNotify = result
    ? result.currentMode === "important" ? result.importantPushed : result.allKind !== "skipped"
    : false;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.previewButton, (loading || disabled) && { opacity: 0.6 }]}
        onPress={onPreview}
        disabled={loading || disabled}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="flask-outline" size={18} color={colors.primary} />
        )}
        <Text style={styles.previewButtonText}>{loading ? "Đang xem thử..." : "Xem thử kết quả"}</Text>
      </TouchableOpacity>

      {result ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Ionicons
              name={currentWillNotify ? "checkmark-circle-outline" : "funnel-outline"}
              size={20}
              color={currentWillNotify ? colors.success : colors.warning}
            />
            <Text style={[styles.resultTitle, { color: currentWillNotify ? colors.success : colors.warning }]}>
              {currentWillNotify ? "Rule sẽ hoạt động" : "Kết quả sẽ bị lọc"}
            </Text>
          </View>
          <Text style={styles.sourceText}>
            Nguồn thử: {result.provider ? PROVIDERS[result.provider] ?? result.provider : "AI + tìm kiếm web"}
          </Text>
          {result.found ? (
            <>
              <Text style={styles.candidate} numberOfLines={3}>{result.candidateTitle || "Kết quả không có tiêu đề"}</Text>
              {result.value ? <Text style={styles.value}>{result.value}</Text> : null}
              <Text style={styles.decision}>{KIND_LABELS[result.allKind]}</Text>
            </>
          ) : (
            <Text style={styles.candidate}>Chưa tìm thấy kết quả phù hợp ở lần xem thử này.</Text>
          )}
          {result.importantReason ? <Text style={styles.reason}>{result.importantReason}</Text> : null}
          <Text style={styles.disclaimer}>Xem thử dùng dữ liệu hiện tại và không tạo thông báo.</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    wrap: { marginTop: 14 },
    previewButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: C.primary,
      borderRadius: RADIUS.md,
      paddingVertical: 12,
      backgroundColor: C.primary + "0D",
    },
    previewButtonText: { color: C.primary, fontWeight: "700", fontSize: 14 },
    resultCard: {
      marginTop: 10,
      padding: 14,
      borderRadius: RADIUS.md,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.border,
    },
    resultHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
    resultTitle: { fontWeight: "800", fontSize: 14 },
    sourceText: { color: C.subText, fontSize: 12 },
    candidate: { color: C.text, fontWeight: "600", lineHeight: 20, marginTop: 8 },
    value: { color: C.primary, fontSize: 13, fontWeight: "700", marginTop: 5 },
    decision: { color: C.text, fontSize: 13, marginTop: 8 },
    reason: { color: C.subText, fontSize: 12, lineHeight: 18, marginTop: 7 },
    disclaimer: { color: C.subText, fontSize: 11, fontStyle: "italic", marginTop: 9 },
  });
}
