import { createQueryChain } from "../helpers/supabase-mock";

const mockFrom = jest.fn();

jest.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { countNotificationsFor, fetchNotificationsFor } from "../../lib/notifQuery";

describe("notifQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("phân trang bằng range chính xác", async () => {
    const chain = createQueryChain([{ id: "n-51" }]);
    mockFrom.mockReturnValue(chain);

    await fetchNotificationsFor("user-1", { limit: 50, offset: 50 });

    expect(chain.range).toHaveBeenCalledWith(50, 99);
  });

  it("không che lỗi mạng bằng fallback schema cũ", async () => {
    const chain = createQueryChain([], { code: "PGRST000", message: "network unavailable" });
    mockFrom.mockReturnValue(chain);

    await expect(fetchNotificationsFor("user-1")).rejects.toThrow("network unavailable");
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("chỉ fallback qua rule_id khi schema cũ thiếu user_id", async () => {
    const direct = createQueryChain([], {
      code: "42703",
      message: 'column notifications.user_id does not exist',
    });
    const rules = createQueryChain([{ id: "rule-1" }]);
    const legacy = createQueryChain([{ id: "legacy-1", rule_id: "rule-1" }]);
    let notificationCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "rules") return rules;
      notificationCalls += 1;
      return notificationCalls === 1 ? direct : legacy;
    });

    await expect(fetchNotificationsFor("user-1")).resolves.toEqual([
      expect.objectContaining({ id: "legacy-1" }),
    ]);
    expect(legacy.in).toHaveBeenCalledWith("rule_id", ["rule-1"]);
  });

  it("trả count chính xác từ query head", async () => {
    const chain = createQueryChain([{ id: "n1" }, { id: "n2" }]);
    mockFrom.mockReturnValue(chain);

    await expect(countNotificationsFor("user-1", { unreadOnly: true })).resolves.toBe(2);
    expect(chain.eq).toHaveBeenCalledWith("is_read", false);
  });
});
