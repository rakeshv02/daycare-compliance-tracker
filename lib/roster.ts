import pool from "./db";
import { STAFF_BASE } from "./staff";
import type { StaffMember } from "./staff";

export async function loadMergedRoster(includeInactive = false) {
  const [dbStaff, lifecycle] = await Promise.all([
    pool.query<{ id: string; name: string; site: string; hire_date: string | null; is_db_only: boolean }>(
      "SELECT id,name,site,hire_date::text,is_db_only FROM staff_members",
    ),
    pool.query<{ staff_id: string; is_active: boolean }>("SELECT staff_id,is_active FROM staff_lifecycle"),
  ]);
  const overrides = new Map(dbStaff.rows.map((row) => [row.id, row]));
  const roster: StaffMember[] = STAFF_BASE.map((person) => {
    const row = overrides.get(person.id);
    return row ? {
      ...person,
      name: row.name,
      site: row.site as StaffMember["site"],
      hireDate: row.hire_date ?? person.hireDate,
    } : person;
  });
  roster.push(...dbStaff.rows.filter((row) => row.is_db_only).map((row) => ({
    id: row.id,
    name: row.name,
    site: row.site as StaffMember["site"],
    hireDate: row.hire_date ?? "",
  })));
  if (includeInactive) return roster;
  const inactive = new Set(lifecycle.rows.filter((row) => !row.is_active).map((row) => row.staff_id));
  return roster.filter((person) => !inactive.has(person.id));
}