import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import RulesScreen from "../../app/(tabs)/rules";
import { createQueryChain, mockUser } from "../helpers/supabase-mock";

// ── Mocks ────────────────────────────────────────────────────────────────────
import { router } from "expo-router";

const mockFrom = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("@react-navigation/native", () => ({
  // Defer cb so the component body finishes executing before fetchRules is called
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
const mockRules = [
  {
    id: "rule-1",
    user_id: mockUser.id,
    title: "Theo dõi giá vàng",
    description: "Giá vàng SJC",
    keyword: "giá vàng",
    is_active: true,
  },
  {
    id: "rule-2",
    user_id: mockUser.id,
    title: "Theo dõi iPhone",
    description: "Giá iPhone",
    keyword: "iphone",
    is_active: false,
  },
  {
    id: "rule-3",
    user_id: mockUser.id,
    title: "Theo dõi học bổng",
    description: "Học bổng DAAD",
    keyword: "học bổng",
    is_active: true,
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Rules Screen — Tab Filter", () => {
  let chain: ReturnType<typeof createQueryChain>;

  beforeEach(() => {
    jest.clearAllMocks();
    chain = createQueryChain(mockRules);
    mockFrom.mockReturnValue(chain);
  });

  it("hiển thị tất cả rules khi ở tab 'Tất cả'", async () => {
    const { getByText } = render(<RulesScreen />);

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
      expect(getByText("Theo dõi iPhone")).toBeTruthy();
      expect(getByText("Theo dõi học bổng")).toBeTruthy();
    });
  });

  it("chỉ hiển thị active rules khi chọn tab 'Đang hoạt động'", async () => {
    const { getByText, queryByText } = render(<RulesScreen />);

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });

    fireEvent.press(getByText("Đang hoạt động"));

    // Active rules xuất hiện
    expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    expect(getByText("Theo dõi học bổng")).toBeTruthy();

    // Inactive rule không xuất hiện
    expect(queryByText("Theo dõi iPhone")).toBeNull();
  });

  it("chỉ hiển thị inactive rules khi chọn tab 'Tạm dừng'", async () => {
    const { getByText, queryByText } = render(<RulesScreen />);

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });

    fireEvent.press(getByText("Tạm dừng"));

    // Inactive rule xuất hiện
    expect(getByText("Theo dõi iPhone")).toBeTruthy();

    // Active rules không xuất hiện
    expect(queryByText("Theo dõi giá vàng")).toBeNull();
    expect(queryByText("Theo dõi học bổng")).toBeNull();
  });

  it("fetch rules được lọc theo user_id", async () => {
    render(<RulesScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("rules");
    });

    expect(chain.eq).toHaveBeenCalledWith("user_id", mockUser.id);
  });

  it("nhấn vào rule card điều hướng với id đúng", async () => {
    const { getByText } = render(<RulesScreen />);

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });

    fireEvent.press(getByText("Theo dõi giá vàng"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/rule-detail",
      params: { id: "rule-1" },
    });
  });

  it("toggle switch cập nhật is_active trên Supabase", async () => {
    const updateChain = createQueryChain([], null);
    chain.update.mockReturnValue(updateChain);

    const { getAllByRole } = render(<RulesScreen />);

    await waitFor(() => {
      const switches = getAllByRole("switch");
      expect(switches.length).toBeGreaterThan(0);
    });

    const switches = getAllByRole("switch");
    // Toggle rule đầu tiên (is_active = true → false)
    fireEvent.press(switches[0]);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("rules");
      expect(chain.update).toHaveBeenCalledWith({ is_active: false });
    });
  });
});
