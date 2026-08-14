"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { addEmployee, updateEmployee } from "@/lib/actions";
import { ROLES } from "@/lib/staff";
import type { StaffMember } from "@/lib/staff";

const SITES = ["Noah's Arks", "Light House Academy"] as const;

type Mode =
  | { type: "add" }
  | { type: "edit"; staff: StaffMember & { role: string }; isDbOnly: boolean };

export function EmployeeFormModal({
  mode,
  sessionSite,
  onClose,
}: {
  mode: Mode;
  sessionSite: string;
  onClose: () => void;
}) {
  const isEdit = mode.type === "edit";
  const [name, setName] = useState(isEdit ? mode.staff.name : "");
  const [site, setSite] = useState<string>(
    isEdit ? mode.staff.site : sessionSite !== "all" ? sessionSite : "Noah's Arks"
  );
  const [hireDate, setHireDate] = useState(isEdit ? (mode.staff.hireDate ?? "") : "");
  const [role, setRole] = useState(isEdit ? mode.staff.role : "Caregiver");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function save() {
    if (!name.trim()) { setError("Name is required."); return; }
    setError("");
    startTransition(async () => {
      if (isEdit) {
        await updateEmployee(mode.staff.id, name, site, hireDate || null, mode.isDbOnly);
      } else {
        await addEmployee(name, site, hireDate || null, role);
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
            {isEdit ? "Edit employee" : "Add employee"}
          </h3>
          <button onClick={onClose} className="text-[#A0A09A] hover:text-[#33332F]"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Site</label>
            <select
              value={site}
              onChange={(e) => setSite(e.target.value)}
              disabled={sessionSite !== "all"}
              className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none bg-white disabled:opacity-60"
            >
              {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Hire date</label>
            <input
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none bg-white"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-[#B23E27] bg-[#FBEAE6] rounded-xl px-3 py-2">{error}</p>}
        </div>

        <button
          onClick={save}
          disabled={pending}
          className="w-full mt-5 bg-[#1F4D47] text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-40"
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
        </button>
      </div>
    </div>
  );
}
