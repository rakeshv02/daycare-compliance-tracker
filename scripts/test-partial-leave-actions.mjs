import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
globalThis.partialLeaveTest = {};
function reset() {
  globalThis.partialLeaveTest = { staffId: "test-staff", director: true, calls: [], saved: [], staged: [], refreshed: [] };
  globalThis.partialLeaveTest.query = async (sql, params = []) => {
    const state = globalThis.partialLeaveTest;
    state.calls.push({ sql, params });
    if (sql === "BEGIN") { state.staged = []; return { rows: [], rowCount: 0 }; }
    if (sql === "COMMIT") { state.saved.push(...state.staged); state.staged = []; return { rows: [], rowCount: 0 }; }
    if (sql === "ROLLBACK") { state.staged = []; return { rows: [], rowCount: 0 }; }
    if (sql.startsWith("SELECT pg_advisory")) return { rows: [], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM staff_leave_requests")) {
      const [staffId, leaveType, dateFrom, dateTo, duration, startTime, endTime] = params;
      const rows = state.saved.filter((r) => r.status === "Pending" && r.staffId === staffId && r.leaveType === leaveType &&
        r.dateFrom === dateFrom && r.dateTo === dateTo && r.duration === duration && r.startTime === startTime && r.endTime === endTime);
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("INSERT INTO staff_leave_requests")) {
      if (state.failInsert) throw new Error("Database write failed");
      const [staffId, leaveType, dateFrom, dateTo, reason, duration, startTime, endTime] = params;
      state.staged.push({ id: state.saved.length + 1, staffId, leaveType, dateFrom, dateTo, reason, duration, startTime, endTime, status: "Pending" });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("UPDATE staff_leave_requests")) {
      const row = state.saved.find((r) => r.id === params[0] && r.status === "Pending");
      if (row) {
        if (sql.includes("status='Cancelled'")) { if (row.staffId === params[1]) row.status = "Cancelled"; }
        else { row.status = params[1]; row.directorNote = params[2]; row.isPaidVacation = row.status === "Approved" && row.leaveType === "Vacation" && params[3]; }
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}
reset();
const mocks = {
  "next-auth": `export const getServerSession = async () => ({user:{site:globalThis.partialLeaveTest.director?"all":"site"}});`,
  "next/navigation": `export function redirect(path) { throw new Error("Redirect: "+path); }`,
  "next/cache": `export function revalidatePath(path) { globalThis.partialLeaveTest.refreshed.push(path); }`,
  "./db": `export default {connect:async()=>({query:(...args)=>globalThis.partialLeaveTest.query(...args),release:()=>{globalThis.partialLeaveTest.released=true;}}),query:(...args)=>globalThis.partialLeaveTest.query(...args)};`,
  "./auth": `export const authOptions={};`,
  "./leave-auth": `export const getLeaveStaffId=()=>globalThis.partialLeaveTest.staffId;export function clearLeaveSession(){};export function setLeaveSession(){};`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier] && (specifier.startsWith("next") || context.parentURL?.endsWith("/leave-actions.ts"))) {
      return { url: dataModule(mocks[specifier]), shortCircuit: true };
    }
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { submitLeaveRequest, decideLeaveRequest, cancelLeaveRequest } = await import("../lib/leave-actions.ts");
const { leaveDaysInYear, leaveHoursInYear } = await import("../lib/leave.ts");
function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ leaveType: "Vacation", dateFrom: "2026-09-28", dateTo: "2026-09-28", duration: "Half day", startTime: "09:00", endTime: "13:00", reason: "Appointment", ...extra })) data.set(key, value);
  return data;
}

test("half-day times survive submission, paid approval and both page refreshes", async () => {
  reset();
  assert.deepEqual(await submitLeaveRequest(form()), { ok: true });
  const state = globalThis.partialLeaveTest;
  assert.equal(state.saved[0].startTime, "09:00");
  assert.equal(state.saved[0].endTime, "13:00");
  await decideLeaveRequest(1, "Approved", " Approved ", true);
  assert.equal(state.saved[0].isPaidVacation, true);
  assert.equal(state.saved[0].directorNote, "Approved");
  assert.equal(leaveDaysInYear(state.saved[0], 2026), 0.5);
  assert.ok(state.refreshed.includes("/leave"));
  assert.ok(state.refreshed.includes("/dashboard/leave"));
  assert.equal(state.released, true);
});
test("part-day times survive approval and are counted in hours", async () => {
  reset();
  await submitLeaveRequest(form({ duration: "Part of day", startTime: "13:30", endTime: "15:00" }));
  await decideLeaveRequest(1, "Approved", "");
  assert.equal(leaveHoursInYear(globalThis.partialLeaveTest.saved[0], 2026), 1.5);
  assert.equal(leaveDaysInYear(globalThis.partialLeaveTest.saved[0], 2026), 0);
});
test("identical pending requests are rejected, but different time slots remain distinct", async () => {
  reset();
  await submitLeaveRequest(form());
  assert.match((await submitLeaveRequest(form())).error, /already have a pending request/);
  assert.equal(globalThis.partialLeaveTest.saved.length, 1);
  await submitLeaveRequest(form({ startTime: "13:00", endTime: "17:00" }));
  assert.equal(globalThis.partialLeaveTest.saved.length, 2);
  assert.match(globalThis.partialLeaveTest.calls.find((c) => c.sql.includes("SELECT 1 FROM staff_leave_requests")).sql, /start_time IS NOT DISTINCT FROM/);
});
test("full-day submission still saves a date range and null times", async () => {
  reset();
  await submitLeaveRequest(form({ duration: "Full day", dateTo: "2026-10-02" }));
  const row = globalThis.partialLeaveTest.saved[0];
  assert.equal(row.startTime, null);
  assert.equal(row.endTime, null);
  await decideLeaveRequest(1, "Approved", "");
  assert.equal(leaveDaysInYear(row, 2026), 5);
});
test("invalid time ranges fail before opening a database connection", async () => {
  reset();
  await assert.rejects(submitLeaveRequest(form({ endTime: "08:00" })), /End time must be after start time/);
  assert.deepEqual(globalThis.partialLeaveTest.calls, []);
});
test("a database failure rolls back without leaving an incomplete request", async () => {
  reset();
  globalThis.partialLeaveTest.failInsert = true;
  await assert.rejects(submitLeaveRequest(form()), /Database write failed/);
  assert.deepEqual(globalThis.partialLeaveTest.saved, []);
  assert.ok(globalThis.partialLeaveTest.calls.some((c) => c.sql === "ROLLBACK"));
  assert.equal(globalThis.partialLeaveTest.released, true);
});
test("signed-out staff cannot submit and non-directors cannot approve", async () => {
  reset();
  globalThis.partialLeaveTest.staffId = null;
  await assert.rejects(submitLeaveRequest(form()), /Redirect/);
  assert.deepEqual(globalThis.partialLeaveTest.calls, []);
  globalThis.partialLeaveTest.director = false;
  await assert.rejects(decideLeaveRequest(1, "Approved", ""), /Only the director/);
});
test("staff cancellation retains time details and removes the approved-hour contribution", async () => {
  reset();
  await submitLeaveRequest(form({ duration: "Part of day" }));
  await cancelLeaveRequest(1);
  const row = globalThis.partialLeaveTest.saved[0];
  assert.equal(row.status, "Cancelled");
  assert.equal(row.startTime, "09:00");
  assert.equal(leaveHoursInYear(row, 2026), 0);
});