"use server";

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import pool from "./db";
import { authOptions } from "./auth";
import { clearLeaveSession, getLeaveStaffId, setLeaveSession } from "./leave-auth";
import { LEAVE_TYPES } from "./leave";
import { STAFF_BASE } from "./staff";

async function requireDirector() {
  const session = await getServerSession(authOptions);
  if (session?.user?.site !== "all") throw new Error("Only the director can manage leave requests.");
}

async function validStaff(staffId: string) {
  if (STAFF_BASE.some((person) => person.id === staffId)) return true;
  const result = await pool.query("SELECT 1 FROM staff_members WHERE id=$1", [staffId]);
  return result.rowCount === 1;
}

export async function staffLeaveLogin(formData: FormData) {
  const staffId = String(formData.get("staffId") ?? "").trim().toUpperCase();
  const pin = String(formData.get("pin") ?? "");
  const result = await pool.query<{ pin_hash: string; is_enabled: boolean }>(
    "SELECT pin_hash,is_enabled FROM staff_leave_access WHERE staff_id=$1",
    [staffId],
  );
  const access = result.rows[0];
  if (!access?.is_enabled || !await bcrypt.compare(pin, access.pin_hash)) {
    return { error: "Employee ID or PIN is incorrect." };
  }
  setLeaveSession(staffId);
  redirect("/leave");
}

export async function staffLeaveLogout() {
  clearLeaveSession();
  redirect("/leave/login");
}

export async function setStaffLeavePin(staffId: string, pin: string) {
  await requireDirector();
  if (!await validStaff(staffId)) throw new Error("Employee was not found.");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must contain 4–8 digits.");
  const hash = await bcrypt.hash(pin, 12);
  await pool.query(
    `INSERT INTO staff_leave_access(staff_id,pin_hash,is_enabled)
     VALUES($1,$2,true)
     ON CONFLICT(staff_id) DO UPDATE SET pin_hash=$2,is_enabled=true,updated_at=NOW()`,
    [staffId, hash],
  );
  revalidatePath("/dashboard/leave");
}

export async function submitLeaveRequest(formData: FormData) {
  const staffId = getLeaveStaffId();
  if (!staffId) redirect("/leave/login");
  const leaveType = String(formData.get("leaveType") ?? "");
  const dateFrom = String(formData.get("dateFrom") ?? "");
  const dateTo = String(formData.get("dateTo") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!LEAVE_TYPES.includes(leaveType as typeof LEAVE_TYPES[number])) throw new Error("Choose a valid leave type.");
  if (!dateFrom || !dateTo || dateFrom > dateTo) throw new Error("Choose a valid date range.");
  await pool.query(
    `INSERT INTO staff_leave_requests(staff_id,leave_type,date_from,date_to,reason)
     VALUES($1,$2,$3,$4,$5)`,
    [staffId, leaveType, dateFrom, dateTo, reason],
  );
  revalidatePath("/leave");
  revalidatePath("/dashboard/leave");
}

export async function cancelLeaveRequest(requestId: number) {
  const staffId = getLeaveStaffId();
  if (!staffId) redirect("/leave/login");
  await pool.query(
    `UPDATE staff_leave_requests SET status='Cancelled',updated_at=NOW()
     WHERE id=$1 AND staff_id=$2 AND status='Pending'`,
    [requestId, staffId],
  );
  revalidatePath("/leave");
  revalidatePath("/dashboard/leave");
}

export async function decideLeaveRequest(requestId: number, status: "Approved" | "Denied", directorNote: string) {
  await requireDirector();
  await pool.query(
    `UPDATE staff_leave_requests
     SET status=$2,director_note=$3,decided_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND status='Pending'`,
    [requestId, status, directorNote.trim()],
  );
  revalidatePath("/leave");
  revalidatePath("/dashboard/leave");
}