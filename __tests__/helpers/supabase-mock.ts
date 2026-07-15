/**
 * Factory tạo mock chain cho Supabase query builder.
 * Chain vừa chainable (trả về chính nó) vừa thenable (có thể await).
 */
export const createQueryChain = (
  data: any = [],
  error: any = null
) => {
  const result = { data, error, count: Array.isArray(data) ? data.length : null };

  const chain: any = {
    select: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    range: jest.fn(),
    update: jest.fn(),
    filter: jest.fn(),
    single: jest
      .fn()
      .mockResolvedValue({
        data: Array.isArray(data) ? (data[0] ?? null) : data,
        error,
      }),
    insert: jest.fn().mockResolvedValue({ data: null, error }),
    delete: jest.fn().mockResolvedValue({ data: null, error }),
    // Thenable — để chain có thể await trực tiếp
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
    catch: (reject: any) => Promise.resolve(result).catch(reject),
    finally: (cb: any) => Promise.resolve(result).finally(cb),
  };

  // Tất cả chainable methods trả về chính chain
  [
    "select",
    "eq",
    "neq",
    "in",
    "order",
    "limit",
    "range",
    "update",
    "filter",
  ].forEach((method) => {
    chain[method].mockReturnValue(chain);
  });

  return chain;
};

/**
 * Mock supabase.from trả về các chain khác nhau theo tên bảng.
 * Dùng trong beforeEach để set up per-test data.
 */
export const setupSupabaseMock = (
  supabaseMock: any,
  tableData: Record<string, { data?: any; error?: any }>
) => {
  supabaseMock.from.mockImplementation((table: string) => {
    const config = tableData[table] ?? {};
    return createQueryChain(config.data ?? [], config.error ?? null);
  });
};

export const mockUser = {
  id: "user-test-123",
  email: "test@example.com",
};

export const mockSession = {
  user: mockUser,
  access_token: "fake-token",
};
