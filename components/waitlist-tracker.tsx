"use client";

import { useState, useMemo } from "react";
import {
  Heart, Search, Building2, Link2, Check, ShieldCheck,
  MessageCircleHeart, ClipboardList, Users, Flag, Hourglass,
} from "lucide-react";
import type { Inquiry, Site } from "@/lib/inquiries";
import { slugFromSite } from "@/lib/inquiries";
import { InquiryDetailModal } from "./inquiry-detail-modal";
import type { SiteFilter } from "@/lib/staff";

const SITES: { value: SiteFilter | "all"; label: string }[] = [
  { value: "all", label: "All sites" },
  { value: "Noah's Arks", label: "Noah's Arks" },
  { value: "Light House Academy", label: "Light House Academy" },
];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function CopyLinkButton({ site }: { site: Site }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        const url = `${window.location.origin}${BASE}/inquiry/${slugFromSite(site)}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white border border-[#E9E7DF]"
    >
      {copied ? <Check size={13} className="text-[#4A9B7F]" /> : <Link2 size={13} />}
      {copied ? "Copied!" : `Copy ${site} intake link`}
    </button>
  );
}

export default function WaitlistTracker({
  inquiries,
  sessionSite,
}: {
  inquiries: Inquiry[];
  sessionSite: SiteFilter;
}) {
  const [siteFilter, setSiteFilter] = useState<SiteFilter | "all">(sessionSite === "all" ? "all" : sessionSite);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Inquiry | null>(null);

  const availableSites = sessionSite === "all"
    ? SITES
    : SITES.filter((s) => s.value === sessionSite || s.value === "all");

  const filtered = useMemo(
    () => inquiries.filter((i) => {
      const siteOk = siteFilter === "all" || i.site === siteFilter;
      const sessionOk = sessionSite === "all" || i.site === sessionSite;
      const term = q.toLowerCase();
      const searchOk =
        !term ||
        `${i.parentFirst} ${i.parentLast}`.toLowerCase().includes(term) ||
        `${i.child1First ?? ""} ${i.child1Last ?? ""}`.toLowerCase().includes(term) ||
        `${i.child2First ?? ""} ${i.child2Last ?? ""}`.toLowerCase().includes(term) ||
        i.phone.includes(term);
      return siteOk && sessionOk && searchOk;
    }),
    [inquiries, siteFilter, sessionSite, q]
  );

  const summary = useMemo(() => {
    const scoped = sessionSite === "all" ? inquiries : inquiries.filter((i) => i.site === sessionSite);
    return {
      total: scoped.length,
      awaitingTour: scoped.filter((i) => !i.tourCompleted).length,
      touredNotEnrolled: scoped.filter((i) => i.tourCompleted && !i.enrolled).length,
      enrolled: scoped.filter((i) => i.enrolled).length,
    };
  }, [inquiries, sessionSite]);

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1F4D47] flex items-center justify-center">
              <Heart size={20} className="text-[#E0A732]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
                Parent Waitlist
              </h1>
              <p className="text-xs text-[#A0A09A]">{summary.total} inquiries · saved automatically</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`${BASE}/dashboard/waitlist/activity`}
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <ClipboardList size={14} /> Activity log
            </a>
            <a
              href={`${BASE}/dashboard`}
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <ShieldCheck size={14} /> Compliance tracker (staff login)
            </a>
          </div>
        </div>

        {/* Intake links */}
        <div className="flex flex-wrap gap-2">
          {(sessionSite === "all" || sessionSite === "Noah's Arks") && <CopyLinkButton site="Noah's Arks" />}
          {(sessionSite === "all" || sessionSite === "Light House Academy") && <CopyLinkButton site="Light House Academy" />}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">
              <Users size={13} className="text-[#1F4D47]" />Total inquiries
            </div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">
              <ClipboardList size={13} className="text-[#E0A732]" />Awaiting tour
            </div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.awaitingTour}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">
              <MessageCircleHeart size={13} className="text-[#4A9B7F]" />Toured, deciding
            </div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.touredNotEnrolled}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">Enrolled</div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.enrolled}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A09A]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search parent, child, or phone…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none bg-white"
            />
          </div>
          {availableSites.length > 1 && (
            <div className="flex gap-1.5 bg-white border border-[#E9E7DF] rounded-xl p-1">
              {availableSites.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSiteFilter(s.value)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${siteFilter === s.value ? "bg-[#1F4D47] text-white" : "text-[#6B6B64] hover:bg-[#FAFAF7]"}`}
                >
                  {s.value === "all" && <Building2 size={12} />}{s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#E9E7DF] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E9E7DF] text-left text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3">Child</th>
                {siteFilter === "all" && <th className="px-4 py-3">Site</th>}
                <th className="px-4 py-3">Tour</th>
                <th className="px-4 py-3">Enrolled</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((inq) => (
                <tr
                  key={inq.id}
                  className={`border-b border-[#F0F0EE] last:border-0 hover:bg-[#FAFAF7] ${inq.flagged ? "bg-[#FBEAE6]" : ""}`}
                >
                  <td className="px-4 py-3 text-xs text-[#A0A09A] whitespace-nowrap">
                    {new Date(inq.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#33332F] flex items-center gap-1.5">
                      {inq.flagged && <Flag size={13} className="text-[#B23E27] shrink-0" />}
                      {inq.parentFirst} {inq.parentLast}
                    </p>
                    <p className="text-xs text-[#A0A09A]">{inq.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-[#33332F]">
                    {inq.child1First ? `${inq.child1First} ${inq.child1Last ?? ""}`.trim() : "—"}
                  </td>
                  {siteFilter === "all" && <td className="px-4 py-3 text-xs text-[#6B6B64]">{inq.site}</td>}
                  <td className="px-4 py-3">
                    {inq.tourCompleted ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EAF5F0] text-[#2F7A60]">
                        {inq.thankYouSent ? "Toured · texted" : "Toured"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F0F0EE] text-[#7A7A74]">
                        Not yet
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        inq.enrolled ? "bg-[#EAF5F0] text-[#2F7A60]" : "bg-[#F0F0EE] text-[#7A7A74]"
                      }`}
                    >
                      {inq.enrolled ? "Enrolled" : "Not yet"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      {inq.flagged && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FBEAE6] text-[#B23E27]">
                          <Flag size={11} /> Do not enroll
                        </span>
                      )}
                      {inq.registrationType === "CCS/Subsidy" && !inq.ccsApproved && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FCF3E3] text-[#9A6B14]">
                          <Hourglass size={11} /> Awaiting CCS approval
                        </span>
                      )}
                      {inq.registrationType === "CCS/Subsidy" && inq.ccsApproved && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EAF5F0] text-[#2F7A60]">
                          CCS approved
                        </span>
                      )}
                      {!inq.flagged && inq.registrationType !== "CCS/Subsidy" && (
                        <span className="text-xs text-[#A0A09A]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDetail(inq)}
                      className="text-xs font-semibold text-[#1F4D47] hover:opacity-70"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#A0A09A]">
                    No inquiries yet. Share the intake link above to start collecting them.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <InquiryDetailModal
          inquiry={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
