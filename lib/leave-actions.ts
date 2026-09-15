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

export async function getStaffLoginMode(employeeId: string) {
  const normalizedEmployeeId = employeeId.trim().toUpperCase();
  if (!normalizedEmployeeId) return { error: "Enter your Employee ID." };
  const result = await pool.query<{ has_pin: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM staff_leave_access access
       WHERE access.staff_id=ids.staff_id AND access.is_enabled=true
     ) AS has_pin
     FROM staff_employee_ids ids
     WHERE ids.employee_id=$1`,
    [normalizedEmployeeId],
  );
  if (!result.rows[0]) return { error: "Employee ID was not found." };
  return { mode: result.rows[0].has_pin ? "login" as const : "setup" as const };
}

export async function staffLeaveLogin(formData: FormData) {
  const employeeId = String(formData.get("staffId") ?? "").trim().toUpperCase();
  const pin = String(formData.get("pin") ?? "");
  const result = await pool.query<{ staff_id: string; pin_hash: string; is_enabled: boolean }>(
    `SELECT ids.staff_id,access.pin_hash,access.is_enabled
     FROM staff_employee_ids ids
     JOIN staff_leave_access access ON access.staff_id=ids.staff_id
     WHERE ids.employee_id=$1`,
    [employeeId],
  );
  const access = result.rows[0];
  if (!access?.is_enabled || !await bcrypt.compare(pin, access.pin_hash)) {
    return { error: "Employee ID or PIN is incorrect." };
  }
  setLeaveSession(access.staff_id);
  redirect("/leave");
}

export async function createStaffLeavePin(employeeId: string, pin: string, confirmation: string) {
  const normalizedEmployeeId = employeeId.trim().toUpperCase();
  if (!/^\d{4,8}$/.test(pin)) return { error: "PIN must contain 4–8 digits." };
  if (pin !== confirmation) return { error: "PINs do not match." };
  const hash = await bcrypt.hash(pin, 12);
  const result = await pool.query<{ staff_id: string }>(
    `INSERT INTO staff_leave_access(staff_id,pin_hash,is_enabled)
     SELECT staff_id,$2,true FROM staff_employee_ids WHERE employee_id=$1
     ON CONFLICT(staff_id) DO NOTHING
     RETURNING staff_id`,
    [normalizedEmployeeId, hash],
  );
  const staffId = result.rows[0]?.staff_id;
  if (!staffId) return { error: "A PIN has already been created for this Employee ID. Return to sign in." };
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

export async function saveStaffPortalAccess(staffId: string, employeeId: string, pin: string) {
  await requireDirector();
  if (!await validStaff(staffId)) throw new Error("Employee was not found.");
  const normalizedEmployeeId = employeeId.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(normalizedEmployeeId)) {
    throw new Error("Employee ID must be 3–20 letters, numbers, or hyphens.");
  }
  if (pin && !/^\d{4,8}$/.test(pin)) throw new Error("PIN must contain 4–8 digits.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO staff_employee_ids(staff_id,employee_id) VALUES($1,$2)
       ON CONFLICT(staff_id) DO UPDATE SET employee_id=$2,updated_at=NOW()`,
      [staffId, normalizedEmployeeId],
    );
    if (pin) {
      const hash = await bcrypt.hash(pin, 12);
      await client.query(
        `INSERT INTO staff_leave_access(staff_id,pin_hash,is_enabled)
         VALUES($1,$2,true)
         ON CONFLICT(staff_id) DO UPDATE SET pin_hash=$2,is_enabled=true,updated_at=NOW()`,
        [staffId, hash],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof Error && "code" in error && error.code === "23505") {
      throw new Error("That Employee ID is already assigned to another employee.");
    }
    throw error;
  } finally {
    client.release();
  }
  revalidatePath("/dashboard/leave");
  revalidatePath("/dashboard/attendance");
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