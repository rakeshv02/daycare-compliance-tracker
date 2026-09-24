"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getPendingLeaveRequestIds } from "@/lib/leave-actions";

const STORAGE_KEY = "director-seen-pending-leave-ids";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PendingLeaveNotice({ initialIds }: { initialIds: number[] }) {
  const [ids, setIds] = useState(initialIds);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    function showIfNew(pending: number[]) {
      if (!active) return;
      setIds(pending);
      const signature = pending.join(",");
      if (signature && sessionStorage.getItem(STORAGE_KEY) !== signature) setOpen(true);
      if (!signature) setOpen(false);
    }
    showIfNew(initialIds);
    async function refresh() {
      try {
        showIfNew(await getPendingLeaveRequestIds());
      } catch (error) {
        console.error("Could not check pending leave requests", error);
      }
    }
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [initialIds]);

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, ids.join(","));
    setOpen(false);
  }

  if (!ids.length) return null;
  return <>
    <a href={`${BASE}/dashboard/leave`} className="fixed bottom-4 right-4 z-40 rounded-xl border border-[#B08A40] bg-[#FCF3E3] px-4 py-3 text-sm font-semibold text-[#6F4B0E] shadow-lg">
      {ids.length} pending leave request{ids.length === 1 ? "" : "s"} · Review
    </a>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="pending-leave-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="pending-leave-title" className="text-xl font-semibold text-[#1F4D47]">Leave requests awaiting review</h2>
          <button type="button" aria-label="Dismiss leave notice" onClick={dismiss} className="rounded-lg p-1 text-[#55554F] hover:bg-[#F4F3EE]"><X size={20} /></button>
        </div>
        <p className="mt-3 text-sm text-[#55554F]">{ids.length} employee leave request{ids.length === 1 ? " is" : "s are"} pending your review.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={dismiss} className="rounded-xl border px-4 py-2 text-sm font-semibold">Later</button>
          <a href={`${BASE}/dashboard/leave`} onClick={dismiss} className="rounded-xl bg-[#1F4D47] px-4 py-2 text-sm font-semibold text-white">Review requests</a>
        </div>
      </div>
    </div>}
  </>;
}