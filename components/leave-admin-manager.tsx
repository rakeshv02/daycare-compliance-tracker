"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Check, KeyRound, Search, X } from "lucide-react";
import type { StaffMember } from "@/lib/staff";
import type { LeaveRequest } from "@/lib/leave";
import { weekdaysInclusive } from "@/lib/leave";
import { decideLeaveRequest, saveStaffPortalAccess, setPaidVacation } from "@/lib/leave-actions";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function LeaveAdminManager({ roster, requests, enabledStaffIds, employeeIds }: {
  roster: StaffMember[]; requests: LeaveRequest[]; enabledStaffIds: string[]; employeeIds: Record<string, string>;
}) {
  const [tab, setTab] = useState<"requests" | "access">("requests");
  const [query, setQuery] = useState("");
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const pending = requests.filter((request) => request.status === "Pending").length;
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
          <button onClick={() => setTab("requests")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "requests" ? "bg-[#1F4D47] text-white" : "text-[#66665F]"}`}>Leave requests</button>
          <button onClick={() => setTab("access")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "access" ? "bg-[#1F4D47] text-white" : "text-[#66665F]"}`}>Employee IDs & PINs</button>
        </nav>
        {tab === "requests" && <div className="space-y-3">{requests.map((request) => <AdminRequest key={request.id} request={request} busy={busy} run={run} />)}{!requests.length && <Empty text="No leave requests have been submitted." />}</div>}
        {tab === "access" && <section className="rounded-2xl border border-[#E4E1D8] bg-white p-4 sm:p-5">
          <div className="mb-4"><h2 className="font-semibold text-[#1F4D47]">Employee portal access</h2><p className="text-sm text-[#74746E]">Create a unique Employee ID. On first login, the employee creates their own private PIN. Enter a new PIN here only when you need to reset it.</p></div>
          <div className="relative mb-4 max-w-sm"><Search className="absolute left-3 top-3 text-[#999991]" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee or ID" className="w-full rounded-xl border py-2.5 pl-9 pr-3" /></div>
          <div className="divide-y">{filteredRoster.map((person) => <AccessRow key={person.id} person={person} employeeId={employeeIds[person.id] ?? ""} enabled={enabledStaffIds.includes(person.id)} />)}</div>
        </section>}
      </div>
    </main>
  );
}

function AdminRequest({ request, busy, run }: { request: LeaveRequest; busy: boolean; run: (task: () => Promise<void>, success: string) => void }) {
  const [note, setNote] = useState(request.directorNote);
  return <article className="rounded-2xl border border-[#E4E1D8] bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-[#1F4D47]">{request.staffName}</h2><span className="rounded-full bg-[#F1F0EA] px-2 py-1 text-xs">{request.site}</span><span className="rounded-full bg-[#FCF3E3] px-2 py-1 text-xs font-semibold">{request.status}</span></div><p className="mt-2 text-sm"><b>{request.isPaidVacation ? "Paid vacation" : request.leaveType}</b> · {request.dateFrom} through {request.dateTo} · {weekdaysInclusive(request.dateFrom, request.dateTo)} weekdays</p>{request.reason && <p className="mt-2 text-sm text-[#55554F]">{request.reason}</p>}</div>{request.status === "Pending" && <div className="flex gap-2"><button disabled={busy} onClick={() => run(() => decideLeaveRequest(request.id, "Approved", note), "Request approved.")} className="flex items-center gap-1 rounded-xl bg-[#EAF5F0] px-3 py-2 text-sm font-semibold text-[#2F725D]"><Check size={15} /> Approve</button><button disabled={busy} onClick={() => run(() => decideLeaveRequest(request.id, "Denied", note), "Request denied.")} className="flex items-center gap-1 rounded-xl bg-[#FBEAE6] px-3 py-2 text-sm font-semibold text-[#A33D28]"><X size={15} /> Deny</button></div>}</div>{request.status === "Pending" ? <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for employee" rows={2} className="mt-4 w-full rounded-xl border px-3 py-2 text-sm" /> : <>{request.directorNote && <p className="mt-3 rounded-lg bg-[#F4F3EE] p-2 text-sm"><b>Director note:</b> {request.directorNote}</p>}{request.status === "Approved" && (request.leaveType === "Vacation" || request.leaveType === "Paid vacation") && <label className="mt-4 flex items-center gap-2 rounded-xl border border-[#D8D5CB] bg-[#FAFAF7] px-3 py-3 text-sm font-semibold text-[#1F4D47]"><input type="checkbox" checked={request.isPaidVacation} disabled={busy} onChange={(event) => run(() => setPaidVacation(request.id, event.target.checked).then((result) => { if (result.error) throw new Error(result.error); }), event.target.checked ? "Vacation marked as paid." : "Paid vacation removed.")} /> Paid vacation</label>}</>}</article>;
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