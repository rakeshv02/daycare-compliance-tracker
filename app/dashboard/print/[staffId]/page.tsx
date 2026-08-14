import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { STAFF_BASE, SEED_CPR, ROLE_HOURS, trainingStatus, credentialStatus, currentTrainingYearWindow } from "@/lib/staff";
import PrintContent from "./print-content";

export default async function PrintPage({ params }: { params: { staffId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const staff = STAFF_BASE.find((s) => s.id === params.staffId);
  if (!staff) notFound();

  const site = session.user.site;
  if (site !== "all" && staff.site !== site) redirect("/dashboard");

  const [credsRows, trainingRows, roleRow, lifecycleRow, driverRow] = await Promise.all([
    pool.query<{ cred_type: string; issued_date: string | null; expires_date: string }>(
      "SELECT cred_type, issued_date::text, expires_date::text FROM staff_credentials WHERE staff_id = $1",
      [params.staffId]
    ),
    pool.query<{ entry_date: string; title: string; hours: string; topic: string }>(
      "SELECT entry_date::text AS entry_date, title, hours::text, topic FROM training_entries WHERE staff_id = $1 ORDER BY entry_date",
      [params.staffId]
    ),
    pool.query<{ role: string }>("SELECT role FROM staff_roles WHERE staff_id = $1", [params.staffId]),
    pool.query<{ is_active: boolean; leaving_date: string | null }>(
      "SELECT is_active, leaving_date::text FROM staff_lifecycle WHERE staff_id = $1",
      [params.staffId]
    ),
    pool.query<{ is_driver: boolean; dl_number: string | null; dl_expires: string | null; transport_training_date: string | null }>(
      "SELECT is_driver, dl_number, dl_expires::text, transport_training_date::text FROM staff_driver_info WHERE staff_id = $1",
      [params.staffId]
    ),
  ]);

  const credentials: Record<string, { issued: string | null; expires: string }> = {};
  for (const r of credsRows.rows) credentials[r.cred_type] = { issued: r.issued_date, expires: r.expires_date };
  if (!credentials["CPR/First Aid"] && SEED_CPR[params.staffId]) {
    credentials["CPR/First Aid"] = SEED_CPR[params.staffId];
  }

  const role = roleRow.rows[0]?.role ?? "Caregiver";
  const requiredHours = ROLE_HOURS[role] ?? 24;

  const entries = trainingRows.rows.map((r) => ({
    date: r.entry_date, title: r.title, hours: Number(r.hours), topic: r.topic,
  }));

  const trainingWindow = currentTrainingYearWindow(staff.hireDate);
  const inWindowEntries = trainingWindow
    ? entries.filter((e) => { const d = new Date(e.date); return d >= trainingWindow.start && d < trainingWindow.end; })
    : entries;

  const training = trainingStatus(entries, requiredHours, staff.hireDate);
  const lifecycle = lifecycleRow.rows[0] ?? { is_active: true, leaving_date: null };
  const driver = driverRow.rows[0] ?? { is_driver: false, dl_number: null, dl_expires: null, transport_training_date: null };

  const cprStatus = credentialStatus(credentials["CPR/First Aid"]?.expires ?? null);
  const bgStatus = !credentials["Background Check"] && staff.hireDate
    ? "valid"
    : credentialStatus(credentials["Background Check"]?.expires ?? null);

  return (
    <PrintContent
      staff={{ ...staff, role }}
      credentials={credentials}
      cprStatus={cprStatus}
      bgStatus={bgStatus}
      trainingEntries={inWindowEntries}
      training={training}
      requiredHours={requiredHours}
      lifecycle={{ isActive: lifecycle.is_active, leavingDate: lifecycle.leaving_date }}
      driver={{
        isDriver: driver.is_driver,
        dlNumber: driver.dl_number,
        dlExpires: driver.dl_expires,
        transportTrainingDate: driver.transport_training_date,
      }}
      printedAt={new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
    />
  );
}
