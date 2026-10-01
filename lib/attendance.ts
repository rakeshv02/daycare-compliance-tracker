import type { StaffMember } from "./staff";

export type AttendancePunch = {
  id: number;
  importId: number;
  date: string;
  time: string;
  status: "In" | "Out";
  site: string;
  importedName: string;
  staffId: string | null;
};

export type AttendanceSchedule = {
  id: number;
  staffId: string;
  weekday: number;
  effectiveFrom: string;
  start: string | null;
  end: string | null;
  isWorkday: boolean;
};

export type AttendanceScheduleOverride = {
  id: number;
  staffId: string;
  date: string;
  start: string | null;
  end: string | null;
  isWorkday: boolean;
  note: string;
};

export type DayClassification = {
  staffId: string;
  date: string;
  classification: string;
  note: string;
};

export type AttendanceDay = {
  staffId: string;
  staffName: string;
  site: string;
  hasLeft: boolean;
  leavingDate: string | null;
  date: string;
  firstIn: string | null;
  lastOut: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  breakMinutes: number;
  exceptions: string[];
  classification: string;
  note: string;
};

export type AttendanceLifecycle = {
  staffId: string;
  isActive: boolean;
  leavingDate: string | null;
};

export type DepartedAttendanceEmployee = StaffMember & { leavingDate: string | null };

export function attendanceScheduleDefaultDate(periodStart: string | undefined, today: string) {
  return periodStart ?? today;
}

export function attendanceScheduleVersionsForDate(
  schedules: AttendanceSchedule[],
  staffId: string,
  date: string,
) {
  const weekdaySchedules = schedules
    .filter((schedule) => schedule.staffId === staffId && schedule.weekday >= 1 && schedule.weekday <= 5 && schedule.isWorkday)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const versions = Array.from(new Map(weekdaySchedules.map((schedule) => [schedule.effectiveFrom, schedule])).values());
  const current = versions.find((version) => version.effectiveFrom <= date);
  return {
    versions,
    current,
    upcoming: versions.filter((version) => version.effectiveFrom > date)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    previous: current ? versions.filter((version) => version.effectiveFrom < current.effectiveFrom) : [],
  };
}

export function departedAttendanceEmployees(
  staff: StaffMember[],
  lifecycle: AttendanceLifecycle[],
  includedSites: string[],
): DepartedAttendanceEmployee[] {
  const statuses = new Map(lifecycle.map((item) => [item.staffId, item]));
  return staff.flatMap((person) => {
    const status = statuses.get(person.id);
    if (!status || status.isActive || !includedSites.includes(person.site)) return [];
    return [{ ...person, leavingDate: status.leavingDate }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeAttendanceName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const IGNORED_ATTENDANCE_NAMES = new Set([
  "rakeshverma",
  "rakeshvarma",
  "madhuverma",
  "madhuvarma",
  "makaylasmith",
  "superadmin",
]);

export function isIgnoredAttendanceName(value: string) {
  return IGNORED_ATTENDANCE_NAMES.has(normalizeAttendanceName(value));
}

function minutes(value: string | null) {
  if (!value) return null;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

export function totalBreakMinutes(punches: Pick<AttendancePunch, "time" | "status">[]) {
  const ordered = [...punches].sort((a, b) => a.time.localeCompare(b.time));
  let hasClockedIn = false;
  let onDuty = false;
  let breakStarted: number | null = null;
  let total = 0;
  for (const punch of ordered) {
    const punchMinutes = minutes(punch.time);
    if (punchMinutes === null) continue;
    if (punch.status === "In") {
      if (hasClockedIn && !onDuty && breakStarted !== null && punchMinutes >= breakStarted) {
        total += punchMinutes - breakStarted;
      }
      hasClockedIn = true;
      onDuty = true;
      breakStarted = null;
    } else if (hasClockedIn && onDuty) {
      onDuty = false;
      breakStarted = punchMinutes;
    }
  }
  return total;
}

export function attendanceScheduleForDate(
  staffId: string,
  date: string,
  schedules: AttendanceSchedule[],
  overrides: AttendanceScheduleOverride[] = [],
) {
  const override = overrides.find((item) => item.staffId === staffId && item.date === date);
  if (override) return override;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return schedules
    .filter((item) => item.staffId === staffId && item.weekday === weekday && item.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function buildAttendanceDays(
  staff: StaffMember[],
  punches: AttendancePunch[],
  schedules: AttendanceSchedule[],
  classifications: DayClassification[],
  graceMinutes = 5,
  overrides: AttendanceScheduleOverride[] = [],
  lifecycle: AttendanceLifecycle[] = [],
) {
  const staffMap = new Map(staff.map((person) => [person.id, person]));
  const lifecycleMap = new Map(lifecycle.map((item) => [item.staffId, item]));
  const classificationMap = new Map(classifications.map((item) => [`${item.staffId}|${item.date}`, item]));
  const grouped = new Map<string, AttendancePunch[]>();
  for (const punch of punches) {
    if (!punch.staffId) continue;
    const key = `${punch.staffId}|${punch.date}`;
    grouped.set(key, [...(grouped.get(key) ?? []), punch]);
  }

  return Array.from(grouped.entries()).flatMap(([key, dayPunches]) => {
    const [staffId, date] = key.split("|");
    const person = staffMap.get(staffId);
    if (!person) return [];
    const status = lifecycleMap.get(staffId);
    const hasLeft = status?.isActive === false;
    const schedule = attendanceScheduleForDate(staffId, date, schedules, overrides);
    const ins = dayPunches.filter((p) => p.status === "In").map((p) => p.time).sort();
    const outs = dayPunches.filter((p) => p.status === "Out").map((p) => p.time).sort();
    const firstIn = ins[0] ?? null;
    const lastOut = outs.at(-1) ?? null;
    const breakMinutes = totalBreakMinutes(dayPunches);
    const exceptions: string[] = [];
    if (!firstIn || !lastOut) exceptions.push("Missing punch");
    if (schedule?.isWorkday) {
      const actualStart = minutes(firstIn);
      const actualEnd = minutes(lastOut);
      const scheduledStart = minutes(schedule.start);
      const scheduledEnd = minutes(schedule.end);
      if (actualStart !== null && scheduledStart !== null && actualStart > scheduledStart + graceMinutes) exceptions.push("Late arrival");
      if (actualEnd !== null && scheduledEnd !== null && actualEnd < scheduledEnd) exceptions.push("Early departure");
      if (actualEnd !== null && scheduledEnd !== null && actualEnd > scheduledEnd) exceptions.push("Overtime");
    }
    const classification = classificationMap.get(key);
    return [{
      staffId,
      staffName: person.name,
      site: person.site,
      hasLeft,
      leavingDate: hasLeft ? status.leavingDate : null,
      date,
      firstIn,
      lastOut,
      scheduledStart: schedule?.isWorkday ? schedule.start : null,
      scheduledEnd: schedule?.isWorkday ? schedule.end : null,
      breakMinutes,
      exceptions,
      classification: classification?.classification ?? "",
      note: classification?.note ?? "",
    }];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName));
}