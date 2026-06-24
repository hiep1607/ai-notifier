import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import HomeScreen from "../../app/(tabs)/index";
import { createQueryChain, mockUser } from "../helpers/supabase-mock";

// ── Mocks ────────────────────────────────────────────────────────────────────
import { router } from "expo-router";

const mockFrom = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("@react-navigation/native", () => ({
  // Defer cb so the component body finishes executing before fetchData is called
  useFocusEffect: jest.fn((cb) => { Promise.resolve().then(cb); }),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

jest.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-test-123", email: "test@example.com" },
    session: {},
    loading: false,
  }),
}));

// ── Data fixtures ─────────────────────────────────────────────────────────────
const mockRules = [
  {
    id: "rule-1",
    user_id: "user-test-123",
    title: "Theo dõi giá vàng",
    description: "Giá vàng SJC",
    keyword: "giá vàng",
    is_active: true,
  },
  {
    id: "rule-2",
    user_id: "user-test-123",
    title: "Theo dõi iPhone",
    description: "Giá iPhone",
    keyword: "iphone",
    is_active: false,
  },
];

const mockNotifications = [
  {
    id: "notif-1",
    rule_id: "rule-1",
    title: "Vàng tăng 500k",
    content: "...",
    is_read: false,
    is_important: true,
  },
  {
    id: "notif-2",
    rule_id: "rule-1",
    title: "Vàng giảm 200k",
    content: "...",
    is_read: true,
    is_important: false,
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Home Screen (index)", () => {
  let rulesChain: ReturnType<typeof createQueryChain>;
  let notificationsChain: ReturnType<typeof createQueryChain>;

  beforeEach(() => {
    jest.clearAllMocks();

    rulesChain = createQueryChain(mockRules);
    notificationsChain = createQueryChain(mockNotifications);

    mockFrom.mockImplementation((table: string) => {
      if (table === "rules") return rulesChain;
      if (table === "notifications") return notificationsChain;
      return createQueryChain([]);
    });
  });

  it("fetch rules được lọc theo user_id của user hiện tại", async () => {
    render(<HomeScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("rules");
    });

    expect(rulesChain.eq).toHaveBeenCalledWith("user_id", mockUser.id);
  });

  it("query notifications qua rule_id (KHÔNG dùng user_id trên bảng notifications)", async () => {
    render(<HomeScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("notifications");
    });

    // Phải dùng .in('rule_id', ...) — fix lỗi B1
    expect(notificationsChain.in).toHaveBeenCalledWith(
      "rule_id",
      expect.any(Array)
    );

    // Không được gọi .eq('user_id') trực tiếp trên bảng notifications
    const eqWithUserId = (notificationsChain.eq as jest.Mock).mock.calls.filter(
      ([col]: [string]) => col === "user_id"
    );
    expect(eqWithUserId).toHaveLength(0);
  });

  it("hiển thị đúng số active rules trong stats", async () => {
    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      // 1 rule active trong mockRules
      expect(getByText("1")).toBeTruthy();
    });
  });

  it("hiển thị số important notifications đúng trong AI Insight", async () => {
    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      // 1 important notification trong mockNotifications
      expect(getByText(/1 tin quan trọng/)).toBeTruthy();
    });
  });

  it("chỉ hiển thị active rules trong danh sách", async () => {
    const { getByText, queryByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });

    // Rule không active không hiện trong list
    expect(queryByText("Theo dõi iPhone")).toBeNull();
  });

  it("nhấn vào rule card điều hướng với id đúng", async () => {
    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });

    fireEvent.press(getByText("Theo dõi giá vàng"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/rule-detail",
      params: { id: "rule-1" },
    });
  });
});
