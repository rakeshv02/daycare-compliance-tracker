"use client";

import { useState, useTransition } from "react";
import { X, Car } from "lucide-react";
import { setLifecycle, setDriverInfo } from "@/lib/actions";
import type { StaffMember, LifecycleRecord, DriverInfo } from "@/lib/staff";

export function EmployeeDetailsModal({
  staff,
  lifecycle,
  driverInfo,
  onClose,
}: {
  staff: StaffMember & { role: string };
  lifecycle: LifecycleRecord;
  driverInfo: DriverInfo;
  onClose: () => void;
}) {
  const [isActive, setIsActive] = useState(lifecycle.isActive);
  const [leavingDate, setLeavingDate] = useState(lifecycle.leavingDate ?? "");
  const [isDriver, setIsDriver] = useState(driverInfo.isDriver);
  const [dlNumber, setDlNumber] = useState(driverInfo.dlNumber ?? "");
  const [dlExpires, setDlExpires] = useState(driverInfo.dlExpires ?? "");
  const [transportDate, setTransportDate] = useState(driverInfo.transportTrainingDate ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await Promise.all([
        setLifecycle(staff.id, isActive, leavingDate || null),
        setDriverInfo(staff.id, isDriver, dlNumber || null, dlExpires || null, transportDate || null),
      ]);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>Employee details</h3>
          <button onClick={onClose} className="text-[#A0A09A] hover:text-[#33332F]"><X size={18} /></button>
        </div>
        <p className="text-xs text-[#A0A09A] mb-5">{staff.name}</p>

        {/* Lifecycle */}
        <div className="space-y-3 mb-5">
          <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Employment status</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setIsActive(!isActive)}
              className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${isActive ? "bg-[#1F4D47]" : "bg-[#D0D0C8]"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm text-[#33332F]">{isActive ? "Active" : "Inactive"}</span>
          </label>
          <div>
            <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Leaving date (if applicable)</label>
            <input
              type="date"
              value={leavingDate}
              onChange={(e) => { setLeavingDate(e.target.value); if (e.target.value) setIsActive(false); }}
              className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none"
            />
          </div>
        </div>

        {/* Driver */}
        <div className="space-y-3 border-t border-[#F0F0EE] pt-4">
          <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Driver status</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setIsDriver(!isDriver)}
              className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${isDriver ? "bg-[#1F4D47]" : "bg-[#D0D0C8]"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${isDriver ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm text-[#33332F] flex items-center gap-1.5"><Car size={14} /> Is a driver</span>
          </label>

          {isDriver && (
            <div className="space-y-3 pl-1">
              <div>
                <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Driver's license number</label>
                <input type="text" value={dlNumber} onChange={(e) => setDlNumber(e.target.value)} placeholder="TX12345678" className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B6B64] block mb-1">DL expiration date</label>
                <input type="date" value={dlExpires} onChange={(e) => setDlExpires(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Transportation safety training — date completed (2 hrs required)</label>
                <input type="date" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={save}
          disabled={pending}
          className="w-full mt-5 bg-[#1F4D47] text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
