import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAttendanceDays, departedAttendanceEmployees } from "../lib/attendance.ts";

const north = "Noah's Arks";
const south = "Light House Academy";
const former = { id: "old", name: "Former Employee", site: north, hireDate: "2025-01-01" };
const current = { id: "current", name: "Current Employee", site: north, hireDate: "2025-01-01" };
const lifecycle = [{ staffId: former.id, isActive: false, leavingDate: "2026-08-31" }];
const punch = (id, staffId, status, time) => ({
  id, importId: 1, staffId, status, time, date: "2026-08-28",
  site: north, importedName: "Former Employee",
});
const punches = [punch(1, former.id, "In", "08:00:00"), punch(2, former.id, "Out", "16:00:00")];
const days = (statuses = lifecycle) =>
  buildAttendanceDays([former, current], punches, [], [], 5, [], statuses);

test("departed employees retain their historical attendance with a Left identifier", () => {
  const result = days();
  assert.equal(result.length, 1);
  assert.equal(result[0].hasLeft, true);
  assert.equal(result[0].leavingDate, "2026-08-31");
  assert.equal(result[0].firstIn, "08:00:00");
  assert.equal(result[0].lastOut, "16:00:00");
});
test("left employees are identifiable even with no punches in the latest month", () => {
  const departed = departedAttendanceEmployees([former, current], lifecycle, [north]);
  assert.equal(departed.length, 1);
  assert.equal(departed[0].id, former.id);
  assert.equal(departed[0].leavingDate, "2026-08-31");
});
test("missing uploads are not evidence of departure", () => {
  assert.deepEqual(departedAttendanceEmployees([current], [], [north]), []);
  assert.equal(days([])[0].hasLeft, false);
  assert.equal(days([])[0].leavingDate, null);
});
test("unknown leaving dates are preserved without guessing a date", () => {
  const statuses = [{ ...lifecycle[0], leavingDate: null }];
  assert.equal(days(statuses)[0].hasLeft, true);
  assert.equal(days(statuses)[0].leavingDate, null);
});
test("reactivating an employee removes the Left identifier even if a stale date exists", () => {
  const statuses = [{ ...lifecycle[0], isActive: true }];
  assert.equal(days(statuses)[0].hasLeft, false);
  assert.equal(days(statuses)[0].leavingDate, null);
  assert.deepEqual(departedAttendanceEmployees([former], statuses, [north]), []);
});
test("departure identifiers stay specific to the included site and internal employee record", () => {
  const otherSite = { ...former, id: "other-employment", site: south };
  const departed = departedAttendanceEmployees([former, otherSite], lifecycle, [south]);
  assert.deepEqual(departed, []);
});
test("no upload does not show unrelated former employees", () => {
  assert.deepEqual(departedAttendanceEmployees([former], lifecycle, []), []);
});