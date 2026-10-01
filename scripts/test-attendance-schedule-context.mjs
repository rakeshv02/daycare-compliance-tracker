import assert from "node:assert/strict";
import { test } from "node:test";
import { attendanceScheduleDefaultDate, attendanceScheduleVersionsForDate } from "../lib/attendance.ts";

const version = (id, effectiveFrom, start) => ({
  id, staffId: "employee", weekday: 1, effectiveFrom, start, end: "17:00", isWorkday: true,
});
const schedules = [
  version(1, "2026-08-01", "08:00"),
  version(2, "2026-09-01", "08:30"),
  version(3, "2026-10-01", "09:00"),
];

test("September uploaded on October 1 defaults to the September period start", () => {
  assert.equal(attendanceScheduleDefaultDate("2026-09-01", "2026-10-01"), "2026-09-01");
});
test("without an upload, the initial date remains today", () => {
  assert.equal(attendanceScheduleDefaultDate(undefined, "2026-10-01"), "2026-10-01");
});
test("another upload supplies its own historical date", () => {
  assert.equal(attendanceScheduleDefaultDate("2026-08-03", "2026-10-01"), "2026-08-03");
});
test("September shows the September schedule, not the newer October schedule", () => {
  const result = attendanceScheduleVersionsForDate(schedules, "employee", "2026-09-01");
  assert.equal(result.current.start, "08:30");
  assert.deepEqual(result.upcoming.map((s) => s.effectiveFrom), ["2026-10-01"]);
  assert.deepEqual(result.previous.map((s) => s.effectiveFrom), ["2026-08-01"]);
});
test("a date before all versions does not borrow a future schedule", () => {
  const result = attendanceScheduleVersionsForDate(schedules, "employee", "2026-07-01");
  assert.equal(result.current, undefined);
  assert.equal(result.upcoming.length, 3);
});
test("manual date changes resolve against the chosen date", () => {
  const result = attendanceScheduleVersionsForDate(schedules, "employee", "2026-10-15");
  assert.equal(result.current.start, "09:00");
  assert.equal(result.upcoming.length, 0);
});
test("multiple weekdays yield one version; other employees and weekends are excluded", () => {
  const input = [
    ...schedules,
    { ...schedules[1], id: 4, weekday: 2 },
    { ...schedules[2], id: 5, staffId: "another-employee" },
    { ...schedules[2], id: 6, weekday: 6 },
  ];
  assert.equal(attendanceScheduleVersionsForDate(input, "employee", "2026-09-01").versions.length, 3);
});