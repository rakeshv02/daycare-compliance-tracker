import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const {
  parseLeaveSubmission, leaveDaysInYear, leaveHoursInYear, leaveDurationLabel,
  formatLeaveAmount, personalAttendanceSummary,
} = await import("../lib/leave.ts");
const request = {
  id: 1, staffId: "test-staff", staffName: "Test Employee", site: "Test",
  leaveType: "Vacation", isPaidVacation: false, dateFrom: "2026-09-28", dateTo: "2026-09-28",
  reason: "", status: "Approved", directorNote: "", createdAt: "", decidedAt: null,
};
const half = { ...request, duration: "Half day", startTime: "09:00", endTime: "13:00" };
const part = { ...request, duration: "Part of day", startTime: "13:15", endTime: "15:45" };
function submission(extra = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ leaveType: "Vacation", dateFrom: request.dateFrom, dateTo: request.dateTo, reason: " Appointment ", ...extra })) {
    result.set(key, value);
  }
  return result;
}

test("old full-day submissions and date ranges remain compatible", () => {
  const parsed = parseLeaveSubmission(submission({ dateTo: "2026-10-02" }));
  assert.equal(parsed.duration, "Full day");
  assert.equal(parsed.startTime, null);
  assert.equal(parsed.endTime, null);
  assert.equal(parsed.reason, "Appointment");
  assert.equal(leaveDaysInYear({ ...request, dateTo: "2026-10-02" }, 2026), 5);
});
test("half days preserve the selected start and end time and count as 0.5 day", () => {
  const parsed = parseLeaveSubmission(submission(half));
  assert.equal(parsed.startTime, "09:00");
  assert.equal(parsed.endTime, "13:00");
  assert.equal(leaveDaysInYear(half, 2026), 0.5);
  assert.equal(leaveHoursInYear(half, 2026), 0);
});
test("part-day leave is counted in exact hours without guessing a workday length", () => {
  const parsed = parseLeaveSubmission(submission(part));
  assert.equal(parsed.duration, "Part of day");
  assert.equal(leaveHoursInYear(part, 2026), 2.5);
  assert.equal(leaveDaysInYear(part, 2026), 0);
  assert.equal(formatLeaveAmount(1.5, 2.5), "1.5 days + 2.5 hrs");
});
test("full-day requests discard stale time fields after changing the duration", () => {
  const parsed = parseLeaveSubmission(submission({ duration: "Full day", startTime: "09:00", endTime: "13:00" }));
  assert.equal(parsed.startTime, null);
  assert.equal(parsed.endTime, null);
});
test("both partial-day choices require a valid time range", () => {
  for (const duration of ["Half day", "Part of day"]) {
    for (const times of [{}, { startTime: "09:00" }, { startTime: "13:00", endTime: "09:00" },
      { startTime: "09:00", endTime: "09:00" }, { startTime: "24:00", endTime: "25:00" },
      { startTime: "9:00", endTime: "13:00" }, { startTime: "09:60", endTime: "13:00" }]) {
      assert.throws(() => parseLeaveSubmission(submission({ duration, ...times })), /start and end times/);
    }
  }
});
test("half-day and part-day requests cannot span multiple dates", () => {
  for (const duration of ["Half day", "Part of day"]) {
    assert.throws(() => parseLeaveSubmission(submission({ duration, startTime: "09:00", endTime: "13:00", dateTo: "2026-09-29" })), /one date/);
  }
});
test("invalid leave types, durations, calendar dates and reversed dates are rejected", () => {
  for (const extra of [{ leaveType: "Invalid" }, { duration: "Invalid" }, { dateFrom: "2026-02-30" },
    { dateFrom: "" }, { dateFrom: "0000-01-01" }, { dateTo: "2026-09-27" }]) {
    assert.throws(() => parseLeaveSubmission(submission(extra)));
  }
});
test("pending, denied and cancelled requests do not inflate approved totals", () => {
  for (const status of ["Pending", "Denied", "Cancelled"]) {
    assert.equal(leaveDaysInYear({ ...half, status }, 2026), 0);
    assert.equal(leaveHoursInYear({ ...part, status }, 2026), 0);
  }
});
test("year boundaries, future leave, and weekends preserve existing accounting rules", () => {
  assert.equal(leaveDaysInYear(half, 2025), 0);
  assert.equal(leaveHoursInYear(part, 2025), 0);
  assert.equal(leaveDaysInYear({ ...half, dateFrom: "2099-01-05", dateTo: "2099-01-05" }, 2099, true), 0);
  assert.equal(leaveHoursInYear({ ...part, dateFrom: "2099-01-05", dateTo: "2099-01-05" }, 2099, true), 0);
  assert.equal(leaveDaysInYear({ ...half, dateFrom: "2026-10-03", dateTo: "2026-10-03" }, 2026), 0);
  assert.equal(leaveHoursInYear({ ...part, dateFrom: "2026-10-03", dateTo: "2026-10-03" }, 2026), 0);
  assert.equal(leaveDaysInYear({ ...request, dateFrom: "2026-12-31", dateTo: "2027-01-01" }, 2026), 1);
});
test("request details show both duration and readable start/end times", () => {
  assert.equal(leaveDurationLabel(half), "Half day · 0.5 day · 9:00 AM–1:00 PM");
  assert.equal(leaveDurationLabel(part), "Part of day · 2.5 hrs · 1:15 PM–3:45 PM");
  assert.equal(leaveDurationLabel({ ...part, startTime: "00:00", endTime: "12:00" }), "Part of day · 12 hrs · 12:00 AM–12:00 PM");
  assert.equal(leaveDurationLabel(request), "1 day");
});
test("a partial-day approval cannot excuse an entire missed scheduled day", () => {
  const schedules = [{ id: 1, staffId: request.staffId, weekday: 1, effectiveFrom: request.dateFrom, start: "09:00", end: "17:00", isWorkday: true }];
  const uploaded = [{ staffId: "other-person", date: request.dateFrom, exceptions: [] }];
  const summary = (requests) => personalAttendanceSummary(request.staffId, 2026, uploaded, schedules, requests);
  assert.deepEqual(summary([half]).missingDates, [request.dateFrom]);
  assert.deepEqual(summary([part]).missingDates, [request.dateFrom]);
  assert.deepEqual(summary([request]).missingDates, []);
  assert.deepEqual(summary([{ ...request, status: "Pending" }]).missingDates, [request.dateFrom]);
});