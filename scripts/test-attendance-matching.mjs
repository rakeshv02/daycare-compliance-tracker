import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { planAttendanceMatches, reconcileUnmatchedAttendance } =
  await import("../lib/attendance-matching.ts");

const north = "Noah's Arks";
const south = "Light House Academy";
const alex = { id: "employee-a", name: "Alex Smith", site: north };
const item = (name = "alexsmith", site = north) => ({
  normalized_name: name, imported_name: name, site,
});
const plan = (people, names = [item()], aliases = [], inactive = [], target) =>
  planAttendanceMatches(people, names, aliases, new Set(inactive), target);

test("matches one normalized name at the same site", () => {
  assert.deepEqual(plan([alex]), [
    { normalizedName: "alexsmith", site: north, staffId: alex.id },
  ]);
});
test("does not match across sites", () => {
  assert.deepEqual(plan([{ ...alex, site: south }]), []);
});
test("duplicate names, including inactive names, remain ambiguous", () => {
  const duplicate = { ...alex, id: "employee-b" };
  assert.deepEqual(plan([alex, duplicate]), []);
  assert.deepEqual(plan([alex, duplicate], [item()], [], [duplicate.id]), []);
});
test("a database override is not counted as a duplicate base employee", () => {
  assert.equal(plan([alex, { ...alex }]).length, 1);
  assert.deepEqual(plan([alex, { ...alex, name: "Alex Jones" }]), []);
});
test("same name at two sites links to separate internal records", () => {
  const other = { ...alex, id: "employee-b", site: south };
  assert.deepEqual(plan([alex, other], [item(), item("alexsmith", south)]).map((m) => m.staffId),
    [alex.id, other.id]);
});
test("saved site-specific matches can resolve a spelling difference", () => {
  const alias = { normalized_name: "alexs", site: north, staff_id: alex.id };
  assert.equal(plan([alex], [item("alexs")], [alias])[0].staffId, alex.id);
});
test("invalid saved matches do not fall back to an automatic guess", () => {
  const alias = { normalized_name: "alexsmith", site: north, staff_id: "missing" };
  assert.deepEqual(plan([alex], [item()], [alias]), []);
  assert.deepEqual(plan([alex], [item()], [{ ...alias, staff_id: alex.id }], [alex.id]), []);
  assert.deepEqual(plan([{ ...alex, site: south }], [item()],
    [{ ...alias, staff_id: alex.id }]), []);
});
test("ignored names, blank names, and inactive employees are skipped", () => {
  assert.deepEqual(plan([alex], [item()], [], [alex.id]), []);
  assert.deepEqual(plan([{ ...alex, name: "Super Admin" }], [item("superadmin")]), []);
  assert.deepEqual(plan([{ ...alex, name: "" }], [item("")]), []);
});
test("employee creation only matches the newly created employee", () => {
  assert.deepEqual(plan([alex], [item()], [], [], "another-employee"), []);
  assert.equal(plan([alex], [item()], [], [], alex.id).length, 1);
});
test("different imported spellings of a normalized name form one group", () => {
  assert.equal(plan([alex], [item(), { ...item(), imported_name: "Alex Smith" }]).length, 1);
});
test("backfill preserves linked entries, counts updates, and is idempotent", async () => {
  const rows = [
    { ...item(), staff_id: null }, { ...item(), staff_id: null },
    { ...item(), staff_id: "previous-link" },
    { ...item("unknown"), staff_id: null },
    { ...item("alexsmith", south), staff_id: null },
  ];
  const fakeClient = {
    async query(sql, params) {
      if (sql.includes("FROM staff_members")) return { rows: [alex] };
      if (sql.includes("FROM staff_lifecycle") || sql.includes("FROM attendance_name_matches")) {
        return { rows: [] };
      }
      if (sql.startsWith("SELECT DISTINCT")) return { rows: rows.filter((r) => r.staff_id === null) };
      if (sql.startsWith("UPDATE")) {
        assert.match(sql, /AND staff_id IS NULL/);
        let rowCount = 0;
        for (const row of rows) {
          if (row.staff_id === null && row.normalized_name === params[0] && row.site === params[1]) {
            row.staff_id = params[2];
            rowCount++;
          }
        }
        return { rowCount };
      }
      throw new Error(`Unexpected test query: ${sql}`);
    },
  };
  assert.deepEqual(await reconcileUnmatchedAttendance(fakeClient),
    { matchedEntries: 2, matchedNames: 1, remainingNames: 2 });
  assert.equal(rows[2].staff_id, "previous-link");
  assert.deepEqual(await reconcileUnmatchedAttendance(fakeClient),
    { matchedEntries: 0, matchedNames: 0, remainingNames: 2 });
});