import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { STAFF_BASE } from "@/lib/staff";
import type { StaffMember } from "@/lib/staff";
import { buildAttendanceDays } from "@/lib/attendance";
import type { AttendancePunch, AttendanceSchedule, DayClassification } from "@/lib/attendance";
import AttendanceManager from "@/components/attendance-manager";

async function loadAttendance() {
  const [dbStaff, lifecycle, employeeIds, imports, punches, schedules, classifications, unmatched] = await Promise.all([
    pool.query<{ id: string; name: string; site: string; hire_date: string | null; is_db_only: boolean }>(
      "SELECT id,name,site,hire_date::text,is_db_only FROM staff_members",
    ),
    pool.query<{ staff_id: string; is_active: boolean }>("SELECT staff_id,is_active FROM staff_lifecycle"),
    pool.query<{ staff_id: string; employee_id: string }>("SELECT staff_id,employee_id FROM staff_employee_ids"),
    pool.query<{ id: number; file_name: string; period_start: string; period_end: string; row_count: number; uploaded_at: string }>(
      `SELECT id,file_name,period_start::text,period_end::text,row_count,uploaded_at::text
       FROM attendance_imports ORDER BY uploaded_at DESC LIMIT 12`,
    ),
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
    pool.query<{ staff_id: string; work_date: string; classification: string; note: string }>(
      "SELECT staff_id,work_date::text,classification,note FROM attendance_day_classifications",
    ),
    pool.query<{ imported_name: string; site: string }>(
      `SELECT DISTINCT imported_name,site FROM attendance_punches WHERE staff_id IS NULL ORDER BY site,imported_name`,
    ),
  ]);

  const employeeIdMap = new Map(employeeIds.rows.map((row) => [row.staff_id, row.employee_id]));
  const overrides = new Map(dbStaff.rows.map((row) => [row.id, row]));
  const roster: StaffMember[] = STAFF_BASE.map((person) => {
    const row = overrides.get(person.id);
    return row ? { ...person, employeeId: employeeIdMap.get(person.id), name: row.name, site: row.site as StaffMember["site"], hireDate: row.hire_date ?? person.hireDate } : { ...person, employeeId: employeeIdMap.get(person.id) };
  });
  roster.push(...dbStaff.rows.filter((row) => row.is_db_only).map((row) => ({
    id: row.id, employeeId: employeeIdMap.get(row.id), name: row.name, site: row.site as StaffMember["site"], hireDate: row.hire_date ?? "",
  })));
  const inactive = new Set(lifecycle.rows.filter((row) => !row.is_active).map((row) => row.staff_id));
  const activeRoster = roster.filter((person) => !inactive.has(person.id));
  const mappedPunches: AttendancePunch[] = punches.rows.map((row) => ({
    id: row.id, importId: row.import_id, date: row.work_date, time: row.punch_time,
    status: row.punch_status, site: row.site, importedName: row.imported_name, staffId: row.staff_id,
  }));
  const mappedSchedules: AttendanceSchedule[] = schedules.rows.map((row) => ({
    id: row.id, staffId: row.staff_id, weekday: row.weekday, effectiveFrom: row.effective_from,
    start: row.scheduled_start, end: row.scheduled_end, isWorkday: row.is_workday,
  }));
  const mappedClassifications: DayClassification[] = classifications.rows.map((row) => ({
    staffId: row.staff_id, date: row.work_date, classification: row.classification, note: row.note,
  }));
  const latestImportId = imports.rows[0]?.id;
  const presentIds = new Set(mappedPunches.filter((p) => p.importId === latestImportId && p.staffId).map((p) => p.staffId));
  const latestSites = new Set(mappedPunches.filter((p) => p.importId === latestImportId).map((p) => p.site));
  const missing = activeRoster.filter((person) => latestSites.has(person.site) && !presentIds.has(person.id));

  return {
    roster: activeRoster,
    imports: imports.rows,
    punches: mappedPunches,
    schedules: mappedSchedules,
    days: buildAttendanceDays(activeRoster, mappedPunches, mappedSchedules, mappedClassifications, 5),
    unmatched: unmatched.rows,
    missing,
  };
}

export default async function AttendancePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.site !== "all") redirect("/dashboard");
  return <AttendanceManager {...await loadAttendance()} />;
}