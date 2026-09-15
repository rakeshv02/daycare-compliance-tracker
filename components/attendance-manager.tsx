"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarClock, Upload, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { StaffMember } from "@/lib/staff";
import type { AttendanceDay, AttendancePunch, AttendanceSchedule } from "@/lib/attendance";
import {
  classifyAttendanceDay, importAttendanceCsv, matchAttendanceName, saveAttendanceSchedule,
} from "@/lib/attendance-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLASSIFICATIONS = ["", "Approved leave", "No-show", "Sick", "Vacation", "Bereavement", "Called out"];
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Props = {
  roster: StaffMember[];
  imports: { id: number; file_name: string; period_start: string; period_end: string; row_count: number; uploaded_at: string }[];
  punches: AttendancePunch[];
  schedules: AttendanceSchedule[];
  days: AttendanceDay[];
  unmatched: { imported_name: string; site: string }[];
  missing: StaffMember[];
};

export default function AttendanceManager({ roster, imports, schedules, days, unmatched, missing }: Props) {
  const [tab, setTab] = useState<"review" | "schedule" | "reconcile">("review");
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(imports[0]?.period_end.slice(0, 7) ?? "");
  const [exceptionOnly, setExceptionOnly] = useState(true);
  const [scheduleStaff, setScheduleStaff] = useState(roster[0]?.id ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const filteredDays = useMemo(() => days.filter((day) =>
    (!month || day.date.startsWith(month)) && (!exceptionOnly || day.exceptions.length || day.classification)
  ), [days, month, exceptionOnly]);

  function run(task: () => Promise<void>, success: string) {
    setMessage("");
    startTransition(() => {
      void task()
        .then(() => setMessage(success))
        .catch((error) => setMessage(error instanceof Error ? error.message : "Something went wrong."));
    });
  }

  function upload(file: File | undefined) {
    if (!file) return;
    run(async () => importAttendanceCsv(file.name, await file.text()), "Attendance imported.");
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-5 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <a href={`${BASE}/dashboard`} className="p-2 rounded-xl border border-[#E9E7DF] bg-white"><ArrowLeft size={17} /></a>
            <div>
              <h1 className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>Attendance</h1>
              <p className="text-sm text-[#6B6B64]">Monthly punches, schedules, and attendance exceptions</p>
            </div>
          </div>
          <label className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F4D47] px-4 py-2.5 text-sm font-semibold text-white cursor-pointer">
            <Upload size={16} /> Upload attendance CSV
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </header>

        {message && <div className="rounded-xl border border-[#D8D5CB] bg-white px-4 py-3 text-sm text-[#33332F]">{message}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Summary icon={<CalendarClock size={16} />} label="Latest import" value={imports[0] ? `${imports[0].period_start} – ${imports[0].period_end}` : "None"} />
          <Summary icon={<CheckCircle2 size={16} />} label="Punch rows" value={imports[0]?.row_count ?? 0} />
          <Summary icon={<AlertTriangle size={16} />} label="Unmatched names" value={unmatched.length} warn={unmatched.length > 0} />
          <Summary icon={<Users size={16} />} label="Missing from latest file" value={missing.length} warn={missing.length > 0} />
        </div>

        <nav className="flex gap-1 rounded-xl border border-[#E9E7DF] bg-white p-1 w-fit">
          {([["review","Exception review"],["schedule","Master schedule"],["reconcile","Roster matching"]] as const).map(([value,label]) => (
            <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === value ? "bg-[#1F4D47] text-white" : "text-[#6B6B64]"}`}>{label}</button>
          ))}
        </nav>

        {tab === "review" && (
          <section className="space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-[#E9E7DF] bg-white px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm text-[#6B6B64]">
                <input type="checkbox" checked={exceptionOnly} onChange={(e) => setExceptionOnly(e.target.checked)} /> Exceptions only
              </label>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[#E9E7DF] bg-white">
              <table className="w-full text-sm">
                <thead className="bg-[#F3F2ED] text-left text-xs uppercase tracking-wide text-[#6B6B64]">
                  <tr>{["Date / employee","Scheduled","Actual","Exceptions","Classification / note"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-[#EEECE5]">
                  {filteredDays.map((day) => (
                    <tr key={`${day.staffId}-${day.date}`} className="align-top">
                      <td className="px-4 py-3"><b>{day.date}</b><br />{day.staffName}<br /><span className="text-xs text-[#8A8A84]">{day.site}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap">{day.scheduledStart?.slice(0,5) ?? "—"} – {day.scheduledEnd?.slice(0,5) ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{day.firstIn?.slice(0,5) ?? "—"} – {day.lastOut?.slice(0,5) ?? "—"}</td>
                      <td className="px-4 py-3">{day.exceptions.length ? day.exceptions.map((x) => <span key={x} className="inline-block mr-1 mb-1 rounded-full bg-[#FBEAE6] text-[#A53D29] px-2 py-1 text-xs font-semibold">{x}</span>) : "None"}</td>
                      <td className="px-4 py-3 min-w-[240px]">
                        <select defaultValue={day.classification} onChange={(e) => run(() => classifyAttendanceDay(day.staffId, day.date, e.target.value, day.note), "Classification saved.")} className="w-full rounded-lg border border-[#DDDAD0] px-2 py-1.5">
                          {CLASSIFICATIONS.map((value) => <option key={value} value={value}>{value || "Not classified"}</option>)}
                        </select>
                        <input defaultValue={day.note} placeholder="Optional note" onBlur={(e) => run(() => classifyAttendanceDay(day.staffId, day.date, day.classification, e.target.value), "Note saved.")} className="mt-2 w-full rounded-lg border border-[#DDDAD0] px-2 py-1.5" />
                      </td>
                    </tr>
                  ))}
                  {!filteredDays.length && <tr><td colSpan={5} className="p-8 text-center text-[#7A7A74]">No attendance days match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "schedule" && (
          <ScheduleEditor roster={roster} schedules={schedules} staffId={scheduleStaff} setStaffId={setScheduleStaff} effectiveFrom={effectiveFrom} setEffectiveFrom={setEffectiveFrom} run={run} />
        )}

        {tab === "reconcile" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="rounded-xl border border-[#E9E7DF] bg-white p-5">
              <h2 className="font-semibold text-[#1F4D47] mb-1">New or unmatched names</h2>
              <p className="text-sm text-[#7A7A74] mb-4">Link each imported name to the correct training roster employee.</p>
              <div className="space-y-3">{unmatched.map((item) => (
                <MatchRow key={`${item.site}-${item.imported_name}`} item={item} roster={roster} run={run} />
              ))}{!unmatched.length && <p className="text-sm text-[#4A7C68]">All imported names are matched.</p>}</div>
            </section>
            <section className="rounded-xl border border-[#E9E7DF] bg-white p-5">
              <h2 className="font-semibold text-[#1F4D47] mb-1">Missing from latest upload</h2>
              <p className="text-sm text-[#7A7A74] mb-4">Active roster employees at an included site with no punches in the latest file.</p>
              <div className="space-y-2">{missing.map((person) => <div key={person.id} className="rounded-lg bg-[#FCF3E3] px-3 py-2 text-sm"><b>{person.name}</b><br /><span className="text-xs">{person.site}</span></div>)}{!missing.length && <p className="text-sm text-[#4A7C68]">No active employees are missing.</p>}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: React.ReactNode; warn?: boolean }) {
  return <div className={`rounded-xl border p-4 ${warn ? "border-[#E7C9A0] bg-[#FFF9EE]" : "border-[#E9E7DF] bg-white"}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#6B6B64]">{icon}{label}</div><div className="mt-2 font-semibold text-[#1F4D47]">{value}</div></div>;
}

function MatchRow({ item, roster, run }: { item: { imported_name: string; site: string }; roster: StaffMember[]; run: (task: () => Promise<void>, success: string) => void }) {
  const [staffId, setStaffId] = useState("");
  const options = roster.filter((person) => person.site === item.site);
  return <div className="rounded-lg border border-[#E9E7DF] p-3"><b className="text-sm">{item.imported_name}</b><div className="text-xs text-[#7A7A74] mb-2">{item.site}</div><div className="flex gap-2"><select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"><option value="">Select employee…</option>{options.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button disabled={!staffId} onClick={() => run(() => matchAttendanceName(item.imported_name, item.site, staffId), "Name matched.")} className="rounded-lg bg-[#1F4D47] px-3 text-sm font-semibold text-white disabled:opacity-40">Match</button></div></div>;
}

function ScheduleEditor({ roster, schedules, staffId, setStaffId, effectiveFrom, setEffectiveFrom, run }: {
  roster: StaffMember[]; schedules: AttendanceSchedule[]; staffId: string; setStaffId: (v: string) => void;
  effectiveFrom: string; setEffectiveFrom: (v: string) => void; run: (task: () => Promise<void>, success: string) => void;
}) {
  return <section className="rounded-xl border border-[#E9E7DF] bg-white p-5 space-y-4">
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm">Employee<select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">{roster.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.site}</option>)}</select></label>
      <label className="text-sm">Effective from<input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
    </div>
    <div className="grid md:grid-cols-2 gap-3">{DAYS.map((name, weekday) => {
      const existing = schedules.filter((s) => s.staffId === staffId && s.weekday === weekday).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      return <ScheduleDay key={`${staffId}-${weekday}-${existing?.id ?? "new"}`} name={name} weekday={weekday} staffId={staffId} effectiveFrom={effectiveFrom} existing={existing} run={run} />;
    })}</div>
  </section>;
}

function ScheduleDay({ name, weekday, staffId, effectiveFrom, existing, run }: {
  name: string; weekday: number; staffId: string; effectiveFrom: string; existing?: AttendanceSchedule;
  run: (task: () => Promise<void>, success: string) => void;
}) {
  const [workday, setWorkday] = useState(existing?.isWorkday ?? (weekday > 0 && weekday < 6));
  const [start, setStart] = useState(existing?.start?.slice(0,5) ?? "08:00");
  const [end, setEnd] = useState(existing?.end?.slice(0,5) ?? "17:00");
  return <div className="rounded-xl border border-[#E9E7DF] p-4"><div className="flex justify-between"><b>{name}</b><label className="text-xs"><input type="checkbox" checked={workday} onChange={(e) => setWorkday(e.target.checked)} /> Workday</label></div>{workday && <div className="grid grid-cols-2 gap-2 mt-3"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border px-2 py-1.5" /><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border px-2 py-1.5" /></div>}<button onClick={() => run(() => saveAttendanceSchedule(staffId, weekday, effectiveFrom, start, end, workday), `${name} schedule saved.`)} className="mt-3 w-full rounded-lg bg-[#E8F0ED] py-2 text-sm font-semibold text-[#1F4D47]">Save {name}</button>{existing && <p className="mt-2 text-xs text-[#8A8A84]">Current version effective {existing.effectiveFrom}</p>}</div>;
}