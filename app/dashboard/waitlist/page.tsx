import pool from "@/lib/db";
import { mapInquiryRow, type InquiryRow, type AuditLogEntry } from "@/lib/inquiries";
import WaitlistTracker from "@/components/waitlist-tracker";

// No login required for this dashboard — intentionally open (see middleware.ts).
// Sensitive actions (delete, send thank-you text) require a staff action-code
// instead, and are recorded in inquiry_audit_log — see lib/actions.ts.

async function loadInquiries() {
  const [rows, auditRows] = await Promise.all([
    pool.query<InquiryRow>(
      `SELECT id, site, created_at::text,
              parent_first, parent_last, phone, email,
              child1_first, child1_last, child1_birthday::text, child1_date_needed::text,
              child2_first, child2_last, child2_birthday::text, child2_date_needed::text,
              tour_time::text, tour_completed, tour_completed_at::text,
              thank_you_sent, thank_you_sent_at::text, thank_you_error,
              enrolled, start_date::text, registration_type, assigned_classroom,
              paperwork_returned_date::text, teacher_notified, registration_paid, notes,
              flagged, flag_reason, ccs_approved
       FROM inquiries
       ORDER BY created_at DESC`
    ),
    pool.query<{ inquiry_id: number; action: string; staff_name: string; detail: string | null; created_at: string }>(
      `SELECT inquiry_id, action, staff_name, detail, created_at::text
       FROM inquiry_audit_log
       ORDER BY created_at DESC`
    ),
  ]);

  const auditByInquiry = new Map<number, AuditLogEntry[]>();
  for (const a of auditRows.rows) {
    const list = auditByInquiry.get(a.inquiry_id) ?? [];
    list.push({ action: a.action, staffName: a.staff_name, detail: a.detail, createdAt: a.created_at });
    auditByInquiry.set(a.inquiry_id, list);
  }

  return rows.rows.map((r) => mapInquiryRow(r, auditByInquiry.get(r.id) ?? []));
}

export default async function WaitlistPage() {
  const inquiries = await loadInquiries();
  return <WaitlistTracker inquiries={inquiries} sessionSite="all" />;
}
