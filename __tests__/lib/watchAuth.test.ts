const mockRpc = jest.fn();

jest.mock("../../lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// Mock phải được khai báo trước module đang kiểm thử.
// eslint-disable-next-line import/first
import { setRuleWatchAuth } from "../../lib/watchAuth";

describe("setRuleWatchAuth", () => {
  beforeEach(() => jest.clearAllMocks());

  it("chỉ gửi credential đã trim qua RPC mã hóa", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    await expect(setRuleWatchAuth("rule-1", "  session=secret  ")).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("set_rule_watch_auth", {
      p_rule_id: "rule-1",
      p_auth: "session=secret",
    });
  });

  it("trả false khi rule không thuộc người dùng", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    await expect(setRuleWatchAuth("rule-khac", "secret")).resolves.toBe(false);
  });

  it("không che lỗi từ Supabase", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "vault unavailable" } });

    await expect(setRuleWatchAuth("rule-1", "secret")).rejects.toThrow("vault unavailable");
  });
});
