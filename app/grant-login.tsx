import React, { useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "../lib/supabase";
import { alertMessage } from "../lib/dialog";
import { useTheme } from "../contexts/ThemeContext";
import { RADIUS, type AppColors } from "../lib/theme";

// WebView chỉ có trên mobile (react-native-web không hỗ trợ) — require trong điều kiện
// runtime để bundle web không thực thi module native này.
let WebView: any = null;
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebView = require("react-native-webview").WebView;
}

// Chạy sau MỖI lần trang load xong: gửi document.cookie về app. Lưu ý giới hạn:
// cookie đánh dấu HttpOnly thì JS không đọc được — gặp trang như vậy phải dùng
// cách dán Cookie thủ công (hướng dẫn ở chi tiết rule).
const COOKIE_JS = `window.ReactNativeWebView.postMessage(document.cookie || ""); true;`;

// Đăng nhập 1-chạm cho rule theo dõi trang cần đăng nhập: mở trang TRONG APP,
// người dùng đăng nhập như bình thường, app tự gom cookie → bấm 1 nút để cấp quyền.
export default function GrantLoginScreen() {
  const { id, url } = useLocalSearchParams<{ id: string; url: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const webRef = useRef<any>(null);
  const [cookie, setCookie] = useState("");
  const [saving, setSaving] = useState(false);

  const cookieCount = cookie.split(";").map((s) => s.trim()).filter(Boolean).length;

  const save = async () => {
    if (!id || !cookie.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("rules")
      .update({ watch_auth: cookie.trim() })
      .eq("id", id);
    setSaving(false);

    if (error) {
      alertMessage("Chưa lưu được", "Cần chạy migration 0018 (cột watch_url/watch_auth) trong Supabase trước.");
      return;
    }
    alertMessage(
      "Đã cấp quyền",
      "Hệ thống sẽ đọc trang bằng phiên đăng nhập của bạn từ các lần quét tới. Nếu sau đó vẫn bị báo cần đăng nhập (trang giấu phiên kiểu HttpOnly), hãy dùng cách dán Cookie thủ công ở chi tiết rule."
    );
    // replace (không phải back) để màn chi tiết rule dựng lại → thấy ngay "Đã cho phép".
    router.replace({ pathname: "/rule-detail", params: { id: String(id) } });
  };

  if (!url) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.subText }}>Thiếu địa chỉ trang cần đăng nhập</Text>
      </View>
    );
  }

  // WEB: không nhúng được trang khác (trình duyệt chặn đọc cookie chéo nguồn) →
  // hướng dẫn mở tab mới + quay lại chi tiết rule dán Cookie thủ công.
  if (Platform.OS === "web") {
    return (
      <View style={[styles.center, { paddingHorizontal: 24 }]}>
        <Ionicons name="laptop-outline" size={40} color={colors.subText} />
        <Text style={styles.webTitle}>Trên web hãy dùng cách thủ công</Text>
        <Text style={styles.webHint}>
          Trình duyệt không cho app đọc phiên đăng nhập của trang khác. Bạn mở trang ở tab
          mới, đăng nhập, rồi quay lại chi tiết rule dán Cookie (F12 → Network → copy dòng
          Cookie). Trên điện thoại thì bước này chỉ cần 1 chạm.
        </Text>
        <TouchableOpacity style={styles.webOpenBtn} onPress={() => Linking.openURL(String(url))}>
          <Ionicons name="open-outline" size={16} color="white" />
          <Text style={styles.webOpenText}>Mở trang ở tab mới</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.back()}>
          <Text style={{ color: colors.subText, fontWeight: "600" }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Thanh trên: đóng + trạng thái cookie + nút cấp quyền */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.topTitle} numberOfLines={1}>Đăng nhập rồi bấm “Cấp quyền”</Text>
          <Text style={styles.topSub} numberOfLines={1}>
            {cookieCount > 0 ? `Đã nhận ${cookieCount} cookie từ trang` : "Chưa nhận được cookie — hãy đăng nhập"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.grantBtn, (cookieCount === 0 || saving) && { opacity: 0.5 }]}
          onPress={save}
          disabled={cookieCount === 0 || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="white" />
            : <Text style={styles.grantText}>Cấp quyền</Text>}
        </TouchableOpacity>
      </View>

      <WebView
        ref={webRef}
        source={{ uri: String(url) }}
        style={{ flex: 1 }}
        injectedJavaScript={COOKIE_JS}
        onMessage={(e: { nativeEvent: { data: string } }) => {
          const c = String(e.nativeEvent.data ?? "").trim();
          if (c) setCookie(c);
        }}
        // Sau mỗi bước điều hướng (vd đăng nhập xong chuyển trang) đọc lại cookie mới nhất.
        onNavigationStateChange={() => webRef.current?.injectJavaScript(COOKIE_JS)}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        startInLoadingState
      />
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    center: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: "center",
      alignItems: "center",
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    topTitle: {
      color: C.text,
      fontSize: 14,
      fontWeight: "700",
    },
    topSub: {
      color: C.subText,
      fontSize: 12,
      marginTop: 2,
    },
    grantBtn: {
      backgroundColor: C.primary,
      borderRadius: RADIUS.sm,
      paddingHorizontal: 14,
      paddingVertical: 9,
      minWidth: 92,
      alignItems: "center",
    },
    grantText: {
      color: "white",
      fontWeight: "700",
      fontSize: 13,
    },
    webTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "700",
      marginTop: 14,
      marginBottom: 8,
      textAlign: "center",
    },
    webHint: {
      color: C.subText,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginBottom: 18,
    },
    webOpenBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    webOpenText: {
      color: "white",
      fontWeight: "700",
    },
  });
}
