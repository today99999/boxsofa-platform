export type OrderRequestJson =
  | { ok: true; value: unknown }
  | { ok: false };

export async function readOrderRequestJson(request: Request): Promise<OrderRequestJson> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}
