"use client";

import { useMemo } from "react";
import { Printer, X } from "lucide-react";
import { EXCEPTION_TYPES } from "@/lib/leave-exceptions";
import type { ExceptionKind, SummaryException } from "@/lib/leave-exceptions";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function LeaveExceptionCalendar({
  name, site, year, entries, filter, onClose,
}: {
  name: string;
  site: string;
  year: number;
  entries: SummaryException[];
  filter: { kind: ExceptionKind; month: number | null } | null;
  onClose: () => void;
}) {
  const eventsByDate = useMemo(() => {
    const mapped = new Map<string, SummaryException[]>();
    for (const entry of entries) mapped.set(entry.date, [...(mapped.get(entry.date) ?? []), entry]);
    return mapped;
  }, [entries]);
  const selected = filter && EXCEPTION_TYPES.find((type) => type.key === filter.kind);
  const matching = filter
    ? entries.filter((entry) => entry.kind === filter.kind && (filter.month === null || Number(entry.date.slice(5, 7)) === filter.month + 1))
    : [];

  return <div className="exception-calendar-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="exception-calendar-title" className="exception-calendar-panel max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6" onClick={(event) => event.stopPropagation()}>
      <div className="exception-screen-controls flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="exception-calendar-title" className="text-xl font-semibold text-[#1F4D47]">{name} · {year} attendance calendar</h2>
          <p className="text-sm text-[#66665F]">Color-coded dates are attendance indicators to review, not automatic judgments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-[#1F4D47] px-4 py-2 text-sm font-semibold text-white"><Printer size={16} /> Print calendar</button>
          <button type="button" aria-label="Close attendance calendar" onClick={onClose} className="rounded-lg border p-2"><X size={18} /></button>
        </div>
      </div>

      {filter && <div className="exception-screen-controls mt-5 rounded-xl border border-[#E4E1D8] bg-[#FAFAF7] p-4">
        <h3 className="font-semibold text-[#1F4D47]">{selected?.label} · {filter.month === null ? "All year" : MONTH_NAMES[filter.month]} ({matching.length})</h3>
        {matching.length ? <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
          {matching.map((entry) => <div key={`${entry.date}-${entry.kind}`} className="border-t border-[#E4E1D8] pt-2 text-sm">
            <b>{entry.date}</b>
            {entry.kind !== "missingDay" && <span className="ml-2 text-[#55554F]">Scheduled {entry.scheduledStart?.slice(0, 5) ?? "—"}–{entry.scheduledEnd?.slice(0, 5) ?? "—"} · Actual {entry.firstIn?.slice(0, 5) ?? "—"}–{entry.lastOut?.slice(0, 5) ?? "—"}</span>}
            {entry.classification && <span className="ml-2 text-[#55554F]">· {entry.classification}</span>}
            {entry.note && <p className="mt-1 text-[#55554F]">Note: {entry.note}</p>}
          </div>)}
        </div> : <p className="mt-2 text-sm text-[#74746E]">No dates recorded for this category.</p>}
      </div>}

      <div className="exception-print-sheet mt-5">
        <div className="exception-print-heading hidden">
          <h2>{name} · {site}</h2><p>{year} attendance exception calendar</p>
        </div>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {EXCEPTION_TYPES.map((type) => <span key={type.key} className="rounded-md border px-2 py-1 font-semibold" style={{ backgroundColor: type.background, borderColor: type.color, color: type.color }}>{type.short} = {type.singular}</span>)}
        </div>
        <p className="mb-4 text-xs text-[#66665F]">A date may have more than one label. Missing scheduled days are counted only through the latest uploaded attendance date. These are review indicators.</p>
        {[0, 6].map((startMonth) => <div key={startMonth} className="exception-print-page grid gap-4 sm:grid-cols-2">
          {MONTH_NAMES.slice(startMonth, startMonth + 6).map((month, index) => {
            const monthIndex = startMonth + index;
            const firstWeekday = new Date(year, monthIndex, 1).getDay();
            const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
            return <div key={month} className="exception-month rounded-xl border border-[#D8D5CB] p-2">
              <h3 className="mb-2 text-sm font-semibold text-[#1F4D47]">{month}</h3>
              <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[#66665F]">{DAYS.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="grid grid-cols-7 gap-px">
                {Array.from({ length: firstWeekday }, (_, blank) => <div key={`blank-${blank}`} />)}
                {Array.from({ length: daysInMonth }, (_, offset) => {
                  const day = offset + 1;
                  const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const events = eventsByDate.get(date) ?? [];
                  return <div key={day} className="exception-date min-h-10 rounded border border-[#E4E1D8] p-0.5 text-[10px]" style={events.length === 1 ? { backgroundColor: EXCEPTION_TYPES.find((type) => type.key === events[0].kind)?.background } : undefined}>
                    <span className="font-semibold">{day}</span>
                    <div className="flex flex-wrap gap-px">{events.map((entry) => {
                      const type = EXCEPTION_TYPES.find((item) => item.key === entry.kind)!;
                      return <span key={entry.kind} title={type.singular} className="rounded px-0.5 text-[8px] font-bold" style={{ backgroundColor: type.background, color: type.color }}>{type.short}</span>;
                    })}</div>
                  </div>;
                })}
              </div>
            </div>;
          })}
        </div>)}
      </div>
    </div>
  </div>;
}