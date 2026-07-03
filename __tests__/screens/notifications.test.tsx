import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import NotificationsScreen from "../../app/(tabs)/notifications";
import { createQueryChain, mockUser } from "../helpers/supabase-mock";

// ── Mocks ────────────────────────────────────────────────────────────────────
import { router } from "expo-router";

const mockFrom = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("@react-navigation/native", () => ({
  // Defer cb để body component chạy xong trước khi fetch dữ liệu.
  useFocusEffect: jest.fn((cb) => { Promise.resolve().then(cb); }),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

jest.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    session: {},
    loading: false,
  }),
}));

// ── Data fixtures ─────────────────────────────────────────────────────────────
const mockUserRules = [{ id: "rule-1" }, { id: "rule-2" }];

const mockNotifications = [
  {
    id: "notif-1",
    rule_id: "rule-1",
    title: "Vàng tăng 500k",
    content: "Giá vàng hôm nay tăng mạnh",
    is_read: false,
    is_important: true,
  },
  {
    id: "notif-2",
    rule_id: "rule-2",
    title: "iPhone giảm giá",
    content: "Apple giảm giá mạnh",
    is_read: true,
    is_important: false,
  },
  {
    id: "notif-3",
    rule_id: "rule-1",
    title: "Học bổng mới",
    content: "DAAD mở thêm học bổng",
    is_read: false,
    is_important: false,
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Notifications Screen", () => {
  let rulesChain: ReturnType<typeof createQueryChain>;
  let notificationsChain: ReturnType<typeof createQueryChain>;

  beforeEach(() => {
    jest.clearAllMocks();

    rulesChain = createQueryChain(mockUserRules);
    notificationsChain = createQueryChain(mockNotifications);

    mockFrom.mockImplementation((table: string) => {
      if (table === "rules") return rulesChain;
      if (table === "notifications") return notificationsChain;
      return createQueryChain([]);
    });
  });

  // ── B1: Query đúng schema ─────────────────────────────────────────────────

  it("query rules trước để lấy IDs theo user_id", async () => {
    render(<NotificationsScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("rules");
    });

    expect(rulesChain.eq).toHaveBeenCalledWith("user_id", mockUser.id);
  });

  // Từ 0021 notifications có CHỦ SỞ HỮU trực tiếp (cột user_id) — phải lọc theo nó để
  // thấy cả thông báo "mồ côi rule" (nhắc hẹn tự xóa rule sau khi nhắc). Lọc theo
  // rule_id chỉ còn là fallback khi cột chưa tồn tại (lib/notifQuery).
  it("query notifications theo user_id (0021 — thấy cả thông báo mồ côi rule)", async () => {
    render(<NotificationsScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("notifications");
    });

    expect(notificationsChain.eq).toHaveBeenCalledWith("user_id", mockUser.id);
  });

  // ── Hiển thị dữ liệu ─────────────────────────────────────────────────────

  it("hiển thị danh sách notifications", async () => {
    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText("Vàng tăng 500k")).toBeTruthy();
      expect(getByText("iPhone giảm giá")).toBeTruthy();
      expect(getByText("Học bổng mới")).toBeTruthy();
    });
  });

  it("hiển thị empty state khi không có notifications", async () => {
    rulesChain = createQueryChain([]);
    mockFrom.mockImplementation((table: string) => {
      if (table === "rules") return rulesChain;
      return createQueryChain([]);
    });

    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText("Chưa có thông báo")).toBeTruthy();
    });
  });

  // ── Tab filter ────────────────────────────────────────────────────────────

  it("tab 'Chưa đọc' chỉ hiển thị notifications chưa đọc", async () => {
    const { getByText, queryByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText("Vàng tăng 500k")).toBeTruthy();
    });

    fireEvent.press(getByText("Chưa đọc"));

    // is_read=false → hiện
    expect(getByText("Vàng tăng 500k")).toBeTruthy();
    expect(getByText("Học bổng mới")).toBeTruthy();

    // is_read=true → ẩn
    expect(queryByText("iPhone giảm giá")).toBeNull();
  });

  it("tab 'Quan trọng' chỉ hiển thị notifications quan trọng", async () => {
    const { getByText, getAllByText, queryByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText("Vàng tăng 500k")).toBeTruthy();
    });

    // "Quan trọng" xuất hiện ở cả tab lọc lẫn badge trên card → tab là phần tử đầu.
    fireEvent.press(getAllByText("Quan trọng")[0]);

    // is_important=true → hiện
    expect(getByText("Vàng tăng 500k")).toBeTruthy();

    // is_important=false → ẩn
    expect(queryByText("iPhone giảm giá")).toBeNull();
    expect(queryByText("Học bổng mới")).toBeNull();
  });

  it("nhấn notification card điều hướng với id đúng", async () => {
    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => {
      expect(getByText("Vàng tăng 500k")).toBeTruthy();
    });

    fireEvent.press(getByText("Vàng tăng 500k"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/notification-detail",
      params: { id: "notif-1" },
    });
  });
});
