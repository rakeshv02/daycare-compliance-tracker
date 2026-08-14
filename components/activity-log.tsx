"use client";

import { Heart, ArrowLeft } from "lucide-react";
import type { ActivityRow, WeekSummary } from "@/app/dashboard/waitlist/activity/page";

function actionLabel(action: string): string {
  switch (action) {
    case "delete": return "removed record";
    case "flag": return "flagged do-not-enroll";
    case "unflag": return "removed do-not-enroll flag";
    case "mark_tour_complete": return "marked tour complete";
    case "resend_thank_you": return "resent thank-you text";
    default: return action;
  }
}

export default function ActivityLog({
  entries,
  weeklySummary,
}: {
  entries: ActivityRow[];
  weeklySummary: WeekSummary[];
}) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1F4D47] flex items-center justify-center">
            <Heart size={20} className="text-[#E0A732]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
              Waitlist Activity Log
            </h1>
            <p className="text-xs text-[#A0A09A]">Weekly additions/deletions summary, plus every action ever taken</p>
          </div>
          <a
            href="/dashboard/waitlist"
            className="ml-auto flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
          >
            <ArrowLeft size={14} /> Back to waitlist
          </a>
        </div>

        {/* Weekly summary */}
        <div className="bg-white rounded-xl border border-[#E9E7DF] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9E7DF]">
            <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Weekly summary (Monday–Sunday)</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E9E7DF] text-left text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">
                <th className="px-4 py-2">Week</th>
                <th className="px-4 py-2">Additions</th>
                <th className="px-4 py-2">Deletions</th>
              </tr>
            </thead>
            <tbody>
              {weeklySummary.map((w) => (
                <tr key={w.weekStart} className="border-b border-[#F0F0EE] last:border-0">
                  <td className="px-4 py-2.5 text-[#33332F] font-medium whitespace-nowrap">{w.weekLabel}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-[#1F4D47]">{w.totalAdditions}</span>
                    {Object.keys(w.additionsBySite).length > 0 && (
                      <span className="text-xs text-[#A0A09A] ml-2">
                        ({Object.entries(w.additionsBySite).map(([site, n]) => `${site}: ${n}`).join(", ")})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-[#B23E27]">{w.totalDeletions}</span>
                    {Object.keys(w.deletionsByStaff).length > 0 && (
                      <span className="text-xs text-[#A0A09A] ml-2">
                        ({Object.entries(w.deletionsByStaff).map(([name, n]) => `${name}: ${n}`).join(", ")})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Full activity feed */}
        <div className="bg-white rounded-xl border border-[#E9E7DF] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9E7DF]">
            <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Every action (most recent first)</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E9E7DF] text-left text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Record</th>
                <th className="px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[#F0F0EE] last:border-0">
                  <td className="px-4 py-2.5 text-xs text-[#A0A09A] whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[#33332F] whitespace-nowrap">{e.staffName}</td>
                  <td className="px-4 py-2.5 text-[#33332F]">{actionLabel(e.action)}</td>
                  <td className="px-4 py-2.5 text-[#6B6B64]">
                    {e.parentName ? `${e.parentName}${e.site ? ` (${e.site})` : ""}` : <span className="italic text-[#A0A09A]">deleted record</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#6B6B64]">{e.detail ?? "—"}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#A0A09A]">
                    No activity logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
