"use client";

import { useState, useTransition } from "react";
import { createStaffLeavePin, getStaffLoginMode, staffLeaveLogin } from "@/lib/leave-actions";

export default function StaffLeaveLoginForm() {
  const [employeeId, setEmployeeId] = useState("");
  const [mode, setMode] = useState<"identify" | "login" | "setup">("identify");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function restart() {
    setMode("identify");
    setError("");
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError("");
        startTransition(() => {
          if (mode === "identify") {
            void getStaffLoginMode(employeeId).then((result) => {
              if (result.error) setError(result.error);
              else if (result.mode) setMode(result.mode);
            });
          } else if (mode === "setup") {
            void createStaffLeavePin(employeeId, String(formData.get("pin") ?? ""), String(formData.get("confirmation") ?? "")).then((result) => {
              if (result?.error) setError(result.error);
            });
          } else {
            void staffLeaveLogin(formData).then((result) => {
              if (result?.error) setError(result.error);
            });
          }
        });
      }}
      className="space-y-4 rounded-2xl border border-[#E4E1D8] bg-white p-6 shadow-sm"
    >
      <label className="block text-sm font-medium text-[#33332F]">
        Employee ID
        <input name="staffId" value={employeeId} onChange={(event) => setEmployeeId(event.target.value.toUpperCase())} readOnly={mode !== "identify"} required autoCapitalize="characters" autoComplete="username" className="mt-1.5 w-full rounded-xl border border-[#DCD9CF] px-3 py-3 outline-none focus:border-[#1F4D47] read-only:bg-[#F4F3EE]" />
      </label>
      {mode === "setup" && <p className="rounded-lg bg-[#EAF5F0] px-3 py-2 text-sm text-[#2F725D]">First login: create your private 4–8 digit PIN.</p>}
      {mode !== "identify" && <label className="block text-sm font-medium text-[#33332F]">
        {mode === "setup" ? "Create PIN" : "Private PIN"}
        <input name="pin" required type="password" inputMode="numeric" pattern="[0-9]{4,8}" autoComplete={mode === "setup" ? "new-password" : "current-password"} className="mt-1.5 w-full rounded-xl border border-[#DCD9CF] px-3 py-3 outline-none focus:border-[#1F4D47]" />
      </label>}
      {mode === "setup" && <label className="block text-sm font-medium text-[#33332F]">
        Confirm PIN
        <input name="confirmation" required type="password" inputMode="numeric" pattern="[0-9]{4,8}" autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-[#DCD9CF] px-3 py-3 outline-none focus:border-[#1F4D47]" />
      </label>}
      {error && <p className="rounded-lg bg-[#FBEAE6] px-3 py-2 text-sm text-[#A33D28]">{error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-[#1F4D47] py-3 font-semibold text-white disabled:opacity-50">{pending ? "Please wait…" : mode === "identify" ? "Continue" : mode === "setup" ? "Create PIN and sign in" : "Sign in"}</button>
      {mode !== "identify" && <button type="button" onClick={restart} className="w-full text-sm text-[#66665F]">Use a different Employee ID</button>}
      <p className="text-center text-xs text-[#85857E]">{mode === "setup" ? "Keep this PIN private. You will use it for future sign-ins." : "Ask your director if you have not received an Employee ID."}</p>
    </form>
  );
}