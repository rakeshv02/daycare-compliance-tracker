import { attendanceScheduleForDate } from "./attendance";
import type { AttendanceDay, AttendanceSchedule, AttendanceScheduleOverride } from "./attendance";

export const LEAVE_TYPES = ["Vacation", "Medical", "Unpaid leave", "Sick", "Bereavement", "Other"] as const;
export const LEAVE_STATUSES = ["Pending", "Approved", "Denied", "Cancelled"] as const;
export const LEAVE_DURATIONS = ["Full day", "Half day", "Part of day"] as const;
export type LeaveDuration = (typeof LEAVE_DURATIONS)[number];

export type LeaveRequest = {
  id: number;
  staffId: string;
  staffName: string;
  site: string;
  leaveType: string;
  isPaidVacation: boolean;
  dateFrom: string;
  dateTo: string;
  duration?: LeaveDuration;
  startTime?: string | null;
  endTime?: string | null;
  reason: string;
  status: string;
  directorNote: string;
  createdAt: string;
  decidedAt: string | null;
};

export function parseLeaveSubmission(formData: FormData) {
  const leaveType = String(formData.get("leaveType") ?? "");
  const dateFrom = String(formData.get("dateFrom") ?? "");
  const dateTo = String(formData.get("dateTo") ?? "");
  const duration = String(formData.get("duration") ?? "Full day") as LeaveDuration;
  const reason = String(formData.get("reason") ?? "").trim();
  const validDate = (value: string) => /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!LEAVE_TYPES.includes(leaveType as typeof LEAVE_TYPES[number])) throw new Error("Choose a valid leave type.");
  if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) throw new Error("Choose a valid date range.");
  if (!LEAVE_DURATIONS.includes(duration)) throw new Error("Choose full day, half day, or part of day.");
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (duration !== "Full day") {
    if (dateFrom !== dateTo) throw new Error("Half-day and part-day requests must be for one date.");
    startTime = String(formData.get("startTime") ?? "");
    endTime = String(formData.get("endTime") ?? "");
    const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validTime(startTime) || !validTime(endTime) || startTime >= endTime) {
      throw new Error("Enter valid start and end times. End time must be after start time.");
    }
  }
  return { leaveType, dateFrom, dateTo, duration, startTime, endTime, reason };
}

export function leaveDayUnits(request: LeaveRequest) {
  return request.duration === "Half day" ? 0.5 : request.duration === "Part of day" ? 0 : 1;
}

// Keep part-day hours separate: do not assume that every employee works an eight-hour day.
export function leavePartHours(request: LeaveRequest) {
  if (request.duration !== "Part of day" || !request.startTime || !request.endTime) return 0;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return (minutes(request.endTime) - minutes(request.startTime)) / 60;
}

export function formatLeaveAmount(days: number, hours = 0) {
  const number = (value: number) => Number(value.toFixed(2)).toString();
  return [days || !hours ? `${number(days)} day${days === 1 ? "" : "s"}` : "",
    hours ? `${number(hours)} hr${hours === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
}

export function leaveDurationLabel(request: LeaveRequest) {
  if (!request.duration || request.duration === "Full day") {
    return formatLeaveAmount(weekdaysInclusive(request.dateFrom, request.dateTo));
  }
  const time = (value: string | null | undefined) => {
    if (!value) return "Time not recorded";
    const hour = Number(value.slice(0, 2));
    return `${hour % 12 || 12}:${value.slice(3, 5)} ${hour < 12 ? "AM" : "PM"}`;
  };
  const amount = request.duration === "Half day" ? "0.5 day" : formatLeaveAmount(0, leavePartHours(request));
  return `${request.duration} · ${amount} · ${time(request.startTime)}–${time(request.endTime)}`;
}

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
  return from <= to ? weekdaysInclusive(from, to) * leaveDayUnits(request) : 0;
}

export function leaveHoursInYear(request: LeaveRequest, year: number, throughToday = false) {
  if (request.status !== "Approved" || request.duration !== "Part of day") return 0;
  if (!request.dateFrom.startsWith(`${year}-`) || (throughToday && request.dateFrom > new Date().toISOString().slice(0, 10))) return 0;
  return weekdaysInclusive(request.dateFrom, request.dateTo) * leavePartHours(request);
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
  for (const request of leaveRequests.filter((item) => item.status === "Approved" && (!item.duration || item.duration === "Full day"))) {
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