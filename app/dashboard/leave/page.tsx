import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { loadMergedRoster } from "@/lib/roster";
import type { LeaveRequest } from "@/lib/leave";
import { buildAttendanceDays, isIgnoredAttendanceName } from "@/lib/attendance";
import type { AttendancePunch, AttendanceSchedule, AttendanceScheduleOverride, DayClassification } from "@/lib/attendance";
import LeaveAdminManager from "@/components/leave-admin-manager";

export default async function LeaveAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.site !== "all") redirect("/dashboard");
  const roster = await loadMergedRoster();
  const [requests, access, employeeIds, punches, schedules, scheduleOverrides, classifications] = await Promise.all([
    pool.query<{
      id: number; staff_id: string; leave_type: string; is_paid_vacation: boolean; date_from: string; date_to: string;
      reason: string; status: string; director_note: string; created_at: string; decided_at: string | null;
    }>(`SELECT id,staff_id,leave_type,is_paid_vacation,date_from::text,date_to::text,reason,status,director_note,
        created_at::text,decided_at::text FROM staff_leave_requests ORDER BY
        CASE status WHEN 'Pending' THEN 0 ELSE 1 END, created_at DESC`),
    pool.query<{ staff_id: string; is_enabled: boolean }>("SELECT staff_id,is_enabled FROM staff_leave_access"),
    pool.query<{ staff_id: string; employee_id: string }>("SELECT staff_id,employee_id FROM staff_employee_ids"),
    pool.query<{
      id: number; import_id: number; work_date: string; punch_time: string; punch_status: "In" | "Out";
      site: string; imported_name: string; staff_id: string | null;
    }>(`SELECT id,import_id,work_date::text,punch_time::text,punch_status,site,imported_name,staff_id
        FROM attendance_punches ORDER BY work_date DESC,punch_time`),
    pool.query<{
      id: number; staff_id: string; weekday: number; effective_from: string;
      scheduled_start: string | null; scheduled_end: string | null; is_workday: boolean;
    }>(`SELECT id,staff_id,weekday,effective_from::text,scheduled_start::text,scheduled_end::text,is_workday
        FROM attendance_schedules`),
    pool.query<{
      id: number; staff_id: string; work_date: string; scheduled_start: string | null;
      scheduled_end: string | null; is_workday: boolean; note: string;
    }>(`SELECT id,staff_id,work_date::text,scheduled_start::text,scheduled_end::text,is_workday,note
        FROM attendance_schedule_overrides ORDER BY work_date`),
    pool.query<{ staff_id: string; work_date: string; classification: string; note: string }>(
      "SELECT staff_id,work_date::text,classification,note FROM attendance_day_classifications",
    ),
  ]);
  const rosterMap = new Map(roster.map((person) => [person.id, person]));
  const mapped: LeaveRequest[] = requests.rows.flatMap((row) => {
    const person = rosterMap.get(row.staff_id);
    if (!person) return [];
    return [{
      id: row.id, staffId: row.staff_id, staffName: person.name, site: person.site,
      leaveType: row.leave_type, isPaidVacation: row.is_paid_vacation || row.leave_type === "Paid vacation", dateFrom: row.date_from, dateTo: row.date_to,
      reason: row.reason, status: row.status, directorNote: row.director_note,
      createdAt: row.created_at, decidedAt: row.decided_at,
    }];
  });
  const mappedPunches: AttendancePunch[] = punches.rows.filter((row) => !isIgnoredAttendanceName(row.imported_name)).map((row) => ({
    id: row.id, importId: row.import_id, date: row.work_date, time: row.punch_time,
    status: row.punch_status, site: row.site, importedName: row.imported_name, staffId: row.staff_id,
  }));
  const mappedSchedules: AttendanceSchedule[] = schedules.rows.map((row) => ({
    id: row.id, staffId: row.staff_id, weekday: row.weekday, effectiveFrom: row.effective_from,
    start: row.scheduled_start, end: row.scheduled_end, isWorkday: row.is_workday,
  }));
  const mappedOverrides: AttendanceScheduleOverride[] = scheduleOverrides.rows.map((row) => ({
    id: row.id, staffId: row.staff_id, date: row.work_date, start: row.scheduled_start,
    end: row.scheduled_end, isWorkday: row.is_workday, note: row.note,
  }));
  const mappedClassifications: DayClassification[] = classifications.rows.map((row) => ({
    staffId: row.staff_id, date: row.work_date, classification: row.classification, note: row.note,
  }));
  return <LeaveAdminManager
    roster={roster}
    requests={mapped}
    attendanceDays={buildAttendanceDays(roster, mappedPunches, mappedSchedules, mappedClassifications, 5, mappedOverrides)}
    schedules={mappedSchedules}
    scheduleOverrides={mappedOverrides}
    enabledStaffIds={access.rows.filter((row) => row.is_enabled).map((row) => row.staff_id)}
    employeeIds={Object.fromEntries(employeeIds.rows.map((row) => [row.staff_id, row.employee_id]))}
  />;
}