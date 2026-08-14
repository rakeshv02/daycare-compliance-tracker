"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { saveCredential } from "@/lib/actions";
import { DATE_CRED_TYPES } from "@/lib/staff";
import type { StaffMember } from "@/lib/staff";

export function CredentialModal({ staff, onClose }: { staff: StaffMember & { role: string }; onClose: () => void }) {
  const [type, setType] = useState<string>(DATE_CRED_TYPES[0]);
  // Auto-fill issued date from hire date for Background Check
  const [issued, setIssued] = useState(staff.hireDate ?? "");
  const [expires, setExpires] = useState("");
  const [pending, startTransition] = useTransition();

  function handleTypeChange(t: string) {
    setType(t);
    // Auto-fill issued from hire date only for Background Check
    if (t === "Background Check") {
      setIssued(staff.hireDate ?? "");
    } else {
      setIssued("");
    }
  }

  function save() {
    if (!expires) return;
    startTransition(async () => {
      await saveCredential(staff.id, type, issued || null, expires);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>Add credential</h3>
          <button onClick={onClose} className="text-[#A0A09A] hover:text-[#33332F]"><X size={18} /></button>
        </div>
        <p className="text-xs text-[#A0A09A] mb-4">{staff.name}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Credential type</label>
            <select value={type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none">
              {DATE_CRED_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6B6B64] block mb-1">
              Date issued {type === "Background Check" ? "(auto-filled from hire date)" : "(optional)"}
            </label>
            <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Expiration date</label>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
          </div>
        </div>
        <button
          onClick={save}
          disabled={!expires || pending}
          className="w-full mt-5 bg-[#1F4D47] text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save credential"}
        </button>
      </div>
    </div>
  );
}
