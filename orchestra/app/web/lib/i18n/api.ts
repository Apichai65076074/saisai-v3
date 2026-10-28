import { NextResponse } from "next/server";
import { getLang, getSession } from "../auth";
import { ShopError } from "../server/orders";
import { errorMessage } from "./index";
export async function customer() {
  const s = await getSession();
  if (!s) throw new ShopError(401, [{ code: "UNAUTHORIZED" }]);
  if (s.role !== "customer" || s.companyId === null)
    throw new ShopError(403, [{ code: "FORBIDDEN" }]);
  return { ...s, companyId: s.companyId };
}
export async function api(work: () => Promise<unknown>, status = 200) {
  try {
    return NextResponse.json(await work(), { status });
  } catch (e) {
    const lang = await getLang();
    const problem =
      e instanceof ShopError
        ? e
        : new ShopError(500, [{ code: "SERVER_ERROR" }]);
    return NextResponse.json(
      {
        ok: false,
        errors: problem.errors.map((e) => ({
          ...e,
          message: errorMessage(lang, e.code, e.params),
        })),
        ...(problem.existing ? { existing: problem.existing } : {}),
      },
      { status: problem.status },
    );
  }
}
