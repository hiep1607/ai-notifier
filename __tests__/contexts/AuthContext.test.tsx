import React from "react";
import { Text } from "react-native";
import { render, act, waitFor } from "@testing-library/react-native";

import {
  AuthProvider,
  useAuth,
} from "../../contexts/AuthContext";
import { mockSession, mockUser } from "../helpers/supabase-mock";

// ── Mock supabase ────────────────────────────────────────────────────────────
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: any) => mockOnAuthStateChange(cb),
    },
  },
}));

// ── Helper component để đọc context ─────────────────────────────────────────
function AuthConsumer() {
  const { user, session, loading } = useAuth();
  return (
    <>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="user">{user?.email ?? "null"}</Text>
      <Text testID="session">{session ? "has-session" : "no-session"}</Text>
    </>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("AuthContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  it("bắt đầu với loading=true và user=null", () => {
    // getSession chưa resolve
    mockGetSession.mockReturnValue(new Promise(() => {}));

    const { getByTestId } = renderWithProvider();

    expect(getByTestId("loading").props.children).toBe("true");
    expect(getByTestId("user").props.children).toBe("null");
  });

  it("set loading=false và user=null sau khi getSession trả về null session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { getByTestId } = renderWithProvider();

    await waitFor(() => {
      expect(getByTestId("loading").props.children).toBe("false");
    });

    expect(getByTestId("user").props.children).toBe("null");
    expect(getByTestId("session").props.children).toBe("no-session");
  });

  it("set user và session sau khi getSession trả về session hợp lệ", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
    });

    const { getByTestId } = renderWithProvider();

    await waitFor(() => {
      expect(getByTestId("loading").props.children).toBe("false");
    });

    expect(getByTestId("user").props.children).toBe(mockUser.email);
    expect(getByTestId("session").props.children).toBe("has-session");
  });

  it("cập nhật session khi onAuthStateChange được gọi", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    let authStateCallback: (event: string, session: any) => void = () => {};

    mockOnAuthStateChange.mockImplementation((cb: any) => {
      authStateCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { getByTestId } = renderWithProvider();

    await waitFor(() => {
      expect(getByTestId("loading").props.children).toBe("false");
    });

    // Trước khi auth state thay đổi: no session
    expect(getByTestId("session").props.children).toBe("no-session");

    // Simulate đăng nhập thành công từ bên ngoài
    act(() => {
      authStateCallback("SIGNED_IN", mockSession);
    });

    await waitFor(() => {
      expect(getByTestId("session").props.children).toBe("has-session");
    });

    expect(getByTestId("user").props.children).toBe(mockUser.email);
  });

  it("gọi unsubscribe khi component unmount", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = renderWithProvider();

    await waitFor(() => {
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
