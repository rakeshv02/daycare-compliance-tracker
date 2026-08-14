"use client";

import { useState, useTransition, useEffect } from "react";
import { Heart, CheckCircle2, Plus, X } from "lucide-react";
import { submitInquiry } from "@/lib/actions";

const inputClass =
  "w-full px-3 py-2.5 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47] bg-white";
const labelClass = "text-xs font-semibold text-[#6B6B64] block mb-1";

export function InquiryForm({ site, siteSlug }: { site: string; siteSlug: string }) {
  const [parentFirst, setParentFirst] = useState("");
  const [parentLast, setParentLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [child1First, setChild1First] = useState("");
  const [child1Last, setChild1Last] = useState("");
  const [child1Birthday, setChild1Birthday] = useState("");
  const [child1DateNeeded, setChild1DateNeeded] = useState("");

  const [showChild2, setShowChild2] = useState(false);
  const [child2First, setChild2First] = useState("");
  const [child2Last, setChild2Last] = useState("");
  const [child2Birthday, setChild2Birthday] = useState("");
  const [child2DateNeeded, setChild2DateNeeded] = useState("");

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // Shared tablet at the front desk — clear back to a blank form a few
  // seconds after a submission so the next family doesn't need staff to reset it.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      setParentFirst("");
      setParentLast("");
      setPhone("");
      setEmail("");
      setChild1First("");
      setChild1Last("");
      setChild1Birthday("");
      setChild1DateNeeded("");
      setShowChild2(false);
      setChild2First("");
      setChild2Last("");
      setChild2Birthday("");
      setChild2DateNeeded("");
      setDone(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [done]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentFirst.trim() || !parentLast.trim() || !phone.trim()) {
      setError("Please fill in your name and phone number.");
      return;
    }
    if (!agreedToTerms) {
      setError("Please check the box confirming you've read the notice below.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await submitInquiry(siteSlug, {
          parentFirst,
          parentLast,
          phone,
          email,
          child1First,
          child1Last,
          child1Birthday,
          child1DateNeeded,
          child2First: showChild2 ? child2First : "",
          child2Last: showChild2 ? child2Last : "",
          child2Birthday: showChild2 ? child2Birthday : "",
          child2DateNeeded: showChild2 ? child2DateNeeded : "",
          agreedToTerms,
        });
        setDone(true);
        setAgreedToTerms(false);
      } catch (err) {
        setError(err instanceof Error && err.message.includes("check the box")
          ? err.message
          : "Something went wrong submitting the form. Please try again, or call us directly.");
      }
    });
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-[#E9E7DF] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#EAF5F0] flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={24} className="text-[#2F7A60]" />
          </div>
          <h2 className="font-semibold text-[#1F4D47] mb-2" style={{ fontFamily: "Fredoka" }}>
            Thank you!
          </h2>
          <p className="text-sm text-[#6B6B64]">
            We've got your information for {site}. A staff member will be with you shortly.
          </p>
          <p className="text-xs text-[#A0A09A] mt-4">This screen will reset automatically for the next family.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-4 sm:p-8">
      <div className="w-full max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#1F4D47] flex items-center justify-center">
            <Heart size={18} className="text-[#E0A732]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
              {site}
            </h1>
            <p className="text-xs text-[#A0A09A]">Enrollment inquiry</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#E9E7DF] p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-[#1F4D47] mb-3" style={{ fontFamily: "Fredoka" }}>
              Your information
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>First name *</label>
                <input className={inputClass} value={parentFirst} onChange={(e) => setParentFirst(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Last name *</label>
                <input className={inputClass} value={parentLast} onChange={(e) => setParentLast(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Phone *</label>
                <input
                  type="tel"
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-[#1F4D47] mb-3" style={{ fontFamily: "Fredoka" }}>
              Child information
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Child's first name</label>
                <input className={inputClass} value={child1First} onChange={(e) => setChild1First(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Child's last name</label>
                <input className={inputClass} value={child1Last} onChange={(e) => setChild1Last(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Birthday</label>
                <input
                  type="date"
                  className={inputClass}
                  value={child1Birthday}
                  onChange={(e) => setChild1Birthday(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Date care is needed</label>
                <input
                  type="date"
                  className={inputClass}
                  value={child1DateNeeded}
                  onChange={(e) => setChild1DateNeeded(e.target.value)}
                />
              </div>
            </div>

            {!showChild2 ? (
              <button
                type="button"
                onClick={() => setShowChild2(true)}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#1F4D47] hover:opacity-70"
              >
                <Plus size={14} /> Add a second child
              </button>
            ) : (
              <div className="mt-4 pt-4 border-t border-[#E9E7DF]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-[#6B6B64]">Second child</p>
                  <button type="button" onClick={() => setShowChild2(false)} className="text-[#A0A09A] hover:text-[#33332F]">
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Child's first name</label>
                    <input className={inputClass} value={child2First} onChange={(e) => setChild2First(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Child's last name</label>
                    <input className={inputClass} value={child2Last} onChange={(e) => setChild2Last(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Birthday</label>
                    <input
                      type="date"
                      className={inputClass}
                      value={child2Birthday}
                      onChange={(e) => setChild2Birthday(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Date care is needed</label>
                    <input
                      type="date"
                      className={inputClass}
                      value={child2DateNeeded}
                      onChange={(e) => setChild2DateNeeded(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[#FAFAF7] border border-[#E9E7DF] p-3 space-y-2">
            <p className="text-[11px] text-[#6B6B64] leading-relaxed">
              <span className="font-semibold text-[#33332F]">Privacy: </span>
              The information above is used only to process your child care inquiry and enrollment at {site}.
              We keep it confidential and share it only as required by Texas child care licensing or other applicable law.
            </p>
            <p className="text-[11px] text-[#6B6B64] leading-relaxed">
              <span className="font-semibold text-[#33332F]">Fees: </span>
              A $175 enrollment fee applies (this may be waived at our discretion). If your child is enrolled,
              the enrollment fee and first week&apos;s tuition are non-refundable if your child does not begin care.
            </p>
            <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-[#33332F]">I have read and understand the notice above.</span>
            </label>
          </div>

          {error && <p className="text-xs text-[#B23E27] bg-[#FBEAE6] rounded-xl px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-[#1F4D47] text-white text-sm font-medium py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit inquiry"}
          </button>
        </form>
      </div>
    </div>
  );
}
