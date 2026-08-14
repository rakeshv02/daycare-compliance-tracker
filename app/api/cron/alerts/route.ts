import { NextResponse } from "next/server";
import { Resend } from "resend";
import pool from "@/lib/db";
import { STAFF_BASE, SEED_CPR, ROLE_HOURS, trainingStatus, credentialStatus } from "@/lib/staff";
import type { StaffMember } from "@/lib/staff";

const TO = process.env.ALERT_EMAIL ?? "rakesh@thearks.com";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Verify cron secret to block public access
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [credsRows, trainingRows, rolesRows, lifecycleRows, dbStaffRows] = await Promise.all([
    pool.query<{ staff_id: string; cred_type: string; expires_date: string }>(
      "SELECT staff_id, cred_type, expires_date::text FROM staff_credentials"
    ),
    pool.query<{ staff_id: string; entry_date: string; hours: string; topic: string }>(
      "SELECT staff_id, entry_date::text, hours::text, topic FROM training_entries"
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
  const allStaff = [...merged, ...newStaff];

  const creds: Record<string, Record<string, string>> = {};
  for (const r of credsRows.rows) { creds[r.staff_id] ??= {}; creds[r.staff_id][r.cred_type] = r.expires_date; }
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

  type Issue = { name: string; site: string; issues: string[] };
  const urgent: Issue[] = [];
  const expiring: Issue[] = [];

  for (const s of allStaff) {
    if (lifecycle[s.id] === false) continue;
    const issues: string[] = [];
    const role = roles[s.id] ?? "Caregiver";

    const cprStatus = credentialStatus(creds[s.id]?.["CPR/First Aid"] ?? null);
    if (cprStatus === "expired")  issues.push("CPR/First Aid EXPIRED");
    else if (cprStatus === "expiring") issues.push("CPR/First Aid expiring soon");

    const bgHasRecord = !!creds[s.id]?.["Background Check"];
    const bgStatus = !bgHasRecord && s.hireDate ? "valid" : credentialStatus(creds[s.id]?.["Background Check"] ?? null);
    if (bgStatus === "expired")  issues.push("Background Check EXPIRED");
    else if (bgStatus === "expiring") issues.push("Background Check expiring soon");

    const entries = (training[s.id] ?? []).map((e) => ({ ...e, title: "", id: 0 }));
    const tr = trainingStatus(entries, ROLE_HOURS[role] ?? 24, s.hireDate);
    if (tr.status === "expired")  issues.push("Training hours overdue");
    else if (tr.status === "expiring" || tr.status === "missing") issues.push("Training hours incomplete");

    if (issues.length) {
      const isUrgent = issues.some((i) => i.includes("EXPIRED") || i.includes("overdue"));
      (isUrgent ? urgent : expiring).push({ name: s.name, site: s.site, issues });
    }
  }

  if (urgent.length === 0 && expiring.length === 0) {
    return NextResponse.json({ sent: false, reason: "No issues found" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  function renderGroup(title: string, items: Issue[]) {
    if (!items.length) return "";
    return `
      <h2 style="color:#1F4D47;font-size:14pt;border-bottom:2px solid #E0A732;padding-bottom:4px;">${title}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:20px;">
        <thead><tr style="background:#F0F0EE;">
          <th style="text-align:left;padding:6px 10px;">Name</th>
          <th style="text-align:left;padding:6px 10px;">Site</th>
          <th style="text-align:left;padding:6px 10px;">Issues</th>
        </tr></thead>
        <tbody>${items.map((i) => `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 10px;font-weight:600;">${i.name}</td>
            <td style="padding:6px 10px;color:#666;">${i.site}</td>
            <td style="padding:6px 10px;">${i.issues.map((x) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;background:${x.includes("EXPIRED")||x.includes("overdue")?"#FBEAE6":"#FCF3E3"};color:${x.includes("EXPIRED")||x.includes("overdue")?"#B23E27":"#9A6B14"};border-radius:12px;font-size:9pt;">${x}</span>`).join("")}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  }

  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <div style="background:#1F4D47;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:16pt;">Staff Compliance Alert</h1>
        <p style="margin:4px 0 0;font-size:10pt;opacity:.8;">Weekly summary · ${date}</p>
      </div>
      <div style="padding:24px;background:white;border:1px solid #E9E7DF;border-radius:0 0 12px 12px;">
        ${renderGroup("🚨 Urgent — Expired", urgent)}
        ${renderGroup("⚠ Needs Attention — Expiring / Incomplete", expiring)}
        <p style="font-size:9pt;color:#999;margin-top:16px;border-top:1px solid #eee;padding-top:12px;">
          View full details at <a href="https://daycare-compliance-tracker.vercel.app/dashboard">daycare-compliance-tracker.vercel.app</a>
        </p>
      </div>
    </div>`;

  const { error } = await resend.emails.send({
    from: process.env.ALERT_FROM ?? "Blossoms Connect <onboarding@resend.dev>",
    to: TO,
    subject: `⚠ Compliance Alert: ${urgent.length} expired, ${expiring.length} expiring — ${date}`,
    html,
  });

  if (error) return NextResponse.json({ sent: false, error }, { status: 500 });
  return NextResponse.json({ sent: true, urgent: urgent.length, expiring: expiring.length });
}
