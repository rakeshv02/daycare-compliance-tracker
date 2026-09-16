import { attendanceScheduleForDate } from "./attendance";
import type { AttendanceDay, AttendanceSchedule, AttendanceScheduleOverride } from "./attendance";

export const LEAVE_TYPES = ["Vacation", "Medical", "Unpaid leave", "Sick", "Bereavement", "Other"] as const;
export const LEAVE_STATUSES = ["Pending", "Approved", "Denied", "Cancelled"] as const;

export type LeaveRequest = {
  id: number;
  staffId: string;
  staffName: string;
  site: string;
  leaveType: string;
  isPaidVacation: boolean;
  dateFrom: string;
  dateTo: string;
  reason: string;
  status: string;
  directorNote: string;
  createdAt: string;
  decidedAt: string | null;
};

export function weekdaysInclusive(from: string, to: string) {
  let count = 0;
  const date = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (date <= end) {
    if (date.getDay() > 0 && date.getDay() < 6) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

export function leaveDaysInYear(request: LeaveRequest, year: number, throughToday = false) {
  if (request.status !== "Approved") return 0;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const today = new Date().toISOString().slice(0, 10);
  const from = request.dateFrom > yearStart ? request.dateFrom : yearStart;
  let to = request.dateTo < yearEnd ? request.dateTo : yearEnd;
  if (throughToday && to > today) to = today;
  return from <= to ? weekdaysInclusive(from, to) : 0;
}

export function personalAttendanceSummary(
  staffId: string,
  year: number,
  attendanceDays: AttendanceDay[],
  schedules: AttendanceSchedule[],
  leaveRequests: LeaveRequest[],
  overrides: AttendanceScheduleOverride[] = [],
) {
  const start = year === 2026 ? "2026-08-01" : `${year}-01-01`;
  const latestUploadedDate = attendanceDays.reduce(
    (latest, day) => day.date > latest ? day.date : latest,
    "",
  );
  const end = latestUploadedDate && latestUploadedDate < `${year}-12-31`
    ? latestUploadedDate
    : `${year}-12-31`;
  const ownDays = attendanceDays.filter((day) => day.staffId === staffId && day.date >= start && day.date <= end);
  const lateDates = ownDays.filter((day) => day.exceptions.includes("Late arrival")).map((day) => ({
    date: day.date, scheduled: day.scheduledStart, actual: day.firstIn,
  }));
  const punchDates = new Set(ownDays.map((day) => day.date));
  const approvedDates = new Set<string>();
  for (const request of leaveRequests.filter((item) => item.status === "Approved")) {
    const date = new Date(`${request.dateFrom}T12:00:00`);
    const last = new Date(`${request.dateTo}T12:00:00`);
    while (date <= last) {
      approvedDates.add(date.toISOString().slice(0, 10));
      date.setDate(date.getDate() + 1);
    }
  }
  const missingDates: string[] = [];
  if (latestUploadedDate && start <= end) {
    const date = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (date <= last) {
      const value = date.toISOString().slice(0, 10);
      const schedule = attendanceScheduleForDate(staffId, value, schedules, overrides);
      if (schedule?.isWorkday && !punchDates.has(value) && !approvedDates.has(value)) missingDates.push(value);
      date.setDate(date.getDate() + 1);
    }
  }
  return { lateDates, missingDates };
}