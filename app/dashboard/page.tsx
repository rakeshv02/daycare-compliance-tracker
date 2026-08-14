import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { STAFF_BASE, SEED_CPR } from "@/lib/staff";
import type { StaffMember } from "@/lib/staff";
import ComplianceTracker from "@/components/compliance-tracker";

async function loadData() {
  const [credsRows, trainingRows, rolesRows, lifecycleRows, driverRows, dbStaffRows] = await Promise.all([
    pool.query<{ staff_id: string; cred_type: string; issued_date: string | null; expires_date: string }>(
      "SELECT staff_id, cred_type, issued_date::text, expires_date::text FROM staff_credentials"
    ),
    pool.query<{ id: number; staff_id: string; entry_date: string; title: string; hours: string; topic: string }>(
      "SELECT id, staff_id, entry_date::text AS entry_date, title, hours::text, topic FROM training_entries ORDER BY entry_date"
    ),
    pool.query<{ staff_id: string; role: string }>(
      "SELECT staff_id, role FROM staff_roles"
    ),
    pool.query<{ staff_id: string; is_active: boolean; leaving_date: string | null }>(
      "SELECT staff_id, is_active, leaving_date::text FROM staff_lifecycle"
    ),
    pool.query<{ staff_id: string; is_driver: boolean; dl_number: string | null; dl_expires: string | null; transport_training_date: string | null }>(
      "SELECT staff_id, is_driver, dl_number, dl_expires::text, transport_training_date::text FROM staff_driver_info"
    ),
    pool.query<{ id: string; name: string; site: string; hire_date: string | null; is_db_only: boolean }>(
      "SELECT id, name, site, hire_date::text, is_db_only FROM staff_members"
    ),
  ]);

  // Build merged staff list: hardcoded base + DB overrides + DB-only new hires
  const dbMap = new Map(dbStaffRows.rows.map((r) => [r.id, r]));
  const merged: StaffMember[] = STAFF_BASE.map((s) => {
    const override = dbMap.get(s.id);
    if (override) {
      return {
        ...s,
        name: override.name,
        site: override.site as StaffMember["site"],
        hireDate: override.hire_date ?? s.hireDate,
      };
    }
    return s;
  });
  const newStaff: StaffMember[] = dbStaffRows.rows
    .filter((r) => r.is_db_only)
    .map((r) => ({
      id: r.id,
      name: r.name,
      site: r.site as StaffMember["site"],
      hireDate: r.hire_date ?? "",
    }));
  const allStaff = [...merged, ...newStaff];

  const credentials: Record<string, Record<string, { issued: string | null; expires: string }>> = {};
  for (const r of credsRows.rows) {
    credentials[r.staff_id] ??= {};
    credentials[r.staff_id][r.cred_type] = { issued: r.issued_date, expires: r.expires_date };
  }
  for (const [staffId, rec] of Object.entries(SEED_CPR)) {
    if (!credentials[staffId]?.["CPR/First Aid"]) {
      credentials[staffId] ??= {};
      credentials[staffId]["CPR/First Aid"] = rec;
    }
  }

  const trainingHours: Record<string, { id: number; date: string; title: string; hours: number; topic: string }[]> = {};
  for (const r of trainingRows.rows) {
    trainingHours[r.staff_id] ??= [];
    trainingHours[r.staff_id].push({ id: r.id, date: r.entry_date, title: r.title, hours: Number(r.hours), topic: r.topic });
  }

  const roles: Record<string, string> = {};
  for (const r of rolesRows.rows) roles[r.staff_id] = r.role;

  const lifecycle: Record<string, { isActive: boolean; leavingDate: string | null }> = {};
  for (const r of lifecycleRows.rows) lifecycle[r.staff_id] = { isActive: r.is_active, leavingDate: r.leaving_date };

  const driverInfo: Record<string, { isDriver: boolean; dlNumber: string | null; dlExpires: string | null; transportTrainingDate: string | null }> = {};
  for (const r of driverRows.rows) {
    driverInfo[r.staff_id] = { isDriver: r.is_driver, dlNumber: r.dl_number, dlExpires: r.dl_expires, transportTrainingDate: r.transport_training_date };
  }

  return { allStaff, credentials, trainingHours, roles, lifecycle, driverInfo };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const site = session.user.site ?? "all";
  const { allStaff, credentials, trainingHours, roles, lifecycle, driverInfo } = await loadData();

  return (
    <ComplianceTracker
      allStaff={allStaff}
      initialCredentials={credentials}
      initialTrainingHours={trainingHours}
      initialRoles={roles}
      initialLifecycle={lifecycle}
      initialDriverInfo={driverInfo}
      sessionSite={site}
    />
  );
}
