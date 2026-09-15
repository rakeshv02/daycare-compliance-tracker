"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, KeyRound, Search, X } from "lucide-react";
import type { StaffMember } from "@/lib/staff";
import type { LeaveRequest } from "@/lib/leave";
import { leaveDaysInYear, weekdaysInclusive } from "@/lib/leave";
import { decideLeaveRequest, saveStaffPortalAccess, setPaidVacation } from "@/lib/leave-actions";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function LeaveAdminManager({ roster, requests, enabledStaffIds, employeeIds }: {
  roster: StaffMember[]; requests: LeaveRequest[]; enabledStaffIds: string[]; employeeIds: Record<string, string>;
}) {
  const [tab, setTab] = useState<"requests" | "calendar" | "summary" | "history" | "access">("requests");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const pending = requests.filter((request) => request.status === "Pending").length;
  const pendingRequests = requests.filter((request) => request.status === "Pending");
  const filteredRoster = useMemo(() => roster.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()) || (employeeIds[person.id] ?? "").toLowerCase().includes(query.toLowerCase())), [roster, query, employeeIds]);
  function run(task: () => Promise<void>, success: string) {
    setMessage("");
    startTransition(() => void task().then(() => setMessage(success)).catch((error) => setMessage(error instanceof Error ? error.message : "Something went wrong.")));
  }
  return (
    <main className="min-h-screen bg-[#FAFAF7] p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-center gap-3">
          <a href={`${BASE}/dashboard`} className="rounded-xl border bg-white p-2"><ArrowLeft size={18} /></a>
          <div><h1 className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>Staff leave management</h1><p className="text-sm text-[#74746E]">{pending} request{pending === 1 ? "" : "s"} awaiting review</p></div>
        </header>
        {message && <div className="rounded-xl border border-[#D8D5CB] bg-white p-3 text-sm">{message}</div>}
        <nav className="flex w-fit gap-1 rounded-xl border bg-white p-1">
          <button onClick={() => setTab("requests")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "requests" ? "bg-[#1F4D47] text-white" : "text-[#66665F]"}`}>Pending requests ({pending})</button>
          <button onClick={() => setTab("calendar")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "calendar" ? "bg-[#1F4D47] text-white" : "text-[#66665F]"}`}>Leave calendar</button>
          <button onClick={() => setTab("summary")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "summary" ? "bg-[#1F4D47] text-white" : "text-[#66665F]"}`}>Leave summary</button>
          <button onClick={() => setTab("history")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "history" ? "bg-[#1F4D47] text-white" : "text-[#66665F]"}`}>Leave history</button>
          <button onClick={() => setTab("access")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "access" ? "bg-[#1F4D47] text-white" : "text-[#66665F]"}`}>Employee IDs & PINs</button>
        </nav>
        {tab === "requests" && <div className="space-y-3">{pendingRequests.map((request) => <AdminRequest key={request.id} request={request} busy={busy} run={run} />)}{!pendingRequests.length && <Empty text="No leave requests are awaiting review." />}</div>}
        {tab === "calendar" && <LeaveCalendar requests={requests} />}
        {tab === "summary" && <LeaveSummary roster={roster} requests={requests} year={year} setYear={setYear} />}
        {tab === "history" && <LeaveHistory requests={requests} year={year} setYear={setYear} busy={busy} run={run} />}
        {tab === "access" && <section className="rounded-2xl border border-[#E4E1D8] bg-white p-4 sm:p-5">
          <div className="mb-4"><h2 className="font-semibold text-[#1F4D47]">Employee portal access</h2><p className="text-sm text-[#74746E]">Create a unique Employee ID. On first login, the employee creates their own private PIN. Enter a new PIN here only when you need to reset it.</p></div>
          <div className="relative mb-4 max-w-sm"><Search className="absolute left-3 top-3 text-[#999991]" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee or ID" className="w-full rounded-xl border py-2.5 pl-9 pr-3" /></div>
          <div className="divide-y">{filteredRoster.map((person) => <AccessRow key={person.id} person={person} employeeId={employeeIds[person.id] ?? ""} enabled={enabledStaffIds.includes(person.id)} />)}</div>
        </section>}
      </div>
    </main>
  );
}

function LeaveCalendar({ requests }: { requests: LeaveRequest[] }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const calendarDays: Array<number | null> = [
    ...Array.from({ length: firstDay.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarDays.length % 7) calendarDays.push(null);
  const visibleRequests = requests.filter((request) => request.status === "Pending" || request.status === "Approved");
  function dateValue(day: number) {
    return `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function requestsForDay(day: number) {
    const date = dateValue(day);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if (weekday === 0 || weekday === 6) return [];
    return visibleRequests.filter((request) => request.dateFrom <= date && request.dateTo >= date);
  }
  function changeMonth(offset: number) {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }
  const activeDays = Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => ({
    day,
    requests: requestsForDay(day),
    peopleOut: new Set(requestsForDay(day).map((request) => request.staffId)).size,
  }));
  const peak = activeDays.reduce((best, current) => current.peopleOut > best.peopleOut ? current : best, { day: 0, requests: [] as LeaveRequest[], peopleOut: 0 });
  const leaveDaysShown = activeDays.reduce((total, day) => total + day.requests.length, 0);
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return <section className="rounded-2xl border border-[#E4E1D8] bg-white p-4 sm:p-5">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="font-semibold text-[#1F4D47]">Monthly staffing calendar</h2><p className="text-sm text-[#74746E]">Pending and approved weekday leave. Denied and cancelled requests are excluded.</p></div>
      <div className="flex items-center gap-2">
        <button aria-label="Previous month" onClick={() => changeMonth(-1)} className="rounded-xl border p-2 text-[#1F4D47]"><ChevronLeft size={18} /></button>
        <input aria-label="Calendar month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
        <button aria-label="Next month" onClick={() => changeMonth(1)} className="rounded-xl border p-2 text-[#1F4D47]"><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-[#F4F3EE] p-3"><div className="text-xs font-semibold uppercase text-[#74746E]">Month</div><div className="mt-1 font-semibold text-[#1F4D47]">{monthLabel}</div></div>
      <div className="rounded-xl bg-[#EAF5F0] p-3"><div className="text-xs font-semibold uppercase text-[#4A7568]">Leave days shown</div><div className="mt-1 font-semibold text-[#1F4D47]">{leaveDaysShown}</div></div>
      <div className="rounded-xl bg-[#FCF3E3] p-3"><div className="text-xs font-semibold uppercase text-[#8C6217]">Most people out</div><div className="mt-1 font-semibold text-[#6F4B0E]">{peak.peopleOut ? `${peak.peopleOut} on ${monthNumber}/${peak.day}` : "None"}</div></div>
    </div>
    <div className="mb-3 flex flex-wrap gap-3 text-xs"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#2F725D]" /> Approved</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#C28A24]" /> Pending</span></div>
    <div className="overflow-x-auto rounded-xl border border-[#E4E1D8]">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-7 border-b bg-[#F4F3EE]">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => <div key={day} className="px-3 py-2 text-center text-xs font-semibold uppercase text-[#74746E]">{day}</div>)}</div>
        <div className="grid grid-cols-7">{calendarDays.map((day, index) => {
          const dayRequests = day ? requestsForDay(day) : [];
          const peopleOut = new Set(dayRequests.map((request) => request.staffId)).size;
          return <div key={`${day ?? "empty"}-${index}`} className={`min-h-36 border-b border-r p-2 ${day ? "bg-white" : "bg-[#FAFAF7]"} ${index % 7 === 6 ? "border-r-0" : ""}`}>
            {day && <><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-[#55554F]">{day}</span>{peopleOut > 0 && <span className="rounded-full bg-[#1F4D47] px-2 py-0.5 text-[11px] font-semibold text-white">{peopleOut} out</span>}</div><div className="space-y-1.5">{dayRequests.map((request) => <div key={request.id} className={`rounded-lg border-l-4 px-2 py-1.5 text-xs ${request.status === "Approved" ? "border-[#2F725D] bg-[#EAF5F0]" : "border-[#C28A24] bg-[#FCF3E3]"}`}><div className="font-semibold text-[#33332F]">{request.staffName}</div><div className="truncate text-[11px] text-[#66665F]">{request.site} · {request.status}</div></div>)}</div></>}
          </div>;
        })}</div>
      </div>
    </div>
  </section>;
}

function AdminRequest({ request, busy, run }: { request: LeaveRequest; busy: boolean; run: (task: () => Promise<void>, success: string) => void }) {
  const [note, setNote] = useState(request.directorNote);
  const [paidVacation, setPaidVacationChoice] = useState(request.isPaidVacation);
  return <article className="rounded-2xl border border-[#E4E1D8] bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-[#1F4D47]">{request.staffName}</h2><span className="rounded-full bg-[#F1F0EA] px-2 py-1 text-xs">{request.site}</span><span className="rounded-full bg-[#FCF3E3] px-2 py-1 text-xs font-semibold">{request.status}</span></div><p className="mt-2 text-sm"><b>{request.isPaidVacation ? "Paid vacation" : request.leaveType}</b> · {request.dateFrom} through {request.dateTo} · {weekdaysInclusive(request.dateFrom, request.dateTo)} weekdays</p>{request.reason && <p className="mt-2 text-sm text-[#55554F]">{request.reason}</p>}</div>{request.status === "Pending" && <div className="flex gap-2"><button disabled={busy} onClick={() => run(() => decideLeaveRequest(request.id, "Approved", note, paidVacation), paidVacation ? "Paid vacation approved." : "Request approved.")} className="flex items-center gap-1 rounded-xl bg-[#EAF5F0] px-3 py-2 text-sm font-semibold text-[#2F725D]"><Check size={15} /> Approve</button><button disabled={busy} onClick={() => run(() => decideLeaveRequest(request.id, "Denied", note), "Request denied.")} className="flex items-center gap-1 rounded-xl bg-[#FBEAE6] px-3 py-2 text-sm font-semibold text-[#A33D28]"><X size={15} /> Deny</button></div>}</div>{request.status === "Pending" ? <><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for employee" rows={2} className="mt-4 w-full rounded-xl border px-3 py-2 text-sm" />{(request.leaveType === "Vacation" || request.leaveType === "Paid vacation") && <label className="mt-3 flex items-center gap-2 rounded-xl border border-[#D8D5CB] bg-[#FAFAF7] px-3 py-3 text-sm font-semibold text-[#1F4D47]"><input type="checkbox" checked={paidVacation} onChange={(event) => setPaidVacationChoice(event.target.checked)} /> Approve as paid vacation</label>}</> : <>{request.directorNote && <p className="mt-3 rounded-lg bg-[#F4F3EE] p-2 text-sm"><b>Director note:</b> {request.directorNote}</p>}{request.status === "Approved" && (request.leaveType === "Vacation" || request.leaveType === "Paid vacation") && <label className="mt-4 flex items-center gap-2 rounded-xl border border-[#D8D5CB] bg-[#FAFAF7] px-3 py-3 text-sm font-semibold text-[#1F4D47]"><input type="checkbox" checked={request.isPaidVacation} disabled={busy} onChange={(event) => run(() => setPaidVacation(request.id, event.target.checked).then((result) => { if (result.error) throw new Error(result.error); }), event.target.checked ? "Vacation marked as paid." : "Paid vacation removed.")} /> Paid vacation</label>}</>}</article>;
}

function LeaveSummary({ roster, requests, year, setYear }: { roster: StaffMember[]; requests: LeaveRequest[]; year: number; setYear: (year: number) => void }) {
  const [selectedStaffId, setSelectedStaffId] = useState("all");
  const years = Array.from(new Set([new Date().getFullYear(), ...requests.flatMap((request) => [Number(request.dateFrom.slice(0, 4)), Number(request.dateTo.slice(0, 4))])])).sort((a, b) => b - a);
  const rows = roster.filter((person) => selectedStaffId === "all" || person.id === selectedStaffId).map((person) => {
    const own = requests.filter((request) => request.staffId === person.id);
    const approved = own.filter((request) => request.status === "Approved");
    const days = (items: LeaveRequest[]) => items.reduce((sum, request) => sum + leaveDaysInYear(request, year), 0);
    return {
      person,
      approved: days(approved),
      paid: days(approved.filter((request) => request.isPaidVacation)),
      vacation: days(approved.filter((request) => request.leaveType === "Vacation" || request.leaveType === "Paid vacation")),
      medical: days(approved.filter((request) => request.leaveType === "Medical")),
      sick: days(approved.filter((request) => request.leaveType === "Sick")),
      other: days(approved.filter((request) => !["Vacation", "Paid vacation", "Medical", "Sick"].includes(request.leaveType))),
      pending: own.filter((request) => request.status === "Pending").length,
    };
  });
  return <section className="rounded-2xl border border-[#E4E1D8] bg-white p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold text-[#1F4D47]">Employee leave summary</h2><p className="text-sm text-[#74746E]">Approved weekday totals by employee</p></div><div className="mb-4 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_140px]"><label className="text-sm text-[#55554F]">Employee<select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} className="mt-1 block w-full rounded-xl border px-3 py-2.5"><option value="all">All employees</option>{roster.map((person) => <option key={person.id} value={person.id}>{person.name} — {person.site}</option>)}</select></label><label className="text-sm text-[#55554F]">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block w-full rounded-xl border px-3 py-2.5">{years.map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-[#FAFAF7] text-xs uppercase text-[#74746E]"><tr><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Approved</th><th className="px-3 py-3">Paid vacation</th><th className="px-3 py-3">Vacation</th><th className="px-3 py-3">Medical</th><th className="px-3 py-3">Sick</th><th className="px-3 py-3">Other</th><th className="px-3 py-3">Pending</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.person.id}><td className="px-3 py-3"><b>{row.person.name}</b><div className="text-xs text-[#74746E]">{row.person.site}</div></td><td className="px-3 py-3 font-semibold">{row.approved}</td><td className="px-3 py-3">{row.paid}</td><td className="px-3 py-3">{row.vacation}</td><td className="px-3 py-3">{row.medical}</td><td className="px-3 py-3">{row.sick}</td><td className="px-3 py-3">{row.other}</td><td className="px-3 py-3">{row.pending}</td></tr>)}</tbody></table></div></section>;
}

function LeaveHistory({ requests, year, setYear, busy, run }: {
  requests: LeaveRequest[];
  year: number;
  setYear: (year: number) => void;
  busy: boolean;
  run: (task: () => Promise<void>, success: string) => void;
}) {
  const years = Array.from(new Set([new Date().getFullYear(), ...requests.flatMap((request) => [Number(request.dateFrom.slice(0, 4)), Number(request.dateTo.slice(0, 4))])])).sort((a, b) => b - a);
  const history = requests.filter((request) => request.status !== "Pending" && request.dateFrom.slice(0, 4) <= String(year) && request.dateTo.slice(0, 4) >= String(year));
  return <section className="rounded-2xl border border-[#E4E1D8] bg-white p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#1F4D47]">Leave history</h2><p className="text-sm text-[#74746E]">Approved, denied, and cancelled requests</p></div><select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-xl border px-3 py-2">{years.map((value) => <option key={value}>{value}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-[#FAFAF7] text-xs uppercase text-[#74746E]"><tr><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Leave</th><th className="px-3 py-3">Dates</th><th className="px-3 py-3">Days</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Paid vacation</th></tr></thead><tbody className="divide-y">{history.map((request) => <tr key={request.id}><td className="px-3 py-3"><b>{request.staffName}</b><div className="text-xs text-[#74746E]">{request.site}</div></td><td className="px-3 py-3">{request.isPaidVacation ? "Paid vacation" : request.leaveType}</td><td className="px-3 py-3">{request.dateFrom}<br />{request.dateTo}</td><td className="px-3 py-3">{weekdaysInclusive(request.dateFrom, request.dateTo)}</td><td className="px-3 py-3">{request.status}</td><td className="px-3 py-3">{request.status === "Approved" && (request.leaveType === "Vacation" || request.leaveType === "Paid vacation") ? <input aria-label={`Paid vacation for ${request.staffName}`} type="checkbox" checked={request.isPaidVacation} disabled={busy} onChange={(event) => run(() => setPaidVacation(request.id, event.target.checked).then((result) => { if (result.error) throw new Error(result.error); }), event.target.checked ? "Vacation marked as paid." : "Paid vacation removed.")} /> : "—"}</td></tr>)}{!history.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-[#74746E]">No leave history for {year}.</td></tr>}</tbody></table></div></section>;
}
function AccessRow({ person, employeeId: initialEmployeeId, enabled }: { person: StaffMember; employeeId: string; enabled: boolean }) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState("");
  const [saving, startSaving] = useTransition();
  function save() {
    setStatus("");
    startSaving(() => void saveStaffPortalAccess(person.id, employeeId, pin)
      .then((result) => {
        if (result.error) {
          setStatus(result.error);
          return;
        }
        setPin("");
        setStatus("Saved");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not save.")));
  }
  return <div className="py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><div className="min-w-0 flex-1"><b className="text-sm">{person.name}</b><p className="text-xs text-[#74746E]">{person.site} · {enabled ? "PIN active" : employeeId ? "Employee creates PIN at first login" : "Employee ID needed"}</p></div><label className="text-xs text-[#55554F]">Employee ID<input value={employeeId} onChange={(e) => { setEmployeeId(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0,20)); setStatus(""); }} placeholder="Example: 10024" className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm lg:w-44" /></label><label className="text-xs text-[#55554F]">Reset PIN (optional)<input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0,8)); setStatus(""); }} inputMode="numeric" type="password" placeholder={enabled ? "Leave empty" : "Employee will create it"} className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm lg:w-40" /></label><button disabled={saving || employeeId.length < 3 || (!!pin && pin.length < 4)} onClick={save} className="flex items-center justify-center gap-1 rounded-xl bg-[#1F4D47] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><KeyRound size={14} /> {saving ? "Saving…" : "Save"}</button></div>{status && <p className={`mt-2 text-xs font-semibold ${status === "Saved" ? "text-[#2F725D]" : "text-[#A33D28]"}`}>{status}</p>}</div>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-[#E4E1D8] bg-white p-8 text-center text-sm text-[#74746E]">{text}</div>; }