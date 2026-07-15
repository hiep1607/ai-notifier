import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import NotificationDetailScreen from "../../app/notification-detail";
import { createQueryChain } from "../helpers/supabase-mock";

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockBack = jest.fn();
const mockFrom = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: jest.fn() },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

// ── Data fixtures ─────────────────────────────────────────────────────────────
const mockNotificationUnread = {
  id: "notif-detail-1",
  rule_id: "rule-abc",
  title: "Giá vàng tăng vọt",
  content: "Giá vàng SJC hôm nay tăng 500k so với hôm qua",
  ai_summary: "AI phân tích: xu hướng tăng ngắn hạn, có thể đạt đỉnh cuối tuần",
  is_read: false,
  is_important: true,
  created_at: "2025-06-13T08:30:00Z",
};

const mockNotificationRead = {
  ...mockNotificationUnread,
  id: "notif-detail-2",
  is_read: true,
  is_important: false,
};

const mockNotificationNoSummary = {
  ...mockNotificationUnread,
  id: "notif-detail-3",
  ai_summary: undefined,
};

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Notification Detail Screen", () => {
  let chain: ReturnType<typeof createQueryChain>;
  let updateChain: ReturnType<typeof createQueryChain>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ id: "notif-detail-1" });

    chain = createQueryChain(mockNotificationUnread);
    updateChain = createQueryChain(null);

    mockFrom.mockImplementation(() => {
      return chain;
    });

    chain.update.mockReturnValue(updateChain);
  });

  it("đọc id từ useLocalSearchParams", async () => {
    render(<NotificationDetailScreen />);

    expect(mockUseLocalSearchParams).toHaveBeenCalled();
  });

  it("fetch notification theo id đúng", async () => {
    render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("notifications");
    });

    expect(chain.eq).toHaveBeenCalledWith("id", "notif-detail-1");
    expect(chain.single).toHaveBeenCalled();
  });

  it("hiển thị tiêu đề notification thật", async () => {
    const { getByText } = render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(getByText("Giá vàng tăng vọt")).toBeTruthy();
    });
  });

  it("hiển thị nội dung notification", async () => {
    const { getByText } = render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(
        getByText(
          "Giá vàng SJC hôm nay tăng 500k so với hôm qua"
        )
      ).toBeTruthy();
    });
  });

  it("hiển thị AI Summary khi có", async () => {
    const { getByText } = render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(getByText("AI tóm tắt")).toBeTruthy();
      expect(
        getByText(
          "AI phân tích: xu hướng tăng ngắn hạn, có thể đạt đỉnh cuối tuần"
        )
      ).toBeTruthy();
    });
  });

  it("ẩn section AI Summary khi không có ai_summary", async () => {
    chain = createQueryChain(mockNotificationNoSummary);
    mockFrom.mockReturnValue(chain);

    const { queryByText } = render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(
        queryByText(
          "Giá vàng SJC hôm nay tăng 500k so với hôm qua"
        )
      ).toBeTruthy();
    });

    expect(queryByText("AI tóm tắt")).toBeNull();
  });

  it("hiển thị badge 'Quan trọng' khi is_important=true", async () => {
    const { getByText } = render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(getByText("Quan trọng")).toBeTruthy();
    });
  });

  it("ẩn badge 'Quan trọng' khi is_important=false", async () => {
    chain = createQueryChain(mockNotificationRead);
    chain.update.mockReturnValue(updateChain);
    mockFrom.mockReturnValue(chain);

    const { queryByText } = render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(
        queryByText(
          "Giá vàng SJC hôm nay tăng 500k so với hôm qua"
        )
      ).toBeTruthy();
    });

    expect(queryByText("Quan trọng")).toBeNull();
  });

  it("tự động mark is_read=true khi mở notification chưa đọc", async () => {
    render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("notifications");
    });

    // Notification is_read=false → phải gọi update
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledWith({ is_read: true });
    });

    // Sau update, phải filter theo id
    expect(updateChain.eq).toHaveBeenCalledWith("id", "notif-detail-1");
  });

  it("KHÔNG gọi update khi notification đã đọc", async () => {
    chain = createQueryChain(mockNotificationRead);
    mockFrom.mockReturnValue(chain);

    render(<NotificationDetailScreen />);

    await waitFor(() => {
      expect(chain.single).toHaveBeenCalled();
    });

    // is_read=true → không cần update
    expect(chain.update).not.toHaveBeenCalled();
  });

  it("lưu phản hồi Không liên quan cho đúng notification", async () => {
    const { getByText } = render(<NotificationDetailScreen />);

    await waitFor(() => expect(getByText("Không liên quan")).toBeTruthy());
    fireEvent.press(getByText("Không liên quan"));

    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
        feedback: "not_relevant",
        feedback_at: expect.any(String),
      }));
      expect(getByText("Đã ghi nhận phản hồi của bạn.")).toBeTruthy();
    });
    expect(updateChain.eq).toHaveBeenCalledWith("id", "notif-detail-1");
  });
});
