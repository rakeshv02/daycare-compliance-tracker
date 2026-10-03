"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, LogOut, Palmtree, Plus, X } from "lucide-react";
import type { StaffMember } from "@/lib/staff";
import type { LeaveDuration, LeaveRequest } from "@/lib/leave";
import { LEAVE_DURATIONS, LEAVE_TYPES, formatLeaveAmount, leaveDurationLabel, parseLeaveSubmission } from "@/lib/leave";
import { cancelLeaveRequest, staffLeaveLogout, submitLeaveRequest } from "@/lib/leave-actions";

type Summary = {
  year: number; approvedDaysTaken: number; paidVacationTaken: number; pendingDays: number;
  approvedHoursTaken: number; paidVacationHoursTaken: number; pendingHours: number;
  lateDates: { date: string; scheduled: string | null; actual: string | null }[]; missingDates: string[];
};

export default function StaffLeavePortal({ staff, requests, summaries }: { staff: StaffMember; requests: LeaveRequest[]; summaries: Summary[] }) {
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [year, setYear] = useState(summaries[0]?.year ?? new Date().getFullYear());
  const [busy, startTransition] = useTransition();
  const summary = summaries.find((item) => item.year === year) ?? summaries[0];
  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-12">
      <header className="bg-[#1F4D47] px-4 py-5 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div><p className="text-xs text-[#C5D8D3]">Staff leave portal</p><h1 className="text-xl font-semibold">{staff.name}</h1><p className="text-xs text-[#C5D8D3]">{staff.site} · {staff.id}</p></div>
          <form action={staffLeaveLogout}><button className="rounded-xl p-2 hover:bg-white/10" aria-label="Sign out"><LogOut size={20} /></button></form>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold text-[#1F4D47]">My yearly summary</h2><p className="text-sm text-[#74746E]">Your records only</p></div>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-[#DDDAD0] bg-white px-3 py-2">{summaries.map((item) => <option key={item.year}>{item.year}</option>)}</select>
        </div>
        {summary && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<CalendarDays />} label="Approved leave taken" value={formatLeaveAmount(summary.approvedDaysTaken, summary.approvedHoursTaken)} />
          <Stat icon={<Palmtree />} label="Paid vacation taken" value={formatLeaveAmount(summary.paidVacationTaken, summary.paidVacationHoursTaken)} />
          <Stat icon={<Clock3 />} label="Late arrivals" value={summary.lateDates.length} />
          <Stat icon={<CalendarDays />} label="Missing scheduled days" value={summary.missingDates.length} alert={summary.missingDates.length > 0} />
        </div>}
        {summary && <div className="grid gap-4 md:grid-cols-2">
          <DetailCard title="Late-arrival dates" empty="No late arrivals recorded.">{summary.lateDates.map((item) => <div key={item.date} className="flex justify-between border-b py-2 text-sm"><span>{item.date}</span><span>{item.scheduled?.slice(0,5) ?? "—"} scheduled · {item.actual?.slice(0,5) ?? "—"} arrived</span></div>)}</DetailCard>
          <DetailCard title="Missing scheduled dates" empty="No unresolved missing days.">{summary.missingDates.map((date) => <div key={date} className="border-b py-2 text-sm">{date}</div>)}</DetailCard>
        </div>}
        <section>
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[#1F4D47]">My leave requests</h2><p className="text-sm text-[#74746E]">{formatLeaveAmount(summary?.pendingDays ?? 0, summary?.pendingHours ?? 0)} currently pending</p></div><button onClick={() => { setNotice(""); setShowForm(true); }} className="flex items-center gap-2 rounded-xl bg-[#E0A732] px-4 py-2.5 text-sm font-semibold text-[#25251F]"><Plus size={16} /> Request leave</button></div>
          {notice && <p role="status" className="mb-3 rounded-xl border border-[#B7DBC7] bg-[#EAF5F0] px-4 py-3 text-sm text-[#1F4D47]">{notice}</p>}
          <div className="space-y-3">{requests.map((request) => <RequestCard key={request.id} request={request} busy={busy} cancel={() => startTransition(() => void cancelLeaveRequest(request.id))} />)}{!requests.length && <div className="rounded-2xl border border-[#E4E1D8] bg-white p-8 text-center text-sm text-[#74746E]">No leave requests yet.</div>}</div>
        </section>
      </div>
      {showForm && <RequestModal close={() => setShowForm(false)} submitted={() => { setShowForm(false); setNotice("Leave request submitted. It is now pending review."); }} />}
    </main>
  );
}

function Stat({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number | string; alert?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${alert ? "border-[#E8C19D] bg-[#FFF8EC]" : "border-[#E4E1D8] bg-white"}`}><div className="mb-3 text-[#4A7F72]">{icon}</div><div className="text-3xl font-semibold text-[#1F4D47]">{value}</div><div className="mt-1 text-xs text-[#74746E]">{label}</div></div>;
}
function DetailCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <div className="rounded-2xl border border-[#E4E1D8] bg-white p-4"><h3 className="font-semibold text-[#33332F]">{title}</h3><div className="mt-2 max-h-56 overflow-auto">{children.length ? children : <p className="py-4 text-sm text-[#74746E]">{empty}</p>}</div></div>;
}
function RequestCard({ request, busy, cancel }: { request: LeaveRequest; busy: boolean; cancel: () => void }) {
  const colors: Record<string,string> = { Pending: "bg-[#FCF3E3] text-[#8C6217]", Approved: "bg-[#EAF5F0] text-[#2F725D]", Denied: "bg-[#FBEAE6] text-[#A33D28]", Cancelled: "bg-[#EFEFEB] text-[#74746E]" };
  return <div className="rounded-2xl border border-[#E4E1D8] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><b>{request.isPaidVacation ? "Paid vacation" : request.leaveType}</b><p className="text-sm text-[#55554F]">{request.dateFrom}{request.dateTo !== request.dateFrom ? ` through ${request.dateTo}` : ""}</p><p className="mt-1 text-sm text-[#55554F]">{leaveDurationLabel(request)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[request.status]}`}>{request.status}</span></div>{request.reason && <p className="mt-3 text-sm">{request.reason}</p>}{request.directorNote && <p className="mt-3 rounded-lg bg-[#F4F3EE] p-2 text-sm"><b>Director note:</b> {request.directorNote}</p>}{request.status === "Pending" && <button disabled={busy} onClick={cancel} className="mt-3 text-xs font-semibold text-[#A33D28]">Cancel request</button>}</div>;
}
function RequestModal({ close, submitted }: { close: () => void; submitted: () => void }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duration, setDuration] = useState<LeaveDuration>("Full day");
  const [dateFrom, setDateFrom] = useState("");
  const partial = duration !== "Full day";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const formData = new FormData(event.currentTarget);
      parseLeaveSubmission(formData);
      const result = await submitLeaveRequest(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        submitted();
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit your request. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4">
    <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="leave-request-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-2xl">
      <div className="mb-5 flex items-center justify-between"><h2 id="leave-request-title" className="text-xl font-semibold text-[#1F4D47]">Request leave</h2><button type="button" onClick={close} disabled={busy} aria-label="Close"><X /></button></div>
      <div className="space-y-4">
        <label className="block text-sm">Leave type<select name="leaveType" required disabled={busy} className="mt-1 w-full rounded-xl border px-3 py-3">{LEAVE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="block text-sm">Duration<select name="duration" value={duration} onChange={(event) => { setDuration(event.target.value as LeaveDuration); setError(""); }} disabled={busy} className="mt-1 w-full rounded-xl border px-3 py-3">{LEAVE_DURATIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <div className={`grid gap-3 ${partial ? "" : "grid-cols-2"}`}>
          <label className="text-sm">{partial ? "Date" : "From"}<input name="dateFrom" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} required disabled={busy} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
          {partial ? <input name="dateTo" type="hidden" value={dateFrom} /> : <label className="text-sm">To<input name="dateTo" type="date" min={dateFrom || undefined} required disabled={busy} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>}
        </div>
        {partial && <div className="space-y-2 rounded-xl border border-[#D8D5CB] bg-[#FAFAF7] p-3">
          <p className="text-sm text-[#55554F]">Enter the time you will be off, not your working hours.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Start time<input name="startTime" type="time" required disabled={busy} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
            <label className="text-sm">End time<input name="endTime" type="time" required disabled={busy} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
          </div>
          <p className="text-xs text-[#74746E]">{duration === "Half day" ? "Counts as 0.5 day. Your selected times will be shown to the director." : "Recorded in hours using your selected times."}</p>
        </div>}
        <label className="block text-sm">Reason or note<textarea name="reason" rows={3} disabled={busy} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
        {error && <p role="alert" className="text-sm text-[#A33D28]">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-[#1F4D47] py-3 font-semibold text-white disabled:opacity-60">{busy ? "Submitting…" : "Submit request"}</button>
      </div>
    </form>
  </div>;
}