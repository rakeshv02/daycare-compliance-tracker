"use client";

import { useState } from "react";
import type { AttendanceMatchingEmployee } from "@/lib/attendance";
import { markFormerAttendanceEmployee, matchAttendanceName } from "@/lib/attendance-actions";

const NEW_FORMER_EMPLOYEE = "__left_employee_not_in_tracker__";
const inputClass = "mt-1.5 w-full rounded-xl border border-[#DDDAD0] px-3 py-2.5 text-sm font-normal";

export default function AttendanceMatchRow({ item, roster, busy, onMatched }: {
  item: { imported_name: string; site: string };
  roster: AttendanceMatchingEmployee[];
  busy: boolean;
  onMatched: (message: string) => void;
}) {
  const [staffId, setStaffId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [leavingDate, setLeavingDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = roster.filter((person) => person.site === item.site);
  const selected = options.find((person) => person.id === staffId);
  const creatingFormer = staffId === NEW_FORMER_EMPLOYEE;

  async function confirm() {
    if (saving || busy || !staffId) return;
    setSaving(true);
    setError("");
    try {
      if (creatingFormer) {
        const result = await markFormerAttendanceEmployee({
          importedName: item.imported_name, site: item.site, employeeId, leavingDate,
        });
        onMatched(`Marked ${item.imported_name} as Left and matched ${result.matchedEntries.toLocaleString()} attendance entries.`);
      } else {
        await matchAttendanceName(item.imported_name, item.site, staffId);
        onMatched(`Matched ${item.imported_name} to ${selected?.employeeId ?? "employee record"}${selected?.hasLeft ? " (Left)" : ""}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this attendance match.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#E9E7DF] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-[#8A8A84]">CSV name</p><b className="text-sm text-[#33332F]">{item.imported_name}</b></div>
        <span className="rounded-full bg-[#F1F0EA] px-2.5 py-1 text-xs font-semibold text-[#55554F]">{item.site}</span>
      </div>
      <label className="mt-3 block text-xs font-semibold text-[#55554F]">
        Match to Employee ID
        <select value={staffId} disabled={saving || busy} onChange={(e) => { setStaffId(e.target.value); setError(""); }} className={inputClass}>
          <option value="">Select the {item.site} employee record…</option>
          <option value={NEW_FORMER_EMPLOYEE}>Left employee—not in Compliance Tracker</option>
          {options.map((person) => <option key={person.id} value={person.id}>
            {person.employeeId ?? "ID not set"} — {person.name}{person.hasLeft ? " · Left" : ""}
          </option>)}
        </select>
      </label>
      {creatingFormer && (
        <div className="mt-3 space-y-3 rounded-lg border border-[#DDDAD0] bg-[#F6F5F0] p-3">
          <p className="text-xs text-[#55554F]">Record <b>{item.imported_name}</b> at {item.site} as Left and match their past attendance. They will not be added to the active roster.</p>
          <label className="block text-xs font-semibold text-[#55554F]">
            Employee ID (if known)
            <input value={employeeId} maxLength={20} disabled={saving || busy} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Leave blank if not known" className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-[#55554F]">
            Leaving date (if known)
            <input type="date" value={leavingDate} disabled={saving || busy} onChange={(e) => setLeavingDate(e.target.value)} className={inputClass} />
          </label>
          <p className="text-xs text-[#7A7A74]">Unknown IDs and dates can be left blank; no date or Employee ID will be guessed.</p>
        </div>
      )}
      {selected && (
        <div className="mt-3 rounded-lg bg-[#F6F5F0] px-3 py-2 text-xs">
          <b>{selected.employeeId ?? "Employee ID not set"}</b> · {selected.name}<br />{selected.site}
          {selected.hasLeft && <p className="mt-1 font-semibold">Left · {selected.leavingDate ?? "Date not recorded"}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-[#A33D28]">{error}</p>}
      <button type="button" disabled={saving || busy || !staffId} onClick={() => void confirm()} className="mt-3 w-full rounded-xl bg-[#1F4D47] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {saving ? "Saving…" : creatingFormer ? "Mark as left and match attendance" : "Confirm site-specific match"}
      </button>
    </div>
  );
}