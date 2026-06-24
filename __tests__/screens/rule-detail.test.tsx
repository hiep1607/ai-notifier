import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import RuleDetailScreen from "../../app/rule-detail";
import { createQueryChain } from "../helpers/supabase-mock";

// ── Mocks ────────────────────────────────────────────────────────────────────
import { router } from "expo-router";

const mockFrom = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

// ── Data fixtures ─────────────────────────────────────────────────────────────
const mockRule = {
  id: "rule-abc",
  user_id: "user-test-123",
  title: "Theo dõi giá vàng",
  description: "Rule theo dõi giá vàng SJC mỗi 3 giờ",
  keyword: "giá vàng SJC",
  is_active: true,
  created_at: "2025-01-15T10:00:00Z",
};

const mockNotifications = [
  {
    id: "notif-x",
    rule_id: "rule-abc",
    title: "Vàng tăng mạnh",
    content: "Giá vàng hôm nay đạt đỉnh 3 tháng",
    is_read: false,
    is_important: true,
    created_at: "2025-06-10T08:00:00Z",
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Rule Detail Screen", () => {
  let rulesChain: ReturnType<typeof createQueryChain>;
  let notificationsChain: ReturnType<typeof createQueryChain>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseLocalSearchParams.mockReturnValue({ id: "rule-abc" });

    rulesChain = createQueryChain(mockRule);
    notificationsChain = createQueryChain(mockNotifications);

    mockFrom.mockImplementation((table: string) => {
      if (table === "rules") return rulesChain;
      if (table === "notifications") return notificationsChain;
      return createQueryChain([]);
    });
  });

  it("đọc id từ useLocalSearchParams", async () => {
    render(<RuleDetailScreen />);

    await waitFor(() => {
      expect(mockUseLocalSearchParams).toHaveBeenCalled();
    });
  });

  it("fetch rule theo id đúng", async () => {
    render(<RuleDetailScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("rules");
    });

    expect(rulesChain.eq).toHaveBeenCalledWith("id", "rule-abc");
    expect(rulesChain.single).toHaveBeenCalled();
  });

  it("fetch notifications theo rule_id", async () => {
    render(<RuleDetailScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("notifications");
    });

    expect(notificationsChain.eq).toHaveBeenCalledWith("rule_id", "rule-abc");
  });

  it("hiển thị tiêu đề rule thật (không phải mock hardcode)", async () => {
    const { getByText } = render(<RuleDetailScreen />);

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });
  });

  it("hiển thị keyword của rule", async () => {
    const { getByText } = render(<RuleDetailScreen />);

    await waitFor(() => {
      expect(getByText("giá vàng SJC")).toBeTruthy();
    });
  });

  it("hiển thị danh sách notifications thật", async () => {
    const { getByText } = render(<RuleDetailScreen />);

    await waitFor(() => {
      expect(getByText("Vàng tăng mạnh")).toBeTruthy();
    });
  });

  it("toggle switch cập nhật is_active trên Supabase", async () => {
    const updateChain = createQueryChain([], null);
    rulesChain.update.mockReturnValue(updateChain);

    const { getAllByRole } = render(<RuleDetailScreen />);

    await waitFor(() => {
      const switches = getAllByRole("switch");
      expect(switches.length).toBeGreaterThan(0);
    });

    const switches = getAllByRole("switch");
    fireEvent.press(switches[0]);

    await waitFor(() => {
      expect(rulesChain.update).toHaveBeenCalledWith({ is_active: false });
    });
  });

  it("nhấn notification trong detail điều hướng với id đúng", async () => {
    const { getByText } = render(<RuleDetailScreen />);

    await waitFor(() => {
      expect(getByText("Vàng tăng mạnh")).toBeTruthy();
    });

    fireEvent.press(getByText("Vàng tăng mạnh"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/notification-detail",
      params: { id: "notif-x" },
    });
  });
});
