import React from "react";
import {
  render,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";

import RegisterScreen from "../../app/register";

// ── Mocks ────────────────────────────────────────────────────────────────────
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { signUp: jest.fn() },
  },
}));

// Điền đủ form hợp lệ (họ tên + email + mật khẩu ≥6 ký tự + xác nhận khớp).
function fillValidForm(getByPlaceholderText: (p: string) => any) {
  fireEvent.changeText(getByPlaceholderText("Nguyễn Văn A"), "Nguyễn Văn A");
  fireEvent.changeText(getByPlaceholderText("example@email.com"), "newuser@test.com");
  fireEvent.changeText(getByPlaceholderText("Ít nhất 6 ký tự"), "secret123");
  fireEvent.changeText(getByPlaceholderText("Nhập lại mật khẩu"), "secret123");
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Register Screen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // App dùng alertMessage (lib/dialog) → trên native gọi Alert.alert.
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  it("render đúng các thành phần cơ bản", () => {
    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);

    expect(getByPlaceholderText("Nguyễn Văn A")).toBeTruthy();
    expect(getByPlaceholderText("example@email.com")).toBeTruthy();
    expect(getByPlaceholderText("Ít nhất 6 ký tự")).toBeTruthy();
    expect(getByPlaceholderText("Nhập lại mật khẩu")).toBeTruthy();
    expect(getByText("Đăng ký")).toBeTruthy();
    expect(getByText("Đã có tài khoản? Đăng nhập")).toBeTruthy();
  });

  it("gọi signUp với email, password và metadata họ tên/điện thoại", async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: {}, error: null });

    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);
    fillValidForm(getByPlaceholderText);
    fireEvent.press(getByText("Đăng ký"));

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: "newuser@test.com",
        password: "secret123",
        options: { data: { full_name: "Nguyễn Văn A", phone: "" } },
      });
    });
  });

  it("điều hướng đến /login sau khi đăng ký thành công (chưa có session)", async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: {}, error: null });

    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);
    fillValidForm(getByPlaceholderText);
    fireEvent.press(getByText("Đăng ký"));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("chặn submit khi mật khẩu xác nhận không khớp (không gọi signUp)", () => {
    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);
    fireEvent.changeText(getByPlaceholderText("Nguyễn Văn A"), "Nguyễn Văn A");
    fireEvent.changeText(getByPlaceholderText("example@email.com"), "u@test.com");
    fireEvent.changeText(getByPlaceholderText("Ít nhất 6 ký tự"), "secret123");
    fireEvent.changeText(getByPlaceholderText("Nhập lại mật khẩu"), "khac123");
    fireEvent.press(getByText("Đăng ký"));

    expect(supabase.auth.signUp).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Lỗi", "Mật khẩu xác nhận không khớp");
  });

  it("hiển thị Alert lỗi khi đăng ký thất bại", async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: {},
      error: { message: "Email already registered" },
    });

    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);
    fillValidForm(getByPlaceholderText);
    fireEvent.press(getByText("Đăng ký"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Lỗi", "Email already registered");
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("link 'Đăng nhập' điều hướng đến /login", () => {
    const { getByText } = render(<RegisterScreen />);

    fireEvent.press(getByText("Đã có tài khoản? Đăng nhập"));

    expect(router.push).toHaveBeenCalledWith("/login");
  });
});
