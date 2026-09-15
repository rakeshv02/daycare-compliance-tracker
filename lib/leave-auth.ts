import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "staff_leave_session";

function secret() {
  const value = process.env.COMPLIANCE_NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("Leave portal session secret is not configured.");
  return value;
}

function signature(staffId: string) {
  return crypto.createHmac("sha256", secret()).update(staffId).digest("hex");
}

export function setLeaveSession(staffId: string) {
  cookies().set(COOKIE_NAME, `${staffId}.${signature(staffId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export function clearLeaveSession() {
  cookies().delete(COOKIE_NAME);
}

export function getLeaveStaffId() {
  const value = cookies().get(COOKIE_NAME)?.value;
  if (!value) return null;
  const splitAt = value.lastIndexOf(".");
  if (splitAt < 1) return null;
  const staffId = value.slice(0, splitAt);
  const supplied = value.slice(splitAt + 1);
  const expected = signature(staffId);
  if (supplied.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) ? staffId : null;
}