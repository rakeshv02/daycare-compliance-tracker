"use client";

import { useId } from "react";

export function PreServiceFields({
  completed,
  date,
  onChange,
}: {
  completed: boolean;
  date: string;
  onChange: (completed: boolean, date: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-3 border-t border-[#F0F0EE] pt-3">
      <label className="flex items-center gap-2 text-sm text-[#33332F]">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => onChange(e.target.checked, e.target.checked ? date : "")}
          className="h-4 w-4 accent-[#1F4D47]"
        />
        Pre-service completed
      </label>
      {completed && (
        <div>
          <label htmlFor={id} className="text-xs font-semibold text-[#6B6B64] block mb-1">
            Pre-service completion date
          </label>
          <input
            id={id}
            type="date"
            value={date}
            onChange={(e) => onChange(completed, e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none"
          />
        </div>
      )}
    </div>
  );
}
