import React from "react";
import {
  render,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";
import { Alert } from "react-native";

import CreateRuleScreen from "../../app/create-rule";
import { createQueryChain, mockUser } from "../helpers/supabase-mock";

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockBack = jest.fn();
const mockFrom = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: () => mockBack() },
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

jest.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Create Rule Screen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: {},
      loading: false,
    });

    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  it("hiển thị màn hình welcome đúng", () => {
    const { getByText } = render(<CreateRuleScreen />);

    expect(getByText("AI Rule Creator")).toBeTruthy();
    expect(getByText("Xin chào 👋")).toBeTruthy();
    expect(getByText("Hãy mô tả điều bạn muốn AI theo dõi.")).toBeTruthy();
  });

  it("lấy user từ useAuth (không gọi supabase.auth.getUser trực tiếp)", () => {
    render(<CreateRuleScreen />);

    expect(mockUseAuth).toHaveBeenCalled();
  });

  it("thêm tin nhắn user vào chat khi gửi", async () => {
    const { getByPlaceholderText, getByText, getByTestId } = render(
      <CreateRuleScreen />
    );

    fireEvent.changeText(
      getByPlaceholderText("Nhập rule mới..."),
      "Theo dõi giá vàng"
    );
    fireEvent.press(getByTestId("send-button"));

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });
  });

  it("hiển thị preview rule sau khi 'AI phân tích' xong", async () => {
    jest.useFakeTimers();

    const { getByPlaceholderText, getByText, getByTestId } = render(
      <CreateRuleScreen />
    );

    fireEvent.changeText(
      getByPlaceholderText("Nhập rule mới..."),
      "Theo dõi giá vàng"
    );
    fireEvent.press(getByTestId("send-button"));

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    await waitFor(() => {
      expect(getByText("🤖 AI đã tạo rule:")).toBeTruthy();
      expect(getByText("Xác nhận tạo rule")).toBeTruthy();
    });

    jest.useRealTimers();
  });

  it("insert rule với user_id đúng khi xác nhận", async () => {
    jest.useFakeTimers();

    const insertChain = createQueryChain(null);
    mockFrom.mockReturnValue(insertChain);

    const { getByPlaceholderText, getByText, getByTestId } = render(
      <CreateRuleScreen />
    );

    fireEvent.changeText(
      getByPlaceholderText("Nhập rule mới..."),
      "Theo dõi học bổng"
    );
    fireEvent.press(getByTestId("send-button"));

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    await waitFor(() => {
      expect(getByText("Xác nhận tạo rule")).toBeTruthy();
    });

    fireEvent.press(getByText("Xác nhận tạo rule"));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("rules");
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: mockUser.id,
            is_active: true,
          }),
        ])
      );
    });

    jest.useRealTimers();
  });

  it("hiển thị Alert lỗi nếu user chưa đăng nhập khi gửi", async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      loading: false,
    });

    const { getByPlaceholderText, getByTestId } = render(<CreateRuleScreen />);

    fireEvent.changeText(
      getByPlaceholderText("Nhập rule mới..."),
      "Theo dõi gì đó"
    );
    fireEvent.press(getByTestId("send-button"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Lỗi", "Bạn chưa đăng nhập");
    });
  });

  it("hiển thị Alert lỗi nếu message rỗng", async () => {
    const { getByTestId } = render(<CreateRuleScreen />);

    fireEvent.press(getByTestId("send-button"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Lỗi", "Vui lòng nhập nội dung");
    });
  });
});
