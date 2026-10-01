import { SignJWT, jwtVerify } from "jose";

// Edge-safe: imported by middleware, so no Node-only APIs here.
export const SESSION_COOKIE = "sched_admin";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(s);
}

export async function createSession() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined) {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
