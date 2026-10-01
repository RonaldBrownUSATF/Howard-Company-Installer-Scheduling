import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
export const invalid = (err: ZodError) => fail(err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
