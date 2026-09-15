import { redirect } from "next/navigation";
import pool from "@/lib/db";
import { getLeaveStaffId } from "@/lib/leave-auth";
import { loadMergedRoster } from "@/lib/roster";
import { buildAttendanceDays } from "@/lib/attendance";
import type { AttendancePunch, AttendanceSchedule, DayClassification } from "@/lib/attendance";
import { leaveDaysInYear, personalAttendanceSummary } from "@/lib/leave";
import type { LeaveRequest } from "@/lib/leave";
import StaffLeavePortal from "@/components/staff-leave-portal";

export default async function StaffLeavePage() {
  const staffId = getLeaveStaffId();
  if (!staffId) redirect("/leave/login");
  const roster = await loadMergedRoster();
  const staff = roster.find((person) => person.id === staffId);
  if (!staff) redirect("/leave/login");

  const [requestRows, punchRows, scheduleRows, classificationRows] = await Promise.all([
    pool.query<{
      id: number; leave_type: string; date_from: string; date_to: string; reason: string;
      status: string; director_note: string; created_at: string; decided_at: string | null;
    }>(`SELECT id,leave_type,date_from::text,date_to::text,reason,status,director_note,
        created_at::text,decided_at::text FROM staff_leave_requests WHERE staff_id=$1 ORDER BY created_at DESC`, [staffId]),
    pool.query<{
      id: number; import_id: number; work_date: string; punch_time: string; punch_status: "In" | "Out";
      site: string; imported_name: string; staff_id: string | null;
    }>(`SELECT id,import_id,work_date::text,punch_time::text,punch_status,site,imported_name,staff_id
        FROM attendance_punches WHERE staff_id=$1 ORDER BY work_date,punch_time`, [staffId]),
    pool.query<{
      id: number; staff_id: string; weekday: number; effective_from: string;
      scheduled_start: string | null; scheduled_end: string | null; is_workday: boolean;
    }>(`SELECT id,staff_id,weekday,effective_from::text,scheduled_start::text,scheduled_end::text,is_workday
        FROM attendance_schedules WHERE staff_id=$1`, [staffId]),
    pool.query<{ staff_id: string; work_date: string; classification: string; note: string }>(
      "SELECT staff_id,work_date::text,classification,note FROM attendance_day_classifications WHERE staff_id=$1",
      [staffId],
    ),
  ]);
  const requests: LeaveRequest[] = requestRows.rows.map((row) => ({
    id: row.id, staffId, staffName: staff.name, site: staff.site, leaveType: row.leave_type,
    dateFrom: row.date_from, dateTo: row.date_to, reason: row.reason, status: row.status,
    directorNote: row.director_note, createdAt: row.created_at, decidedAt: row.decided_at,
  }));
  const punches: AttendancePunch[] = punchRows.rows.map((row) => ({
    id: row.id, importId: row.import_id, date: row.work_date, time: row.punch_time,
    status: row.punch_status, site: row.site, importedName: row.imported_name, staffId: row.staff_id,
  }));
  const schedules: AttendanceSchedule[] = scheduleRows.rows.map((row) => ({
    id: row.id, staffId: row.staff_id, weekday: row.weekday, effectiveFrom: row.effective_from,
    start: row.scheduled_start, end: row.scheduled_end, isWorkday: row.is_workday,
  }));
  const classifications: DayClassification[] = classificationRows.rows.map((row) => ({
    staffId: row.staff_id, date: row.work_date, classification: row.classification, note: row.note,
  }));
  const attendanceDays = buildAttendanceDays([staff], punches, schedules, classifications, 5);
  const years = Array.from(new Set([2026, new Date().getFullYear(), ...requests.flatMap((r) => [Number(r.dateFrom.slice(0,4)), Number(r.dateTo.slice(0,4))])])).sort((a,b) => b-a);
  const summaries = years.map((year) => {
    const attendance = personalAttendanceSummary(staffId, year, attendanceDays, schedules, requests);
    return {
      year,
      approvedDaysTaken: requests.reduce((sum, request) => sum + leaveDaysInYear(request, year, true), 0),
      paidVacationTaken: requests.filter((r) => r.leaveType === "Paid vacation").reduce((sum, request) => sum + leaveDaysInYear(request, year, true), 0),
      pendingDays: requests.filter((r) => r.status === "Pending").reduce((sum, request) => sum + (request.dateFrom.slice(0,4) <= String(year) && request.dateTo.slice(0,4) >= String(year) ? leaveDaysInYear({ ...request, status: "Approved" }, year, false) : 0), 0),
      ...attendance,
    };
  });
  return <StaffLeavePortal staff={staff} requests={requests} summaries={summaries} />;
}