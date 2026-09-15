"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Clock3, LogOut, Palmtree, Plus, X } from "lucide-react";
import type { StaffMember } from "@/lib/staff";
import type { LeaveRequest } from "@/lib/leave";
import { LEAVE_TYPES, weekdaysInclusive } from "@/lib/leave";
import { cancelLeaveRequest, staffLeaveLogout, submitLeaveRequest } from "@/lib/leave-actions";

type Summary = {
  year: number; approvedDaysTaken: number; paidVacationTaken: number; pendingDays: number;
  lateDates: { date: string; scheduled: string | null; actual: string | null }[]; missingDates: string[];
};

export default function StaffLeavePortal({ staff, requests, summaries }: { staff: StaffMember; requests: LeaveRequest[]; summaries: Summary[] }) {
  const [showForm, setShowForm] = useState(false);
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
          <Stat icon={<CalendarDays />} label="Approved days taken" value={summary.approvedDaysTaken} />
          <Stat icon={<Palmtree />} label="Paid vacation taken" value={summary.paidVacationTaken} />
          <Stat icon={<Clock3 />} label="Late arrivals" value={summary.lateDates.length} />
          <Stat icon={<CalendarDays />} label="Missing scheduled days" value={summary.missingDates.length} alert={summary.missingDates.length > 0} />
        </div>}
        {summary && <div className="grid gap-4 md:grid-cols-2">
          <DetailCard title="Late-arrival dates" empty="No late arrivals recorded.">{summary.lateDates.map((item) => <div key={item.date} className="flex justify-between border-b py-2 text-sm"><span>{item.date}</span><span>{item.scheduled?.slice(0,5) ?? "—"} scheduled · {item.actual?.slice(0,5) ?? "—"} arrived</span></div>)}</DetailCard>
          <DetailCard title="Missing scheduled dates" empty="No unresolved missing days.">{summary.missingDates.map((date) => <div key={date} className="border-b py-2 text-sm">{date}</div>)}</DetailCard>
        </div>}
        <section>
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[#1F4D47]">My leave requests</h2><p className="text-sm text-[#74746E]">{summary?.pendingDays ?? 0} weekday(s) currently pending</p></div><button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl bg-[#E0A732] px-4 py-2.5 text-sm font-semibold text-[#25251F]"><Plus size={16} /> Request leave</button></div>
          <div className="space-y-3">{requests.map((request) => <RequestCard key={request.id} request={request} busy={busy} cancel={() => startTransition(() => void cancelLeaveRequest(request.id))} />)}{!requests.length && <div className="rounded-2xl border border-[#E4E1D8] bg-white p-8 text-center text-sm text-[#74746E]">No leave requests yet.</div>}</div>
        </section>
      </div>
      {showForm && <RequestModal close={() => setShowForm(false)} />}
    </main>
  );
}

function Stat({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number; alert?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${alert ? "border-[#E8C19D] bg-[#FFF8EC]" : "border-[#E4E1D8] bg-white"}`}><div className="mb-3 text-[#4A7F72]">{icon}</div><div className="text-3xl font-semibold text-[#1F4D47]">{value}</div><div className="mt-1 text-xs text-[#74746E]">{label}</div></div>;
}
function DetailCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <div className="rounded-2xl border border-[#E4E1D8] bg-white p-4"><h3 className="font-semibold text-[#33332F]">{title}</h3><div className="mt-2 max-h-56 overflow-auto">{children.length ? children : <p className="py-4 text-sm text-[#74746E]">{empty}</p>}</div></div>;
}
function RequestCard({ request, busy, cancel }: { request: LeaveRequest; busy: boolean; cancel: () => void }) {
  const colors: Record<string,string> = { Pending: "bg-[#FCF3E3] text-[#8C6217]", Approved: "bg-[#EAF5F0] text-[#2F725D]", Denied: "bg-[#FBEAE6] text-[#A33D28]", Cancelled: "bg-[#EFEFEB] text-[#74746E]" };
  return <div className="rounded-2xl border border-[#E4E1D8] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><b>{request.isPaidVacation ? "Paid vacation" : request.leaveType}</b><p className="text-sm text-[#55554F]">{request.dateFrom} through {request.dateTo} · {weekdaysInclusive(request.dateFrom, request.dateTo)} weekdays</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[request.status]}`}>{request.status}</span></div>{request.reason && <p className="mt-3 text-sm">{request.reason}</p>}{request.directorNote && <p className="mt-3 rounded-lg bg-[#F4F3EE] p-2 text-sm"><b>Director note:</b> {request.directorNote}</p>}{request.status === "Pending" && <button disabled={busy} onClick={cancel} className="mt-3 text-xs font-semibold text-[#A33D28]">Cancel request</button>}</div>;
}
function RequestModal({ close }: { close: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form action={submitLeaveRequest} className="w-full rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-[#1F4D47]">Request leave</h2><button type="button" onClick={close}><X /></button></div><div className="space-y-4"><label className="block text-sm">Leave type<select name="leaveType" required className="mt-1 w-full rounded-xl border px-3 py-3">{LEAVE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">From<input name="dateFrom" type="date" required className="mt-1 w-full rounded-xl border px-3 py-3" /></label><label className="text-sm">To<input name="dateTo" type="date" required className="mt-1 w-full rounded-xl border px-3 py-3" /></label></div><label className="block text-sm">Reason or note<textarea name="reason" rows={3} className="mt-1 w-full rounded-xl border px-3 py-3" /></label><button className="w-full rounded-xl bg-[#1F4D47] py-3 font-semibold text-white">Submit request</button></div></form></div>;
}