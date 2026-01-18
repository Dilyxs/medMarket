import { SignJWT, jwtVerify } from "jose";

export interface SessionUser {
  userId: string;
  email: string;
  name?: string | null;
}

const cookieName = "medmarket_session";
const maxAgeSeconds = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Missing JWT secret. Set JWT_SECRET or SESSION_SECRET in env.");
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify<{ user: SessionUser }>(token, secret);
    return payload.user;
  } catch {
    return null;
  }
}

function parseCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const parts = cookie.split(";");
  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === name && v) return decodeURIComponent(v);
  }
  return null;
}

export async function getUserFromRequest(req: Request): Promise<SessionUser | null> {
  const token = parseCookie(req, cookieName);
  if (!token) return null;
  return verifySession(token);
}

export function createSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production";
  const attributes = [
    `${cookieName}=${encodeURIComponent(token)}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
  ].filter(Boolean);
  return attributes.join("; ");
}

export function clearSessionCookie(): string {
  const attributes = [
    `${cookieName}=; Max-Age=0`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : null,
  ].filter(Boolean);
  return attributes.join("; ");
}
