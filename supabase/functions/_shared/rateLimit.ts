// Rate limit dùng chung cho Edge Functions. RPC thực hiện tăng bộ đếm nguyên tử;
// nếu migration/bảng lỗi thì fail closed để endpoint tốn quota không bị mở vô hạn.

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  currentCount: number;
}

// deno-lint-ignore no-explicit-any
export async function consumeRateLimit(
  supabase: any,
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("consume_edge_rate_limit", {
    p_bucket: bucket,
    p_subject: subject,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Rate limit RPC failed:", error.message);
    throw new Error("Không thể kiểm tra giới hạn sử dụng. Vui lòng thử lại sau.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Bộ giới hạn sử dụng trả dữ liệu không hợp lệ.");
  }
  return {
    allowed: row.allowed,
    retryAfterSeconds: Number(row.retry_after_seconds ?? 1),
    currentCount: Number(row.current_count ?? 0),
  };
}

// Áp đồng thời giới hạn ngắn hạn và theo ngày. Mỗi bucket tách riêng theo tác vụ.
// deno-lint-ignore no-explicit-any
export async function enforceRateLimits(
  supabase: any,
  subject: string,
  bucket: string,
  short: { limit: number; seconds: number },
  dailyLimit: number,
): Promise<RateLimitResult> {
  const shortResult = await consumeRateLimit(supabase, `${bucket}:short`, subject, short.limit, short.seconds);
  if (!shortResult.allowed) return shortResult;
  return await consumeRateLimit(supabase, `${bucket}:day`, subject, dailyLimit, 86400);
}
