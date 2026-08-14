import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildWeeklySummary } from "@/lib/weekly-summary";

const TO = process.env.WEEKLY_SUMMARY_EMAIL ?? "rakesh@thearks.com";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Verify cron secret to block public access — same pattern as /api/cron/alerts.
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // index 0 = current (in-progress) week, index 1 = the week that just ended.
  const weeks = await buildWeeklySummary(2);
  const lastWeek = weeks[1];

  const resend = new Resend(process.env.RESEND_API_KEY);

  function renderCounts(counts: Record<string, number>, emptyLabel: string) {
    const entries = Object.entries(counts);
    if (!entries.length) return `<span style="color:#999;">${emptyLabel}</span>`;
    return entries
      .map(
        ([label, n]) =>
          `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 10px;background:#F0F0EE;color:#33332F;border-radius:12px;font-size:9pt;">${label}: <strong>${n}</strong></span>`
      )
      .join("");
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1F4D47;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:16pt;">Waitlist Weekly Summary</h1>
        <p style="margin:4px 0 0;font-size:10pt;opacity:.8;">${lastWeek.weekLabel}</p>
      </div>
      <div style="padding:24px;background:white;border:1px solid #E9E7DF;border-radius:0 0 12px 12px;">
        <h2 style="color:#1F4D47;font-size:13pt;margin:0 0 8px;">New inquiries: ${lastWeek.totalAdditions}</h2>
        <p style="margin:0 0 20px;">${renderCounts(lastWeek.additionsBySite, "No new inquiries this week")}</p>

        <h2 style="color:#1F4D47;font-size:13pt;margin:0 0 8px;">Deleted records: ${lastWeek.totalDeletions}</h2>
        <p style="margin:0 0 20px;">${renderCounts(lastWeek.deletionsByStaff, "No deletions this week")}</p>

        <p style="font-size:9pt;color:#999;margin-top:16px;border-top:1px solid #eee;padding-top:12px;">
          Full detail (including reasons and timestamps) at
          <a href="https://daycare-compliance-tracker.vercel.app/dashboard/waitlist/activity">the activity log</a>.
        </p>
      </div>
    </div>`;

  const { error } = await resend.emails.send({
    from: process.env.WEEKLY_SUMMARY_FROM ?? "Daycare Waitlist <onboarding@resend.dev>",
    to: TO,
    subject: `Waitlist weekly summary: ${lastWeek.totalAdditions} added, ${lastWeek.totalDeletions} deleted — ${lastWeek.weekLabel}`,
    html,
  });

  if (error) return NextResponse.json({ sent: false, error }, { status: 500 });
  return NextResponse.json({ sent: true, week: lastWeek.weekLabel, additions: lastWeek.totalAdditions, deletions: lastWeek.totalDeletions });
}
