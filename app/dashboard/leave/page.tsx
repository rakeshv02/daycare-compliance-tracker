import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { loadMergedRoster } from "@/lib/roster";
import type { LeaveRequest } from "@/lib/leave";
import LeaveAdminManager from "@/components/leave-admin-manager";

export default async function LeaveAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.site !== "all") redirect("/dashboard");
  const roster = await loadMergedRoster();
  const [requests, access, employeeIds] = await Promise.all([
    pool.query<{
      id: number; staff_id: string; leave_type: string; date_from: string; date_to: string;
      reason: string; status: string; director_note: string; created_at: string; decided_at: string | null;
    }>(`SELECT id,staff_id,leave_type,date_from::text,date_to::text,reason,status,director_note,
        created_at::text,decided_at::text FROM staff_leave_requests ORDER BY
        CASE status WHEN 'Pending' THEN 0 ELSE 1 END, created_at DESC`),
    pool.query<{ staff_id: string; is_enabled: boolean }>("SELECT staff_id,is_enabled FROM staff_leave_access"),
    pool.query<{ staff_id: string; employee_id: string }>("SELECT staff_id,employee_id FROM staff_employee_ids"),
  ]);
  const rosterMap = new Map(roster.map((person) => [person.id, person]));
  const mapped: LeaveRequest[] = requests.rows.flatMap((row) => {
    const person = rosterMap.get(row.staff_id);
    if (!person) return [];
    return [{
      id: row.id, staffId: row.staff_id, staffName: person.name, site: person.site,
      leaveType: row.leave_type, dateFrom: row.date_from, dateTo: row.date_to,
      reason: row.reason, status: row.status, directorNote: row.director_note,
      createdAt: row.created_at, decidedAt: row.decided_at,
    }];
  });
  return <LeaveAdminManager
    roster={roster}
    requests={mapped}
    enabledStaffIds={access.rows.filter((row) => row.is_enabled).map((row) => row.staff_id)}
    employeeIds={Object.fromEntries(employeeIds.rows.map((row) => [row.staff_id, row.employee_id]))}
  />;
}