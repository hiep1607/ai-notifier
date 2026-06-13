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

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Register Screen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(
      (_title, _msg, buttons) => {
        // Auto-click nút OK để trigger onPress callback
        buttons?.[0]?.onPress?.();
      }
    );
  });

  afterEach(() => alertSpy.mockRestore());

  it("render đúng các thành phần cơ bản", () => {
    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);

    expect(getByPlaceholderText("Email")).toBeTruthy();
    expect(getByPlaceholderText("Mật khẩu")).toBeTruthy();
    expect(getByText("Đăng ký")).toBeTruthy();
    expect(getByText("Đã có tài khoản? Đăng nhập")).toBeTruthy();
  });

  it("gọi signUp với email và password đúng", async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: null });

    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);

    fireEvent.changeText(getByPlaceholderText("Email"), "newuser@test.com");
    fireEvent.changeText(getByPlaceholderText("Mật khẩu"), "secret123");
    fireEvent.press(getByText("Đăng ký"));

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: "newuser@test.com",
        password: "secret123",
      });
    });
  });

  it("gọi router.replace('/login') đúng 1 lần sau khi đăng ký thành công", async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: null });

    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);

    fireEvent.changeText(getByPlaceholderText("Email"), "newuser@test.com");
    fireEvent.changeText(getByPlaceholderText("Mật khẩu"), "secret123");
    fireEvent.press(getByText("Đăng ký"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    // Lỗi cũ: gọi 2 lần — sau Phase 0 chỉ 1 lần (bên trong Alert callback)
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/login");
  });

  it("hiển thị Alert lỗi khi đăng ký thất bại", async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      error: { message: "Email already registered" },
    });

    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);

    fireEvent.changeText(getByPlaceholderText("Email"), "existing@test.com");
    fireEvent.changeText(getByPlaceholderText("Mật khẩu"), "pass");
    fireEvent.press(getByText("Đăng ký"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Lỗi",
        "Email already registered"
      );
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("link 'Đăng nhập' điều hướng đến /login", () => {
    const { getByText } = render(<RegisterScreen />);

    fireEvent.press(getByText("Đã có tài khoản? Đăng nhập"));

    expect(router.push).toHaveBeenCalledWith("/login");
  });

  it("chỉ có một link đăng nhập (không nested TouchableOpacity)", () => {
    const { getAllByText } = render(<RegisterScreen />);

    expect(getAllByText("Đã có tài khoản? Đăng nhập")).toHaveLength(1);
  });
});
