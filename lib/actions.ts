"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import pool from "./db";
import { authOptions } from "./auth";
import type { SiteFilter } from "./staff";
import { STAFF_BASE } from "./staff";
import { siteFromSlug } from "./inquiries";
import { sendSms, thankYouMessage } from "./sms";
import { staffNameForCode } from "./staff-codes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSite(session: any): SiteFilter | null {
  return session?.user?.site ?? null;
}

async function canAccessStaff(staffId: string, site: SiteFilter | null) {
  if (!site) return false;
  if (site === "all") return true;
  const base = STAFF_BASE.find((s) => s.id === staffId);
  if (base) return base.site === site;
  // DB-only employee — check staff_members table
  const r = await pool.query<{ site: string }>("SELECT site FROM staff_members WHERE id = $1", [staffId]);
  return r.rows[0]?.site === site;
}

export async function saveCredential(
  staffId: string,
  credType: string,
  issued: string | null,
  expires: string
) {
  const session = await getServerSession(authOptions);
  const site = getSite(session);
  if (!await canAccessStaff(staffId, site)) throw new Error("Unauthorized");

  await pool.query(
    `INSERT INTO staff_credentials (staff_id, cred_type, issued_date, expires_date)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (staff_id, cred_type) DO UPDATE
       SET issued_date = EXCLUDED.issued_date,
           expires_date = EXCLUDED.expires_date,
           updated_at = NOW()`,
    [staffId, credType, issued || null, expires]
  );
  revalidatePath("/dashboard");
}

export async function addTrainingEntry(
  staffId: string,
  date: string,
  title: string,
  hours: number,
  topic: string
) {
  const session = await getServerSession(authOptions);
  const site = getSite(session);
  if (!await canAccessStaff(staffId, site)) throw new Error("Unauthorized");

  await pool.query(
    `INSERT INTO training_entries (staff_id, entry_date, title, hours, topic)
     VALUES ($1, $2, $3, $4, $5)`,
    [staffId, date, title || "", hours, topic]
  );
  revalidatePath("/dashboard");
}

export async function setStaffRole(staffId: string, role: string) {
  const session = await getServerSession(authOptions);
  const site = getSite(session);
  if (!await canAccessStaff(staffId, site)) throw new Error("Unauthorized");

  await pool.query(
    `INSERT INTO staff_roles (staff_id, role)
     VALUES ($1, $2)
     ON CONFLICT (staff_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
    [staffId, role]
  );
  revalidatePath("/dashboard");
}

export async function addEmployee(
  name: string,
  site: string,
  hireDate: string | null,
  role: string
) {
  const session = await getServerSession(authOptions);
  const userSite = getSite(session);
  if (!userSite) throw new Error("Unauthorized");
  // Site-restricted users can only add to their own site
  if (userSite !== "all" && site !== userSite) throw new Error("Unauthorized");

  const id = `DB_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    `INSERT INTO staff_members (id, name, site, hire_date, is_db_only) VALUES ($1, $2, $3, $4, true)`,
    [id, name.trim(), site, hireDate || null]
  );
  if (role && role !== "Caregiver") {
    await pool.query(
      `INSERT INTO staff_roles (staff_id, role) VALUES ($1, $2) ON CONFLICT (staff_id) DO UPDATE SET role = EXCLUDED.role`,
      [id, role]
    );
  }
  revalidatePath("/dashboard");
}

export async function updateEmployee(
  staffId: string,
  name: string,
  site: string,
  hireDate: string | null,
  isDbOnly: boolean
) {
  const session = await getServerSession(authOptions);
  const userSite = getSite(session);
  if (userSite !== "all") throw new Error("Unauthorized");

  await pool.query(
    `INSERT INTO staff_members (id, name, site, hire_date, is_db_only)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, site = EXCLUDED.site, hire_date = EXCLUDED.hire_date, updated_at = NOW()`,
    [staffId, name.trim(), site, hireDate || null, isDbOnly]
  );
  revalidatePath("/dashboard");
}

export async function deleteTrainingEntry(entryId: number, staffId: string) {
  const session = await getServerSession(authOptions);
  const site = getSite(session);
  if (!await canAccessStaff(staffId, site)) throw new Error("Unauthorized");

  await pool.query("DELETE FROM training_entries WHERE id = $1 AND staff_id = $2", [entryId, staffId]);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/print/${staffId}`);
}

export async function setLifecycle(
  staffId: string,
  isActive: boolean,
  leavingDate: string | null
) {
  const session = await getServerSession(authOptions);
  const site = getSite(session);
  if (!await canAccessStaff(staffId, site)) throw new Error("Unauthorized");

  await pool.query(
    `INSERT INTO staff_lifecycle (staff_id, is_active, leaving_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (staff_id) DO UPDATE
       SET is_active = EXCLUDED.is_active, leaving_date = EXCLUDED.leaving_date, updated_at = NOW()`,
    [staffId, isActive, leavingDate || null]
  );
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/print/${staffId}`);
}

export async function setDriverInfo(
  staffId: string,
  isDriver: boolean,
  dlNumber: string | null,
  dlExpires: string | null,
  transportTrainingDate: string | null
) {
  const session = await getServerSession(authOptions);
  const site = getSite(session);
  if (!await canAccessStaff(staffId, site)) throw new Error("Unauthorized");

  await pool.query(
    `INSERT INTO staff_driver_info (staff_id, is_driver, dl_number, dl_expires, transport_training_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (staff_id) DO UPDATE
       SET is_driver = EXCLUDED.is_driver,
           dl_number = EXCLUDED.dl_number,
           dl_expires = EXCLUDED.dl_expires,
           transport_training_date = EXCLUDED.transport_training_date,
           updated_at = NOW()`,
    [staffId, isDriver, dlNumber || null, dlExpires || null, transportTrainingDate || null]
  );
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/print/${staffId}`);
}

// ---------------------------------------------------------------------------
// Waitlist / parent inquiries
// ---------------------------------------------------------------------------

export type InquirySubmission = {
  parentFirst: string;
  parentLast: string;
  phone: string;
  email: string;
  child1First: string;
  child1Last: string;
  child1Birthday: string;
  child1DateNeeded: string;
  child2First: string;
  child2Last: string;
  child2Birthday: string;
  child2DateNeeded: string;
  agreedToTerms: boolean;
};

// Public — called from the no-auth /inquiry/[site] parent-facing form.
export async function submitInquiry(siteSlug: string, data: InquirySubmission) {
  const site = siteFromSlug(siteSlug);
  if (!site) throw new Error("Unknown site");
  if (!data.parentFirst?.trim() || !data.parentLast?.trim() || !data.phone?.trim()) {
    throw new Error("Missing required fields");
  }
  if (!data.agreedToTerms) {
    throw new Error("Please check the box confirming you've read the notice above.");
  }

  await pool.query(
    `INSERT INTO inquiries
       (site, parent_first, parent_last, phone, email,
        child1_first, child1_last, child1_birthday, child1_date_needed,
        child2_first, child2_last, child2_birthday, child2_date_needed,
        terms_agreed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
    [
      site,
      data.parentFirst.trim(),
      data.parentLast.trim(),
      data.phone.trim(),
      data.email?.trim() || null,
      data.child1First?.trim() || null,
      data.child1Last?.trim() || null,
      data.child1Birthday || null,
      data.child1DateNeeded || null,
      data.child2First?.trim() || null,
      data.child2Last?.trim() || null,
      data.child2Birthday || null,
      data.child2DateNeeded || null,
    ]
  );
  revalidatePath("/dashboard/waitlist");
}

// The waitlist dashboard (/dashboard/waitlist) has no login — see middleware.ts.
// These helpers just look up the inquiry; there's no session to scope access to.
async function getInquirySite(inquiryId: number) {
  const r = await pool.query<{ site: string }>("SELECT site FROM inquiries WHERE id = $1", [inquiryId]);
  const site = r.rows[0]?.site;
  if (!site) throw new Error("Inquiry not found");
  return site;
}

// Sensitive actions (delete, send thank-you text) require a staff action
// code so we know who did it — see lib/staff-codes.ts.
function requireStaffCode(code: string): string {
  const name = staffNameForCode(code);
  if (!name) throw new Error("Invalid staff code.");
  return name;
}

async function logInquiryAction(inquiryId: number, action: string, staffName: string, detail?: string) {
  await pool.query(
    "INSERT INTO inquiry_audit_log (inquiry_id, action, staff_name, detail) VALUES ($1, $2, $3, $4)",
    [inquiryId, action, staffName, detail ?? null]
  );
}

// Whitelisted simple-value columns editable from the dashboard table.
// Note: "flagged"/"flag_reason" are NOT in these whitelists — flagging a
// family requires a staff action-code, so it goes through setFlag() below
// instead of the generic no-code field editor.
const INQUIRY_TEXT_FIELDS = new Set([
  "registration_type",
  "assigned_classroom",
  "notes",
]);
const INQUIRY_DATE_FIELDS = new Set(["start_date", "paperwork_returned_date"]);
const INQUIRY_BOOL_FIELDS = new Set([
  "enrolled",
  "teacher_notified",
  "registration_paid",
  "ccs_approved",
]);

export async function updateInquiryField(
  inquiryId: number,
  field: string,
  value: string | boolean | null
) {
  await getInquirySite(inquiryId);

  if (INQUIRY_BOOL_FIELDS.has(field)) {
    await pool.query(`UPDATE inquiries SET ${field} = $1, updated_at = NOW() WHERE id = $2`, [!!value, inquiryId]);
  } else if (INQUIRY_DATE_FIELDS.has(field)) {
    await pool.query(`UPDATE inquiries SET ${field} = $1, updated_at = NOW() WHERE id = $2`, [value || null, inquiryId]);
  } else if (INQUIRY_TEXT_FIELDS.has(field)) {
    await pool.query(`UPDATE inquiries SET ${field} = $1, updated_at = NOW() WHERE id = $2`, [
      (value as string) || null,
      inquiryId,
    ]);
  } else {
    throw new Error(`Field not editable: ${field}`);
  }
  revalidatePath("/dashboard/waitlist");
}

// Flag (or unflag) a family as do-not-enroll. Requires a valid staff
// action-code, and is always recorded in the audit log — including the
// reason — so there's a record of who flagged/unflagged and why.
export async function setFlag(inquiryId: number, flagged: boolean, reason: string | null, code: string) {
  const staffName = requireStaffCode(code);
  await getInquirySite(inquiryId);

  await pool.query(
    "UPDATE inquiries SET flagged = $1, flag_reason = $2, updated_at = NOW() WHERE id = $3",
    [flagged, reason || null, inquiryId]
  );

  await logInquiryAction(inquiryId, flagged ? "flag" : "unflag", staffName, reason || undefined);

  revalidatePath("/dashboard/waitlist");
}

// Staff marks the tour as done → fires the automated thank-you text.
// Requires a valid staff action-code (see lib/staff-codes.ts) — logged either way.
export async function markTourCompleted(inquiryId: number, code: string) {
  const staffName = requireStaffCode(code);
  const site = await getInquirySite(inquiryId);

  const r = await pool.query<{ parent_first: string; phone: string; child1_first: string | null; child2_first: string | null }>(
    "SELECT parent_first, phone, child1_first, child2_first FROM inquiries WHERE id = $1",
    [inquiryId]
  );
  const row = r.rows[0];
  if (!row) throw new Error("Inquiry not found");

  await pool.query(
    "UPDATE inquiries SET tour_completed = true, tour_completed_at = NOW(), updated_at = NOW() WHERE id = $1",
    [inquiryId]
  );

  const message = thankYouMessage({ parentFirst: row.parent_first, childFirst: row.child1_first, child2First: row.child2_first, site });
  const result = await sendSms(row.phone, message);

  if (result.ok) {
    await pool.query(
      "UPDATE inquiries SET thank_you_sent = true, thank_you_sent_at = NOW(), thank_you_error = NULL WHERE id = $1",
      [inquiryId]
    );
  } else {
    await pool.query("UPDATE inquiries SET thank_you_error = $1 WHERE id = $2", [result.error, inquiryId]);
  }

  await logInquiryAction(
    inquiryId,
    "mark_tour_complete",
    staffName,
    result.ok ? "Thank-you text sent" : `Thank-you text failed: ${result.error}`
  );

  revalidatePath("/dashboard/waitlist");
  return result;
}

// Manual resend if the first attempt failed (e.g. VoIP.ms wasn't configured yet).
// Requires a valid staff action-code — logged either way.
export async function resendThankYou(inquiryId: number, code: string) {
  const staffName = requireStaffCode(code);
  const site = await getInquirySite(inquiryId);

  const r = await pool.query<{ parent_first: string; phone: string; child1_first: string | null; child2_first: string | null }>(
    "SELECT parent_first, phone, child1_first, child2_first FROM inquiries WHERE id = $1",
    [inquiryId]
  );
  const row = r.rows[0];
  if (!row) throw new Error("Inquiry not found");

  const message = thankYouMessage({ parentFirst: row.parent_first, childFirst: row.child1_first, child2First: row.child2_first, site });
  const result = await sendSms(row.phone, message);

  if (result.ok) {
    await pool.query(
      "UPDATE inquiries SET thank_you_sent = true, thank_you_sent_at = NOW(), thank_you_error = NULL WHERE id = $1",
      [inquiryId]
    );
  } else {
    await pool.query("UPDATE inquiries SET thank_you_error = $1 WHERE id = $2", [result.error, inquiryId]);
  }

  await logInquiryAction(
    inquiryId,
    "resend_thank_you",
    staffName,
    result.ok ? "Thank-you text sent" : `Thank-you text failed: ${result.error}`
  );

  revalidatePath("/dashboard/waitlist");
  return result;
}

// Requires a valid staff action-code — logged before the row is removed.
export async function deleteInquiry(inquiryId: number, code: string) {
  const staffName = requireStaffCode(code);
  await getInquirySite(inquiryId);
  await logInquiryAction(inquiryId, "delete", staffName);
  await pool.query("DELETE FROM inquiries WHERE id = $1", [inquiryId]);
  revalidatePath("/dashboard/waitlist");
}
