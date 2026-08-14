import pool from "@/lib/db";
import ActivityLog from "@/components/activity-log";
import { buildWeeklySummary } from "@/lib/weekly-summary";

// No login required — same access model as /dashboard/waitlist (see middleware.ts).
// This exists because deleted records' audit history isn't visible anywhere
// else once the record itself is gone from the inquiries table.

export type ActivityRow = {
  id: number;
  inquiryId: number;
  action: string;
  staffName: string;
  detail: string | null;
  createdAt: string;
  parentName: string | null; // null if the inquiry was deleted
  site: string | null;
};

// Re-exported so components/activity-log.tsx can keep importing it from here.
export type { WeekSummary } from "@/lib/weekly-summary";

async function loadActivity(): Promise<ActivityRow[]> {
  const rows = await pool.query<{
    id: number;
    inquiry_id: number;
    action: string;
    staff_name: string;
    detail: string | null;
    created_at: string;
    parent_first: string | null;
    parent_last: string | null;
    site: string | null;
  }>(
    `SELECT a.id, a.inquiry_id, a.action, a.staff_name, a.detail, a.created_at::text,
            i.parent_first, i.parent_last, i.site
     FROM inquiry_audit_log a
     LEFT JOIN inquiries i ON i.id = a.inquiry_id
     ORDER BY a.created_at DESC
     LIMIT 300`
  );
  return rows.rows.map((r) => ({
    id: r.id,
    inquiryId: r.inquiry_id,
    action: r.action,
    staffName: r.staff_name,
    detail: r.detail,
    createdAt: r.created_at,
    parentName: r.parent_first ? `${r.parent_first} ${r.parent_last ?? ""}`.trim() : null,
    site: r.site,
  }));
}

export default async function ActivityPage() {
  const [entries, weeklySummary] = await Promise.all([loadActivity(), buildWeeklySummary(8)]);
  return <ActivityLog entries={entries} weeklySummary={weeklySummary} />;
}
