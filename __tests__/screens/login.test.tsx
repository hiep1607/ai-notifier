import React from "react";
import {
  render,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";

import LoginScreen from "../../app/login";

// ── Mocks ────────────────────────────────────────────────────────────────────
// Phải dùng jest.fn() trực tiếp trong factory — tránh hoisting issue với const
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { signInWithPassword: jest.fn() },
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Login Screen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  it("render đúng các thành phần cơ bản", () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    expect(getByPlaceholderText("Email")).toBeTruthy();
    expect(getByPlaceholderText("Mật khẩu")).toBeTruthy();
    expect(getByText("Đăng nhập")).toBeTruthy();
    expect(getByText("Chưa có tài khoản? Đăng ký")).toBeTruthy();
  });

  it("gọi signInWithPassword với email và password đúng", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: null,
    });

    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(getByPlaceholderText("Mật khẩu"), "password123");
    fireEvent.press(getByText("Đăng nhập"));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "user@test.com",
        password: "password123",
      });
    });
  });

  it("điều hướng đến /(tabs) sau khi đăng nhập thành công", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: null,
    });

    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(getByPlaceholderText("Mật khẩu"), "password123");
    fireEvent.press(getByText("Đăng nhập"));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/(tabs)");
    });
  });

  it("hiển thị Alert lỗi khi đăng nhập thất bại", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: "Invalid credentials" },
    });

    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText("Email"), "wrong@test.com");
    fireEvent.changeText(getByPlaceholderText("Mật khẩu"), "wrong");
    fireEvent.press(getByText("Đăng nhập"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Lỗi", "Invalid credentials");
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("link 'Đăng ký' điều hướng đến /register", () => {
    const { getByText } = render(<LoginScreen />);

    fireEvent.press(getByText("Chưa có tài khoản? Đăng ký"));

    expect(router.push).toHaveBeenCalledWith("/register");
  });

  it("chỉ có một link đăng ký (không nested TouchableOpacity)", () => {
    const { getAllByText } = render(<LoginScreen />);

    // Nếu nested, text bị render 2 lần
    expect(getAllByText("Chưa có tài khoản? Đăng ký")).toHaveLength(1);
  });
});
