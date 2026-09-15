"use client";

import { useState, useTransition } from "react";
import { staffLeaveLogin } from "@/lib/leave-actions";

export default function StaffLeaveLoginForm() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError("");
        startTransition(() => {
          void staffLeaveLogin(formData).then((result) => {
            if (result?.error) setError(result.error);
          });
        });
      }}
      className="space-y-4 rounded-2xl border border-[#E4E1D8] bg-white p-6 shadow-sm"
    >
      <label className="block text-sm font-medium text-[#33332F]">
        Employee ID
        <input name="staffId" required autoCapitalize="characters" autoComplete="username" className="mt-1.5 w-full rounded-xl border border-[#DCD9CF] px-3 py-3 outline-none focus:border-[#1F4D47]" />
      </label>
      <label className="block text-sm font-medium text-[#33332F]">
        Private PIN
        <input name="pin" required type="password" inputMode="numeric" pattern="[0-9]{4,8}" autoComplete="current-password" className="mt-1.5 w-full rounded-xl border border-[#DCD9CF] px-3 py-3 outline-none focus:border-[#1F4D47]" />
      </label>
      {error && <p className="rounded-lg bg-[#FBEAE6] px-3 py-2 text-sm text-[#A33D28]">{error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-[#1F4D47] py-3 font-semibold text-white disabled:opacity-50">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-xs text-[#85857E]">Ask your director if you have not received a PIN.</p>
    </form>
  );
}