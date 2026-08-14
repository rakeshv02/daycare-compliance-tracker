import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { STAFF_BASE, SEED_CPR, ROLE_HOURS, trainingStatus, credentialStatus } from "@/lib/staff";
import type { StaffMember } from "@/lib/staff";
import { ReportControls } from "./report-controls";

export default async function ReportPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const sessionSite = session.user.site;

  const [credsRows, trainingRows, rolesRows, lifecycleRows, dbStaffRows] = await Promise.all([
    pool.query<{ staff_id: string; cred_type: string; expires_date: string }>(
      "SELECT staff_id, cred_type, expires_date::text FROM staff_credentials"
    ),
    pool.query<{ staff_id: string; entry_date: string; hours: string; topic: string }>(
      "SELECT staff_id, entry_date::text AS entry_date, hours::text, topic FROM training_entries ORDER BY entry_date"
    ),
    pool.query<{ staff_id: string; role: string }>("SELECT staff_id, role FROM staff_roles"),
    pool.query<{ staff_id: string; is_active: boolean }>("SELECT staff_id, is_active FROM staff_lifecycle"),
    pool.query<{ id: string; name: string; site: string; hire_date: string | null; is_db_only: boolean }>(
      "SELECT id, name, site, hire_date::text, is_db_only FROM staff_members"
    ),
  ]);

  const dbMap = new Map(dbStaffRows.rows.map((r) => [r.id, r]));
  const merged: StaffMember[] = STAFF_BASE.map((s) => {
    const ov = dbMap.get(s.id);
    return ov ? { ...s, name: ov.name, site: ov.site as StaffMember["site"], hireDate: ov.hire_date ?? s.hireDate } : s;
  });
  const newStaff: StaffMember[] = dbStaffRows.rows.filter((r) => r.is_db_only).map((r) => ({
    id: r.id, name: r.name, site: r.site as StaffMember["site"], hireDate: r.hire_date ?? "",
  }));
  const allStaff = [...merged, ...newStaff].filter((s) =>
    sessionSite === "all" || s.site === sessionSite
  );

  const creds: Record<string, Record<string, string>> = {};
  for (const r of credsRows.rows) {
    creds[r.staff_id] ??= {};
    creds[r.staff_id][r.cred_type] = r.expires_date;
  }
  for (const [id, rec] of Object.entries(SEED_CPR)) {
    if (!creds[id]?.["CPR/First Aid"]) { creds[id] ??= {}; creds[id]["CPR/First Aid"] = rec.expires; }
  }

  const training: Record<string, { date: string; hours: number; topic: string }[]> = {};
  for (const r of trainingRows.rows) {
    training[r.staff_id] ??= [];
    training[r.staff_id].push({ date: r.entry_date, hours: Number(r.hours), topic: r.topic });
  }

  const roles: Record<string, string> = {};
  for (const r of rolesRows.rows) roles[r.staff_id] = r.role;
  const lifecycle: Record<string, boolean> = {};
  for (const r of lifecycleRows.rows) lifecycle[r.staff_id] = r.is_active;

  const printedAt = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function statusIcon(status: string) {
    if (status === "valid")    return { icon: "✔", cls: "text-green-700 bg-green-50" };
    if (status === "expiring") return { icon: "⚠", cls: "text-yellow-700 bg-yellow-50" };
    if (status === "expired")  return { icon: "✘", cls: "text-red-700 bg-red-50" };
    return { icon: "—", cls: "text-gray-400 bg-gray-50" };
  }

  function fmtDate(d: Date) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const rows = allStaff.map((s) => {
    const role = roles[s.id] ?? "Caregiver";
    const isActive = lifecycle[s.id] !== false;
    const cprStatus = credentialStatus(creds[s.id]?.["CPR/First Aid"] ?? null);
    const bgStatus = !creds[s.id]?.["Background Check"] && s.hireDate ? "valid" : credentialStatus(creds[s.id]?.["Background Check"] ?? null);
    const entries = (training[s.id] ?? []).map((e) => ({ ...e, title: "", id: 0 }));
    const tr = trainingStatus(entries, ROLE_HOURS[role] ?? 24, s.hireDate);
    const issues = [cprStatus, bgStatus, tr.status].filter((x) => x !== "valid").length;
    const windowStr = tr.window ? `${fmtDate(tr.window.start)} – ${fmtDate(tr.window.end)}` : "—";
    return { s, role, isActive, cprStatus, bgStatus, tr, issues, windowStr };
  }).sort((a, b) => b.issues - a.issues);

  const urgent = rows.filter((r) => r.isActive && (r.cprStatus === "expired" || r.bgStatus === "expired" || r.tr.status === "expired"));
  const expiring = rows.filter((r) => r.isActive && !urgent.includes(r) && (r.cprStatus === "expiring" || r.bgStatus === "expiring" || r.tr.status === "expiring" || r.tr.status === "missing"));
  const compliant = rows.filter((r) => r.isActive && !urgent.includes(r) && !expiring.includes(r));
  const inactive = rows.filter((r) => !r.isActive);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11pt; margin: 0; background: #FAFAF7; }
        @media print {
          @page { size: letter landscape; margin: 0.5in; }
          .no-print { display: none !important; }
          body { background: white; }
          .page { padding: 0 !important; max-width: 100% !important; }
        }
        .page { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
        h1 { font-size: 18pt; color: #1F4D47; margin-bottom: 2px; }
        h2 { font-size: 11pt; font-weight: bold; margin: 20px 0 6px; padding: 4px 8px; border-radius: 6px; }
        h2.urgent  { background: #FBEAE6; color: #B23E27; }
        h2.warn    { background: #FCF3E3; color: #9A6B14; }
        h2.ok      { background: #EAF5F0; color: #2F7A60; }
        h2.off     { background: #F0F0EE; color: #7A7A74; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9.5pt; }
        th { background: #F0F0EE; padding: 5px 8px; text-align: left; font-size: 8.5pt; text-transform: uppercase; border-bottom: 1.5px solid #ccc; }
        td { padding: 5px 8px; border-bottom: 1px solid #E9E7DF; vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 8.5pt; font-weight: 600; }
        .btn { display: inline-block; padding: 8px 18px; background: #1F4D47; color: white; border-radius: 10px; text-decoration: none; font-size: 10pt; margin-right: 8px; cursor: pointer; border: none; }
        .meta { font-size: 9pt; color: #888; margin-bottom: 20px; }
        .summary { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .stat { background: white; border: 1px solid #E9E7DF; border-radius: 12px; padding: 12px 20px; }
        .stat .n { font-size: 22pt; font-weight: 700; color: #1F4D47; line-height: 1; }
        .stat .l { font-size: 8pt; text-transform: uppercase; color: #888; margin-top: 2px; }
      `}</style>
      <div className="page">
        <ReportControls />

        <h1>Compliance Overview Report</h1>
        <div className="meta">{sessionSite === "all" ? "All sites" : sessionSite} · Generated {printedAt} · Texas HHSC Child Care Licensing</div>

        <div className="summary">
          <div className="stat"><div className="n" style={{ color: "#B23E27" }}>{urgent.length}</div><div className="l">Urgent / expired</div></div>
          <div className="stat"><div className="n" style={{ color: "#9A6B14" }}>{expiring.length}</div><div className="l">Expiring / incomplete</div></div>
          <div className="stat"><div className="n" style={{ color: "#2F7A60" }}>{compliant.length}</div><div className="l">Fully compliant</div></div>
          <div className="stat"><div className="n" style={{ color: "#A0A09A" }}>{inactive.length}</div><div className="l">Inactive</div></div>
        </div>

        {[
          { label: `🚨 Urgent — Expired (${urgent.length})`, cls: "urgent", data: urgent },
          { label: `⚠ Needs Attention — Expiring / Incomplete (${expiring.length})`, cls: "warn", data: expiring },
          { label: `✔ Compliant (${compliant.length})`, cls: "ok", data: compliant },
          { label: `Inactive staff (${inactive.length})`, cls: "off", data: inactive },
        ].filter((g) => g.data.length > 0).map((group) => (
          <div key={group.cls}>
            <h2 className={group.cls}>{group.label}</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Site</th>
                  <th>Role</th>
                  <th>Training Year</th>
                  <th>CPR/First Aid</th>
                  <th>Background Check</th>
                  <th>Training hrs</th>
                  <th>Core ≥6</th>
                  <th>Abuse ≥1</th>
                </tr>
              </thead>
              <tbody>
                {group.data.map(({ s, role, cprStatus, bgStatus, tr, windowStr }) => {
                  const cpr = statusIcon(cprStatus);
                  const bg  = statusIcon(bgStatus);
                  const trS = statusIcon(tr.status);
                  const core = statusIcon(tr.meetsCore ? "valid" : "expiring");
                  const abuse = statusIcon(tr.meetsAbuse ? "valid" : "expiring");
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td style={{ fontSize: "9pt", color: "#666" }}>{s.site}</td>
                      <td style={{ fontSize: "9pt" }}>{role}</td>
                      <td style={{ fontSize: "8.5pt", color: "#555", whiteSpace: "nowrap" }}>{windowStr}</td>
                      <td><span className={`badge ${cpr.cls}`}>{cpr.icon} {cprStatus}</span></td>
                      <td><span className={`badge ${bg.cls}`}>{bg.icon} {bgStatus}</span></td>
                      <td><span className={`badge ${trS.cls}`}>{tr.total}/{ROLE_HOURS[role] ?? 24} hrs</span></td>
                      <td><span className={`badge ${core.cls}`}>{core.icon} {tr.core}h</span></td>
                      <td><span className={`badge ${abuse.cls}`}>{abuse.icon} {tr.abuse}h</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ marginTop: 24, fontSize: "8pt", color: "#999", borderTop: "1px solid #ddd", paddingTop: 8 }}>
          Generated from Blossoms Connect Staff Compliance Tracker · {printedAt} · Retain per Texas HHSC requirements.
        </div>
      </div>
    </>
  );
}
