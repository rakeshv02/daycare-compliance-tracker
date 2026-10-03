import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { recordFormerAttendanceEmployee } = await import("../lib/attendance-matching.ts");
const { attendanceMatchingEmployees } = await import("../lib/attendance.ts");
const site = "Noah's Arks";
const otherSite = "Light House Academy";
const input = { importedName: "Short Term Employee", site, employeeId: "", leavingDate: "" };

function database({ staff = [], alias = [], ids = [], punches = [{ id: 1 }, { id: 2 }], failLifecycle = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT pg_advisory")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("SELECT id FROM attendance_punches")) return { rows: punches, rowCount: punches.length };
      if (sql.includes("SELECT staff_id FROM attendance_name_matches")) return { rows: alias, rowCount: alias.length };
      if (sql.includes("SELECT id,name,site FROM staff_members")) return { rows: staff, rowCount: staff.length };
      if (sql.includes("SELECT staff_id FROM staff_employee_ids")) return { rows: ids, rowCount: ids.length };
      if (failLifecycle && sql.startsWith("INSERT INTO staff_lifecycle")) throw new Error("Lifecycle write failed");
      if (sql.startsWith("UPDATE attendance_punches")) return { rows: [], rowCount: punches.length };
      if (sql.startsWith("INSERT INTO")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}
const writes = (db) => db.calls.filter(({ sql }) => /^(INSERT|UPDATE)/.test(sql));
const call = (db, fragment) => db.calls.find(({ sql }) => sql.includes(fragment));

test("an unregistered short-term employee is archived and all same-site unmatched entries are linked", async () => {
  const db = database();
  const result = await recordFormerAttendanceEmployee(db, input);
  assert.match(result.staffId, /^DB_/);
  assert.equal(result.matchedEntries, 2);
  assert.deepEqual(call(db, "INSERT INTO staff_members").params, [result.staffId, input.importedName, site]);
  assert.match(call(db, "INSERT INTO staff_members").sql, /NULL,true/);
  assert.deepEqual(call(db, "INSERT INTO staff_lifecycle").params, [result.staffId, null]);
  assert.match(call(db, "INSERT INTO staff_lifecycle").sql, /false/);
  assert.equal(call(db, "INSERT INTO staff_employee_ids"), undefined);
  assert.equal(call(db, "INSERT INTO staff_leave_access"), undefined);
  assert.deepEqual(call(db, "INSERT INTO attendance_name_matches").params, ["shorttermemployee", site, input.importedName, result.staffId]);
  assert.match(call(db, "UPDATE attendance_punches").sql, /site=\$2 AND staff_id IS NULL/);
  assert.deepEqual(call(db, "UPDATE attendance_punches").params, ["shorttermemployee", site, result.staffId]);
});
test("known ID and leaving date are recorded without granting staff portal access", async () => {
  const db = database();
  const result = await recordFormerAttendanceEmployee(db, { ...input, employeeId: " old-123 ", leavingDate: "2026-09-27" });
  assert.deepEqual(call(db, "INSERT INTO staff_employee_ids").params, [result.staffId, "OLD-123"]);
  assert.deepEqual(call(db, "INSERT INTO staff_lifecycle").params, [result.staffId, "2026-09-27"]);
  assert.match(call(db, "INSERT INTO staff_leave_access").sql, /false/);
});
test("a same-site existing employee must be selected instead of creating a duplicate", async () => {
  const db = database({ staff: [{ id: "already-here", name: "Short-Term Employee", site }] });
  await assert.rejects(recordFormerAttendanceEmployee(db, input), /already exists at this site/);
  assert.equal(writes(db).length, 0);
});
test("the same name at another site does not merge two employment histories", async () => {
  const db = database({ staff: [{ id: "other-employment", name: input.importedName, site: otherSite }] });
  const result = await recordFormerAttendanceEmployee(db, input);
  assert.notEqual(result.staffId, "other-employment");
  assert.equal(call(db, "INSERT INTO staff_members").params[2], site);
});
test("a saved alias is never redirected by the new archive option", async () => {
  const db = database({ alias: [{ staff_id: "existing" }] });
  await assert.rejects(recordFormerAttendanceEmployee(db, input), /saved employee match/);
  assert.equal(writes(db).length, 0);
});
test("an existing Employee ID cannot be reassigned", async () => {
  const db = database({ ids: [{ staff_id: "existing" }] });
  await assert.rejects(recordFormerAttendanceEmployee(db, { ...input, employeeId: "OLD-123" }), /already belongs/);
  assert.equal(writes(db).length, 0);
});
test("already-matched or nonexistent attendance cannot create a phantom employee", async () => {
  const db = database({ punches: [] });
  await assert.rejects(recordFormerAttendanceEmployee(db, input), /already matched/);
  assert.equal(writes(db).length, 0);
});
test("invalid dates and invalid identifiers fail before accessing the database", async () => {
  for (const extra of [{ leavingDate: "2026-02-30" }, { leavingDate: "2026-99-01" }, { leavingDate: "yesterday" }, { employeeId: "x" }, { employeeId: "INVALID ID" }]) {
    const db = database();
    await assert.rejects(recordFormerAttendanceEmployee(db, { ...input, ...extra }));
    assert.equal(db.calls.length, 0);
  }
});
test("blank or excluded names and unsupported sites cannot create records", async () => {
  for (const extra of [{ importedName: "" }, { importedName: "Super Admin" }, { site: "Another site" }]) {
    const db = database();
    await assert.rejects(recordFormerAttendanceEmployee(db, { ...input, ...extra }));
    assert.equal(db.calls.length, 0);
  }
});
test("database failures propagate to the caller's rollback without matching attendance", async () => {
  const db = database({ failLifecycle: true });
  await assert.rejects(recordFormerAttendanceEmployee(db, input), /Lifecycle write failed/);
  assert.equal(call(db, "INSERT INTO attendance_name_matches"), undefined);
  assert.equal(call(db, "UPDATE attendance_punches"), undefined);
});
test("historical matching includes departed staff at every site without changing their lifecycle", () => {
  const staff = [
    { id: "old-north", name: "Former North", site, hireDate: "" },
    { id: "old-south", name: "Former South", site: otherSite, hireDate: "" },
    { id: "current", name: "Current Employee", site, hireDate: "" },
  ];
  const lifecycle = [
    { staffId: "old-north", isActive: false, leavingDate: "2026-09-27" },
    { staffId: "old-south", isActive: false, leavingDate: null },
    { staffId: "current", isActive: true, leavingDate: "2020-01-01" },
  ];
  const result = attendanceMatchingEmployees(staff, lifecycle);
  assert.equal(result.length, 3);
  assert.equal(result.find((person) => person.id === "old-north").leavingDate, "2026-09-27");
  assert.equal(result.find((person) => person.id === "old-south").hasLeft, true);
  assert.equal(result.find((person) => person.id === "current").hasLeft, false);
  assert.equal(result.find((person) => person.id === "current").leavingDate, null);
  assert.equal(lifecycle[0].isActive, false);
});