import pool from "@/lib/db";

export type WeekSummary = {
  weekStart: string; // Monday, ISO
  weekLabel: string; // e.g. "Jul 13 – Jul 19"
  additionsBySite: Record<string, number>;
  totalAdditions: number;
  deletionsByStaff: Record<string, number>;
  totalDeletions: number;
};

// Monday-start of the week containing d
export function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() - diff);
  return monday;
}

export function weekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

// Returns weeksBack buckets, index 0 = current (in-progress) week, index 1 = last full week, etc.
export async function buildWeeklySummary(weeksBack: number): Promise<WeekSummary[]> {
  const [additionRows, deletionRows] = await Promise.all([
    pool.query<{ created_at: string; site: string }>("SELECT created_at::text, site FROM inquiries"),
    pool.query<{ staff_name: string; created_at: string }>(
      "SELECT staff_name, created_at::text FROM inquiry_audit_log WHERE action = 'delete'"
    ),
  ]);

  const thisMonday = mondayOf(new Date());
  const buckets: WeekSummary[] = [];
  for (let i = 0; i < weeksBack; i++) {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - 7 * i);
    buckets.push({
      weekStart: monday.toISOString(),
      weekLabel: weekLabel(monday),
      additionsBySite: {},
      totalAdditions: 0,
      deletionsByStaff: {},
      totalDeletions: 0,
    });
  }

  function bucketFor(dateStr: string): WeekSummary | undefined {
    const d = new Date(dateStr);
    const monday = mondayOf(d);
    return buckets.find((b) => new Date(b.weekStart).getTime() === monday.getTime());
  }

  for (const row of additionRows.rows) {
    const bucket = bucketFor(row.created_at);
    if (!bucket) continue;
    bucket.additionsBySite[row.site] = (bucket.additionsBySite[row.site] ?? 0) + 1;
    bucket.totalAdditions += 1;
  }
  for (const row of deletionRows.rows) {
    const bucket = bucketFor(row.created_at);
    if (!bucket) continue;
    bucket.deletionsByStaff[row.staff_name] = (bucket.deletionsByStaff[row.staff_name] ?? 0) + 1;
    bucket.totalDeletions += 1;
  }

  return buckets;
}
