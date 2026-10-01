import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return fail("ADMIN_PASSWORD is not set on the server.", 500);

  const body = (await readJson(req)) as { password?: unknown } | null;
  const given = typeof body?.password === "string" ? body.password : "";
  if (!timingSafeEqual(digest(given), digest(expected))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return fail("That password is incorrect.", 401);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
