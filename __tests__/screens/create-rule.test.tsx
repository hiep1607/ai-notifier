import React from "react";
import {
  render,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";

import CreateRuleScreen from "../../app/create-rule";
import { createQueryChain, mockUser } from "../helpers/supabase-mock";
import type { RuleDraft } from "../../lib/ruleAI";

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockBack = jest.fn();
const mockFrom = jest.fn();
const mockUseAuth = jest.fn();
const mockChatRule = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: () => mockBack() },
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

// AI giờ chạy server-side qua Edge Function (lib/ruleAI.chatRule) — mock nó thay cho
// việc giả lập setTimeout như bản cũ.
jest.mock("../../lib/ruleAI", () => ({
  chatRule: (...args: any[]) => mockChatRule(...args),
}));

jest.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const sampleDraft: RuleDraft = {
  title: "Giá vàng",
  description: "",
  keyword: "giá vàng",
  category: "finance",
  sources: "",
  frequency: "1440",
  run_at: "",
  condition: "",
};

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Create Rule Screen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: mockUser, session: {}, loading: false });
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  it("hiển thị màn hình welcome đúng", () => {
    const { getByText } = render(<CreateRuleScreen />);

    expect(getByText("AI Rule Creator")).toBeTruthy();
    expect(getByText("Xin chào 👋")).toBeTruthy();
    expect(getByText(/Tôi là AI Assistant/)).toBeTruthy();
  });

  it("lấy user từ useAuth (không gọi supabase.auth.getUser trực tiếp)", () => {
    render(<CreateRuleScreen />);
    expect(mockUseAuth).toHaveBeenCalled();
  });

  it("thêm tin nhắn user vào chat khi gửi", async () => {
    mockChatRule.mockResolvedValue({ status: "need_info", message: "Bạn muốn theo dõi gì?" });

    const { getByPlaceholderText, getByText, getByTestId } = render(<CreateRuleScreen />);

    fireEvent.changeText(getByPlaceholderText("Nhập mô tả hoặc trả lời AI..."), "Theo dõi giá vàng");
    fireEvent.press(getByTestId("send-button"));

    await waitFor(() => {
      expect(getByText("Theo dõi giá vàng")).toBeTruthy();
    });
    expect(mockChatRule).toHaveBeenCalled();
  });

  it("hiển thị preview rule sau khi AI trả về 'ready'", async () => {
    mockChatRule.mockResolvedValue({
      status: "ready",
      message: "Đã tạo rule cho bạn.",
      rules: [sampleDraft],
    });

    const { getByPlaceholderText, getByText, getByTestId } = render(<CreateRuleScreen />);

    fireEvent.changeText(getByPlaceholderText("Nhập mô tả hoặc trả lời AI..."), "Theo dõi giá vàng");
    fireEvent.press(getByTestId("send-button"));

    await waitFor(() => {
      expect(getByText("Tạo rule")).toBeTruthy();
      expect(getByText("Giá vàng")).toBeTruthy();
    });
  });

  it("insert rule với user_id đúng khi xác nhận", async () => {
    mockChatRule.mockResolvedValue({
      status: "ready",
      message: "Đã tạo rule.",
      rules: [sampleDraft],
    });
    const insertChain = createQueryChain(null);
    mockFrom.mockReturnValue(insertChain);

    const { getByPlaceholderText, getByText, getByTestId } = render(<CreateRuleScreen />);

    fireEvent.changeText(getByPlaceholderText("Nhập mô tả hoặc trả lời AI..."), "Theo dõi học bổng");
    fireEvent.press(getByTestId("send-button"));

    await waitFor(() => expect(getByText("Tạo rule")).toBeTruthy());

    fireEvent.press(getByText("Tạo rule"));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("rules");
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ user_id: mockUser.id, is_active: true }),
        ])
      );
    });
  });

  it("hiển thị Alert lỗi nếu user chưa đăng nhập khi gửi", async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null, loading: false });

    const { getByPlaceholderText, getByTestId } = render(<CreateRuleScreen />);

    fireEvent.changeText(getByPlaceholderText("Nhập mô tả hoặc trả lời AI..."), "Theo dõi gì đó");
    fireEvent.press(getByTestId("send-button"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Lỗi", "Bạn chưa đăng nhập");
    });
    expect(mockChatRule).not.toHaveBeenCalled();
  });

  it("không gọi AI khi nội dung rỗng (nút gửi vô hiệu)", () => {
    const { getByTestId } = render(<CreateRuleScreen />);

    fireEvent.press(getByTestId("send-button"));

    expect(mockChatRule).not.toHaveBeenCalled();
  });

  // Nhập giọng nói (đường mobile — expo-audio mock ở setup.ts): bấm mic bắt đầu nghe
  // (placeholder đổi), bấm lại dừng; mock không có file ghi âm → báo lỗi thân thiện.
  it("nút mic: bấm để nghe, bấm lại dừng (mock không có bản ghi → báo lỗi)", async () => {
    const { getByTestId, getByPlaceholderText } = render(<CreateRuleScreen />);

    fireEvent.press(getByTestId("mic-button"));
    await waitFor(() => expect(getByPlaceholderText(/Đang nghe/)).toBeTruthy());

    fireEvent.press(getByTestId("mic-button"));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Nhập giọng nói",
        expect.stringContaining("Không ghi âm được"),
      );
    });
  });
});
