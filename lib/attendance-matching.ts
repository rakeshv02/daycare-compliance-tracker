import type { PoolClient } from "pg";
import { isIgnoredAttendanceName, normalizeAttendanceName } from "./attendance";
import { STAFF_BASE } from "./staff";

type Person = { id: string; name: string; site: string };
type UnmatchedName = { normalized_name: string; imported_name: string; site: string };
type SavedMatch = { normalized_name: string; site: string; staff_id: string };

const keyFor = (name: string, site: string) => JSON.stringify([site, name]);

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