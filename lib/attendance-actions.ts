"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import pool from "./db";
import { authOptions } from "./auth";
import { isIgnoredAttendanceName, normalizeAttendanceName } from "./attendance";
import { STAFF_BASE } from "./staff";

async function requireDirector() {
  const session = await getServerSession(authOptions);
  if (session?.user?.site !== "all") throw new Error("Only the director can manage attendance.");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Invalid attendance date: ${value}`);
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) throw new Error(`Invalid attendance time: ${value}`);
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}:00`;
}

export async function importAttendanceCsv(fileName: string, text: string) {
  await requireDirector();
  const csv = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = csv.shift()?.map((value) => value.trim()) ?? [];
  const expected = ["Date", "Time", "Attendance Status", "Site", "Name"];
  if (expected.some((header) => !headers.includes(header))) throw new Error(`CSV must contain: ${expected.join(", ")}`);
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const rows = csv.map((values, rowIndex) => ({
    sourceRow: rowIndex + 2,
    date: parseDate(values[index.Date] ?? ""),
    time: parseTime(values[index.Time] ?? ""),
    status: (values[index["Attendance Status"]] ?? "").trim(),
    site: (values[index.Site] ?? "").trim(),
    name: (values[index.Name] ?? "").trim(),
  })).filter((row) => !isIgnoredAttendanceName(row.name));
  if (!rows.length) throw new Error("The CSV contains no employee attendance rows.");
  if (rows.some((row) => !["In", "Out"].includes(row.status) || !row.site || !row.name)) throw new Error("The CSV contains an invalid status, site, or employee name.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dbStaff = await client.query<{ id: string; name: string; site: string }>(
      "SELECT id,name,site FROM staff_members",
    );
    const roster = [
      ...STAFF_BASE.map((person) => ({ id: person.id, name: person.name, site: person.site })),
      ...dbStaff.rows,
    ];
    const importResult = await client.query<{ id: string }>(
      `INSERT INTO attendance_imports(file_name, period_start, period_end, row_count)
       VALUES($1, $2, $3, $4) RETURNING id`,
      [fileName, rows.map((r) => r.date).sort()[0], rows.map((r) => r.date).sort().at(-1), rows.length],
    );
    const importId = importResult.rows[0].id;
    for (const row of rows) {
      const normalized = normalizeAttendanceName(row.name);
      const exactMatches = roster.filter(
        (person) => person.site === row.site && normalizeAttendanceName(person.name) === normalized,
      );
      const automaticStaffId = exactMatches.length === 1 ? exactMatches[0].id : null;
      await client.query(
        `INSERT INTO attendance_punches
          (import_id, source_row, work_date, punch_time, punch_status, site, imported_name, normalized_name, staff_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,
           COALESCE((SELECT staff_id FROM attendance_name_matches WHERE normalized_name=$8 AND site=$6),$9))`,
        [importId, row.sourceRow, row.date, row.time, row.status, row.site, row.name, normalized, automaticStaffId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  revalidatePath("/dashboard/attendance");
}

export async function matchAttendanceName(importedName: string, site: string, staffId: string) {
  await requireDirector();
  const normalized = normalizeAttendanceName(importedName);
  await pool.query(
    `INSERT INTO attendance_name_matches(normalized_name, site, imported_name, staff_id)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(normalized_name,site) DO UPDATE SET imported_name=$3, staff_id=$4, updated_at=NOW()`,
    [normalized, site, importedName, staffId],
  );
  await pool.query(
    `UPDATE attendance_punches SET staff_id=$3
     WHERE normalized_name=$1 AND site=$2`,
    [normalized, site, staffId],
  );
  revalidatePath("/dashboard/attendance");
}

export async function saveAttendanceSchedule(
  staffId: string, weekday: number, effectiveFrom: string, start: string, end: string, isWorkday: boolean,
) {
  await requireDirector();
  if (weekday < 0 || weekday > 6 || !effectiveFrom) throw new Error("Invalid schedule.");
  if (isWorkday && (!start || !end || start >= end)) throw new Error("A workday needs a valid start and end time.");
  await pool.query(
    `INSERT INTO attendance_schedules(staff_id,weekday,effective_from,scheduled_start,scheduled_end,is_workday)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(staff_id,weekday,effective_from) DO UPDATE SET
       scheduled_start=$4, scheduled_end=$5, is_workday=$6, updated_at=NOW()`,
    [staffId, weekday, effectiveFrom, isWorkday ? start : null, isWorkday ? end : null, isWorkday],
  );
  revalidatePath("/dashboard/attendance");
}

export async function saveWeekdayAttendanceSchedule(
  staffId: string,
  effectiveFrom: string,
  start: string,
  end: string,
) {
  await requireDirector();
  if (!staffId || !effectiveFrom || !start || !end || start >= end) {
    throw new Error("Choose an employee, effective date, and valid start and end times.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let weekday = 1; weekday <= 5; weekday++) {
      await client.query(
        `INSERT INTO attendance_schedules
          (staff_id,weekday,effective_from,scheduled_start,scheduled_end,is_workday)
         VALUES($1,$2,$3,$4,$5,true)
         ON CONFLICT(staff_id,weekday,effective_from) DO UPDATE SET
           scheduled_start=$4,scheduled_end=$5,is_workday=true,updated_at=NOW()`,
        [staffId, weekday, effectiveFrom, start, end],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  revalidatePath("/dashboard/attendance");
}

export async function classifyAttendanceDay(staffId: string, date: string, classification: string, note: string) {
  await requireDirector();
  const allowed = ["", "Approved leave", "No-show", "Sick", "Vacation", "Bereavement", "Called out"];
  if (!allowed.includes(classification)) throw new Error("Invalid absence classification.");
  if (!classification) {
    await pool.query("DELETE FROM attendance_day_classifications WHERE staff_id=$1 AND work_date=$2", [staffId, date]);
  } else {
    await pool.query(
      `INSERT INTO attendance_day_classifications(staff_id,work_date,classification,note)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(staff_id,work_date) DO UPDATE SET classification=$3,note=$4,updated_at=NOW()`,
      [staffId, date, classification, note.trim()],
    );
  }
  revalidatePath("/dashboard/attendance");
}