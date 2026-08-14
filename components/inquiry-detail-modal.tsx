"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, MessageCircleHeart, AlertTriangle, Check, Flag, Hourglass } from "lucide-react";
import {
  updateInquiryField, markTourCompleted, resendThankYou, deleteInquiry, setFlag,
} from "@/lib/actions";
import { REGISTRATION_TYPES, type Inquiry } from "@/lib/inquiries";

const inputClass = "w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]";
const labelClass = "text-xs font-semibold text-[#6B6B64] block mb-1";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${checked ? "bg-[#1F4D47]" : "bg-[#D0D0C8]"}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </div>
      <span className="text-sm text-[#33332F]">{label}</span>
    </label>
  );
}

export function InquiryDetailModal({ inquiry, onClose }: { inquiry: Inquiry; onClose: () => void }) {
  const router = useRouter();
  const [enrolled, setEnrolled] = useState(inquiry.enrolled);
  const [startDate, setStartDate] = useState(inquiry.startDate ?? "");
  const [registrationType, setRegistrationType] = useState(inquiry.registrationType ?? "");
  const [assignedClassroom, setAssignedClassroom] = useState(inquiry.assignedClassroom ?? "");
  const [paperworkReturned, setPaperworkReturned] = useState(inquiry.paperworkReturnedDate ?? "");
  const [teacherNotified, setTeacherNotified] = useState(inquiry.teacherNotified);
  const [registrationPaid, setRegistrationPaid] = useState(inquiry.registrationPaid);
  const [notes, setNotes] = useState(inquiry.notes ?? "");
  const [flagged, setFlagged] = useState(inquiry.flagged);
  const [flagReason, setFlagReason] = useState(inquiry.flagReason ?? "");
  const [ccsApproved, setCcsApproved] = useState(inquiry.ccsApproved);

  const [pending, startTransition] = useTransition();
  const [smsPending, startSmsTransition] = useTransition();
  const [smsResult, setSmsResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [codeError, setCodeError] = useState("");
  const [flagPending, startFlagTransition] = useTransition();
  const [flagSaved, setFlagSaved] = useState(false);

  // Sensitive actions (delete, send thank-you text) need a staff action-code
  // since this dashboard has no login — see lib/staff-codes.ts.
  function askForCode(purpose: string): string | null {
    const code = window.prompt(`Enter your staff code to ${purpose}:`);
    return code?.trim() || null;
  }

  function save() {
    startTransition(async () => {
      await Promise.all([
        updateInquiryField(inquiry.id, "enrolled", enrolled),
        updateInquiryField(inquiry.id, "start_date", startDate || null),
        updateInquiryField(inquiry.id, "registration_type", registrationType || null),
        updateInquiryField(inquiry.id, "assigned_classroom", assignedClassroom || null),
        updateInquiryField(inquiry.id, "paperwork_returned_date", paperworkReturned || null),
        updateInquiryField(inquiry.id, "teacher_notified", teacherNotified),
        updateInquiryField(inquiry.id, "registration_paid", registrationPaid),
        updateInquiryField(inquiry.id, "notes", notes || null),
        updateInquiryField(inquiry.id, "ccs_approved", ccsApproved),
      ]);
      router.refresh();
      onClose();
    });
  }

  // Flagging is separate from the bulk save above — it needs its own staff
  // code, and asks for it the instant you flip the switch (not on a separate
  // "confirm" click) so it can't be forgotten. Cancel the prompt = no change.
  function handleToggleFlag(next: boolean) {
    const code = askForCode(next ? "flag this family as do-not-enroll" : "remove the do-not-enroll flag");
    if (!code) return;
    setCodeError("");
    setFlagSaved(false);
    startFlagTransition(async () => {
      try {
        await setFlag(inquiry.id, next, flagReason || null, code);
        setFlagged(next);
        setFlagSaved(true);
        router.refresh();
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  // For editing the reason text on an already-flagged record without
  // toggling it off and back on — still requires a code, still logged.
  function handleUpdateFlagReason() {
    const code = askForCode("update the do-not-enroll reason");
    if (!code) return;
    setCodeError("");
    setFlagSaved(false);
    startFlagTransition(async () => {
      try {
        await setFlag(inquiry.id, flagged, flagReason || null, code);
        setFlagSaved(true);
        router.refresh();
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleMarkToured() {
    const code = askForCode("mark this tour complete and send the thank-you text");
    if (!code) return;
    setCodeError("");
    startSmsTransition(async () => {
      try {
        const result = await markTourCompleted(inquiry.id, code);
        setSmsResult(result.ok ? { ok: true } : { ok: false, error: result.error });
        router.refresh();
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleResend() {
    const code = askForCode("send the thank-you text");
    if (!code) return;
    setCodeError("");
    startSmsTransition(async () => {
      try {
        const result = await resendThankYou(inquiry.id, code);
        setSmsResult(result.ok ? { ok: true } : { ok: false, error: result.error });
        router.refresh();
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Remove this inquiry? This can't be undone.")) return;
    const code = askForCode("remove this record");
    if (!code) return;
    setCodeError("");
    startTransition(async () => {
      try {
        await deleteInquiry(inquiry.id, code);
        router.refresh();
        onClose();
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
            {inquiry.parentFirst} {inquiry.parentLast}
          </h3>
          <button onClick={onClose} className="text-[#A0A09A] hover:text-[#33332F]"><X size={18} /></button>
        </div>
        <p className="text-xs text-[#A0A09A] mb-3">
          {inquiry.site} · {inquiry.phone}{inquiry.email ? ` · ${inquiry.email}` : ""}
        </p>

        {codeError && (
          <p className="text-xs text-[#B23E27] bg-[#FBEAE6] rounded-xl px-3 py-2 mb-5 flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {codeError}
          </p>
        )}

        {/* Do-not-enroll flag */}
        <div className="rounded-xl border border-[#E9E7DF] p-3 mb-5 space-y-2">
          <Toggle
            checked={flagged}
            onChange={handleToggleFlag}
            label={
              <span className="flex items-center gap-1.5">
                <Flag size={13} className={flagged ? "text-[#B23E27]" : "text-[#A0A09A]"} />
                {flagPending ? "Saving…" : flagged ? "Flagged — do not enroll" : "Flag this family (do not enroll)"}
              </span>
            }
          />
          <p className="text-[11px] text-[#A0A09A]">Asks for your staff code the moment you flip this — nothing saves until you enter it.</p>
          {flagged && (
            <>
              <textarea
                value={flagReason}
                onChange={(e) => { setFlagReason(e.target.value); setFlagSaved(false); }}
                placeholder="Optional: why (e.g. behavior during tour)"
                className={inputClass + " min-h-[50px] text-xs"}
              />
              {flagReason !== (inquiry.flagReason ?? "") && (
                <button
                  onClick={handleUpdateFlagReason}
                  disabled={flagPending}
                  className="text-xs font-semibold text-[#1F4D47] hover:opacity-70 disabled:opacity-40"
                >
                  {flagPending ? "Saving…" : "Save reason (asks for staff code)"}
                </button>
              )}
            </>
          )}
          {flagSaved && <p className="text-xs text-[#2F7A60]">Saved ✓</p>}
        </div>

        {/* Child info (read-only, from the parent's submission) */}
        <div className="space-y-1 mb-5 text-sm">
          <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">Child(ren)</p>
          {inquiry.child1First && (
            <p className="text-[#33332F]">
              {inquiry.child1First} {inquiry.child1Last}
              {inquiry.child1Birthday && ` · b. ${inquiry.child1Birthday}`}
              {inquiry.child1DateNeeded && ` · needs care from ${inquiry.child1DateNeeded}`}
            </p>
          )}
          {inquiry.child2First && (
            <p className="text-[#33332F]">
              {inquiry.child2First} {inquiry.child2Last}
              {inquiry.child2Birthday && ` · b. ${inquiry.child2Birthday}`}
              {inquiry.child2DateNeeded && ` · needs care from ${inquiry.child2DateNeeded}`}
            </p>
          )}
          {!inquiry.child1First && <p className="text-[#A0A09A]">No child details submitted.</p>}
        </div>

        {/* Tour + thank-you text */}
        <div className="space-y-3 mb-5 border-t border-[#F0F0EE] pt-4">
          <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Tour</p>
          {inquiry.tourCompleted ? (
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EAF5F0] text-[#2F7A60]">
                <Check size={12} /> Tour completed{inquiry.tourCompletedAt ? ` · ${new Date(inquiry.tourCompletedAt).toLocaleDateString()}` : ""}
              </span>
              {inquiry.thankYouSent ? (
                <span className="text-xs text-[#6B6B64] flex items-center gap-1"><MessageCircleHeart size={13} className="text-[#4A9B7F]" /> Thank-you text sent</span>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={smsPending}
                  className="text-xs font-semibold text-[#1F4D47] hover:opacity-70 disabled:opacity-40"
                >
                  {smsPending ? "Sending…" : "Send thank-you text"}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleMarkToured}
              disabled={smsPending}
              className="flex items-center gap-1.5 text-xs font-semibold bg-[#1F4D47] text-white px-3 py-2 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {smsPending ? "Sending…" : "Mark tour complete + send thank-you text"}
            </button>
          )}
          {(inquiry.thankYouError || (smsResult && !smsResult.ok)) && (
            <p className="text-xs text-[#B23E27] bg-[#FBEAE6] rounded-xl px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {smsResult?.error || inquiry.thankYouError}
            </p>
          )}
          {smsResult?.ok && <p className="text-xs text-[#2F7A60]">Text sent ✓</p>}
        </div>

        {inquiry.auditLog.length > 0 && (
          <div className="space-y-1.5 mb-5 border-t border-[#F0F0EE] pt-4">
            <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Activity</p>
            {inquiry.auditLog.map((entry, i) => (
              <p key={i} className="text-xs text-[#6B6B64]">
                <span className="font-medium text-[#33332F]">{entry.staffName}</span>
                {" — "}
                {entry.action === "delete" ? "removed this record"
                  : entry.action === "mark_tour_complete" ? "marked tour complete"
                  : entry.action === "resend_thank_you" ? "resent thank-you text"
                  : entry.action === "flag" ? "flagged do-not-enroll"
                  : entry.action === "unflag" ? "removed do-not-enroll flag"
                  : entry.action}
                {entry.detail && entry.action !== "mark_tour_complete" && entry.action !== "resend_thank_you" ? ` — "${entry.detail}"` : ""}
                {" · "}
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            ))}
          </div>
        )}

        {/* Editable status fields */}
        <div className="space-y-3 border-t border-[#F0F0EE] pt-4">
          <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Enrollment status</p>
          <Toggle checked={enrolled} onChange={setEnrolled} label={enrolled ? "Enrolled" : "Not enrolled yet"} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start date</label>
              <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Registration type</label>
              <select className={inputClass + " bg-white"} value={registrationType} onChange={(e) => setRegistrationType(e.target.value)}>
                <option value="">—</option>
                {REGISTRATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Assigned classroom</label>
              <input className={inputClass} value={assignedClassroom} onChange={(e) => setAssignedClassroom(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Paperwork returned</label>
              <input type="date" className={inputClass} value={paperworkReturned} onChange={(e) => setPaperworkReturned(e.target.value)} />
            </div>
          </div>

          {registrationType === "CCS/Subsidy" && (
            <div className="rounded-xl bg-[#FCF3E3] p-3">
              <Toggle
                checked={ccsApproved}
                onChange={setCcsApproved}
                label={
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {ccsApproved ? (
                      <>CCS approved by state</>
                    ) : (
                      <><Hourglass size={13} className="text-[#9A6B14]" /> Awaiting CCS approval — can&apos;t start yet</>
                    )}
                  </span>
                }
              />
            </div>
          )}

          <Toggle checked={teacherNotified} onChange={setTeacherNotified} label="Teacher notified" />
          <Toggle checked={registrationPaid} onChange={setRegistrationPaid} label="Registration paid" />

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={inputClass + " min-h-[70px]"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={save}
            disabled={pending}
            className="flex-1 bg-[#1F4D47] text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="text-xs font-semibold text-[#B23E27] px-3 py-2.5 rounded-xl hover:bg-[#FBEAE6] transition"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
