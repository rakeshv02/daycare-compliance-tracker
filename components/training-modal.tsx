"use client";

import { useState, useTransition } from "react";
import { X, Trash2 } from "lucide-react";
import { addTrainingEntry, deleteTrainingEntry } from "@/lib/actions";
import { trainingStatus } from "@/lib/staff";
import type { StaffMember, TrainingEntry } from "@/lib/staff";

const TRAINING_TOPICS = [
  { key: "core",  label: "Core (growth/dev, guidance, curriculum, interaction)" },
  { key: "abuse", label: "Abuse/neglect prevention & reporting" },
  { key: "other", label: "Other required topics" },
];

const TOPIC_SHORT: Record<string, string> = {
  core:  "Core",
  abuse: "Abuse/neglect",
  other: "Other",
};

export function TrainingModal({
  staff,
  requiredHours,
  entries,
  onClose,
}: {
  staff: StaffMember & { role: string };
  requiredHours: number;
  entries: TrainingEntry[];
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("");
  const [topic, setTopic] = useState("core");
  const [pending, startTransition] = useTransition();

  const totals = trainingStatus(entries, requiredHours, staff.hireDate);

  // Compute other hours for display
  const other = totals.total - totals.core - totals.abuse;

  function add() {
    if (!date || !hours) return;
    startTransition(async () => {
      await addTrainingEntry(staff.id, date, title, Number(hours), topic);
      setDate(""); setTitle(""); setHours("");
    });
  }

  function remove(entry: TrainingEntry) {
    if (!entry.id) return;
    startTransition(async () => {
      await deleteTrainingEntry(entry.id!, staff.id);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>Training hours</h3>
          <button onClick={onClose} className="text-[#A0A09A] hover:text-[#33332F]"><X size={18} /></button>
        </div>
        <p className="text-xs text-[#A0A09A] mb-4">{staff.name} · needs {requiredHours} hrs/year</p>

        {totals.window ? (
          <p className="text-xs text-[#6B6B64] mb-3 bg-[#FAFAF7] rounded-lg px-3 py-2">
            Current training year:{" "}
            <span className="font-mono" style={{ fontFamily: "IBM Plex Mono" }}>
              {totals.window.start.toLocaleDateString()} – {totals.window.end.toLocaleDateString()}
            </span>{" "}
            (resets on hire anniversary · hours don't carry over)
          </p>
        ) : (
          <p className="text-xs text-[#B23E27] mb-3 bg-[#FBEAE6] rounded-lg px-3 py-2">
            No hire date on file — totaling all entries instead of one training year.
          </p>
        )}

        {/* Hours breakdown */}
        <div className="bg-[#FAFAF7] rounded-xl p-3 mb-4 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-[#6B6B64] font-semibold">Total logged</span>
            <span className={`font-semibold ${totals.meetsTotal ? "text-[#2F7A60]" : "text-[#33332F]"}`}>{totals.total} / {requiredHours} hrs</span>
          </div>
          <div className="border-t border-[#E9E7DF] my-1" />
          <div className="flex justify-between text-xs">
            <span className="text-[#6B6B64]">Core topics <span className="text-[#A0A09A]">(need ≥ 6)</span></span>
            <span className={totals.meetsCore ? "text-[#2F7A60] font-semibold" : "text-[#9A6B14] font-semibold"}>{totals.core} hrs</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#6B6B64]">Abuse/neglect <span className="text-[#A0A09A]">(need ≥ 1)</span></span>
            <span className={totals.meetsAbuse ? "text-[#2F7A60] font-semibold" : "text-[#9A6B14] font-semibold"}>{totals.abuse} hrs</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#6B6B64]">Other required topics</span>
            <span className="text-[#6B6B64] font-semibold">{other > 0 ? `${other} hrs` : "—"}</span>
          </div>
        </div>

        {/* Log new entry */}
        <div className="space-y-3 border-t border-[#F0F0EE] pt-4">
          <p className="text-xs font-semibold text-[#6B6B64]">Log a training</p>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
          <input type="text" placeholder="Training title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
          <div className="flex gap-2">
            <input type="number" step="0.5" min="0" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} className="w-24 px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none" />
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none">
              {TRAINING_TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <button
            onClick={add}
            disabled={!date || !hours || pending}
            className="w-full bg-[#1F4D47] text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? "Saving…" : "Add entry"}
          </button>
        </div>

        {/* Entry list with delete */}
        {entries.length > 0 && (
          <div className="mt-4 border-t border-[#F0F0EE] pt-3 space-y-1">
            <p className="text-xs font-semibold text-[#6B6B64] mb-2">Logged entries</p>
            {entries.map((e, i) => (
              <div key={e.id ?? i} className="flex items-center justify-between text-xs text-[#6B6B64] py-1 hover:bg-[#FAFAF7] rounded-lg px-1 group">
                <span className="flex-1 min-w-0">
                  <span className="text-[#33332F]">{e.date}</span>
                  {" — "}
                  <span>{e.title || "Untitled"}</span>
                  {" · "}
                  <span className="text-[#A0A09A]">{TOPIC_SHORT[e.topic] ?? e.topic}</span>
                </span>
                <span className="font-mono ml-2 flex-shrink-0" style={{ fontFamily: "IBM Plex Mono" }}>{e.hours}h</span>
                {e.id && (
                  <button
                    onClick={() => remove(e)}
                    disabled={pending}
                    className="ml-2 p-1 rounded text-[#D0D0C8] hover:text-[#B23E27] hover:bg-[#FBEAE6] transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Delete entry"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
