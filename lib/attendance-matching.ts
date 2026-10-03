import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { isIgnoredAttendanceName, normalizeAttendanceName } from "./attendance";
import { STAFF_BASE } from "./staff";

type Person = { id: string; name: string; site: string };
type UnmatchedName = { normalized_name: string; imported_name: string; site: string };
type SavedMatch = { normalized_name: string; site: string; staff_id: string };

const keyFor = (name: string, site: string) => JSON.stringify([site, name]);

export type FormerAttendanceEmployeeInput = {
  importedName: string;
  site: string;
  employeeId: string;
  leavingDate: string;
};

// Called inside a transaction; never infer departure from missing punches.
export async function recordFormerAttendanceEmployee(client: PoolClient, input: FormerAttendanceEmployeeInput) {
  const name = input.importedName.trim();
  const normalizedName = normalizeAttendanceName(name);
  const employeeId = input.employeeId.trim().toUpperCase();
  const leavingDate = input.leavingDate.trim() || null;
  if (!normalizedName || isIgnoredAttendanceName(name)) throw new Error("Choose a valid imported employee name.");
  if (!STAFF_BASE.some((person) => person.site === input.site)) throw new Error("Choose a supported attendance site.");
  if (employeeId && !/^[A-Z0-9-]{3,20}$/.test(employeeId)) throw new Error("Employee ID must be 3–20 letters, numbers, or hyphens.");
  if (leavingDate && (!/^\d{4}-\d{2}-\d{2}$/.test(leavingDate) ||
    !Number.isFinite(Date.parse(`${leavingDate}T00:00:00Z`)) ||
    new Date(`${leavingDate}T00:00:00Z`).toISOString().slice(0, 10) !== leavingDate)) {
    throw new Error("Enter a valid leaving date, or leave it blank if not known.");
  }

  // Serialize this site's name to prevent duplicate records from repeated clicks/sessions.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [keyFor(normalizedName, input.site)]);
  const punches = await client.query<{ id: number }>(
    `SELECT id FROM attendance_punches
     WHERE normalized_name=$1 AND site=$2 AND staff_id IS NULL FOR UPDATE`,
    [normalizedName, input.site],
  );
  if (!punches.rows.length) throw new Error("These attendance entries are already matched. Refresh the page.");
  const savedMatch = await client.query(
    "SELECT staff_id FROM attendance_name_matches WHERE normalized_name=$1 AND site=$2",
    [normalizedName, input.site],
  );
  if (savedMatch.rows.length) throw new Error("This name already has a saved employee match. Select the existing employee record.");
  const dbStaff = await client.query<Person>("SELECT id,name,site FROM staff_members");
  const roster = new Map([...STAFF_BASE, ...dbStaff.rows].map((person) => [person.id, person]));
  if (Array.from(roster.values()).some((person) =>
    person.site === input.site && normalizeAttendanceName(person.name) === normalizedName)) {
    throw new Error("An employee with this name already exists at this site. Select their record from the dropdown, including employees marked Left.");
  }
  if (employeeId) {
    const existingId = await client.query("SELECT staff_id FROM staff_employee_ids WHERE employee_id=$1", [employeeId]);
    if (existingId.rows.length) throw new Error("This Employee ID already belongs to an employee. Select their existing record.");
  }
  const staffId = `DB_${randomUUID()}`;
  await client.query(
    "INSERT INTO staff_members(id,name,site,hire_date,is_db_only) VALUES($1,$2,$3,NULL,true)",
    [staffId, name, input.site],
  );
  await client.query(
    "INSERT INTO staff_lifecycle(staff_id,is_active,leaving_date) VALUES($1,false,$2)",
    [staffId, leavingDate],
  );
  if (employeeId) {
    await client.query("INSERT INTO staff_employee_ids(staff_id,employee_id) VALUES($1,$2)", [staffId, employeeId]);
    // Historical identifiers must not grant a former employee first-login portal access.
    await client.query(
      "INSERT INTO staff_leave_access(staff_id,pin_hash,is_enabled) VALUES($1,'',false)",
      [staffId],
    );
  }
  await client.query(
    `INSERT INTO attendance_name_matches(normalized_name,site,imported_name,staff_id) VALUES($1,$2,$3,$4)`,
    [normalizedName, input.site, name, staffId],
  );
  const matched = await client.query(
    `UPDATE attendance_punches SET staff_id=$3
     WHERE normalized_name=$1 AND site=$2 AND staff_id IS NULL`,
    [normalizedName, input.site, staffId],
  );
  return { staffId, matchedEntries: matched.rowCount ?? 0 };
}

export function planAttendanceMatches(
  people: Person[],
  unmatched: UnmatchedName[],
  savedMatches: SavedMatch[],
  inactiveIds: Set<string>,
  onlyStaffId?: string,
) {
  // A database row overrides the base roster row for the same internal ID.
  const roster = new Map(people.map((person) => [person.id, person]));
  const aliases = new Map(savedMatches.map((match) => [
    keyFor(match.normalized_name, match.site), match.staff_id,
  ]));
  const grouped = new Map<string, Person[]>();
  for (const person of Array.from(roster.values())) {
    const key = keyFor(normalizeAttendanceName(person.name), person.site);
    grouped.set(key, [...(grouped.get(key) ?? []), person]);
  }
  const names = new Map(unmatched.map((item) => [
    keyFor(item.normalized_name, item.site), item,
  ]));
  const plan: { normalizedName: string; site: string; staffId: string }[] = [];
  for (const [key, item] of Array.from(names.entries())) {
    if (!item.normalized_name || isIgnoredAttendanceName(item.imported_name)) continue;
    const savedId = aliases.get(key);
    // Never guess around a saved match that is no longer valid.
    const candidates = savedId ? [roster.get(savedId)] : (grouped.get(key) ?? []);
    if (candidates.length !== 1) continue;
    const person = candidates[0];
    if (!person || person.site !== item.site || inactiveIds.has(person.id)) continue;
    if (onlyStaffId && person.id !== onlyStaffId) continue;
    plan.push({ normalizedName: item.normalized_name, site: item.site, staffId: person.id });
  }
  return plan;
}

// The caller owns the transaction. Existing links are deliberately never rewritten.
export async function reconcileUnmatchedAttendance(client: PoolClient, onlyStaffId?: string) {
  const staff = await client.query<Person>("SELECT id,name,site FROM staff_members");
  const inactive = await client.query<{ staff_id: string }>(
    "SELECT staff_id FROM staff_lifecycle WHERE is_active=false",
  );
  const aliases = await client.query<SavedMatch>(
    "SELECT normalized_name,site,staff_id FROM attendance_name_matches",
  );
  const unmatched = await client.query<UnmatchedName>(
    "SELECT DISTINCT normalized_name,imported_name,site FROM attendance_punches WHERE staff_id IS NULL",
  );
  const plan = planAttendanceMatches(
    [...STAFF_BASE, ...staff.rows], unmatched.rows, aliases.rows,
    new Set(inactive.rows.map((person) => person.staff_id)), onlyStaffId,
  );
  let matchedEntries = 0;
  let matchedNames = 0;
  for (const match of plan) {
    const updated = await client.query(
      `UPDATE attendance_punches SET staff_id=$3
       WHERE normalized_name=$1 AND site=$2 AND staff_id IS NULL`,
      [match.normalizedName, match.site, match.staffId],
    );
    matchedEntries += updated.rowCount ?? 0;
    if (updated.rowCount) matchedNames++;
  }
  const remaining = await client.query<UnmatchedName>(
    "SELECT DISTINCT normalized_name,imported_name,site FROM attendance_punches WHERE staff_id IS NULL",
  );
  const remainingNames = new Set(remaining.rows
    .filter((item) => !isIgnoredAttendanceName(item.imported_name))
    .map((item) => keyFor(item.normalized_name, item.site))).size;
  return { matchedEntries, matchedNames, remainingNames };
}