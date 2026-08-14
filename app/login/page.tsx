"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Incorrect username or password.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#1F4D47] flex items-center justify-center">
            <ShieldCheck size={20} className="text-[#E0A732]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
              Staff Compliance Tracker
            </h1>
            <p className="text-xs text-[#A0A09A]">Noah's Arks · Light House Academy</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E9E7DF] p-6">
          <h2 className="font-semibold text-[#1F4D47] mb-5" style={{ fontFamily: "Fredoka" }}>
            Sign in
          </h2>
          {params.get("error") && !error && (
            <p className="text-xs text-[#B23E27] bg-[#FBEAE6] rounded-xl px-3 py-2 mb-4">
              Session expired — please sign in again.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="noahs / lighthouse / director"
                className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6B6B64] block mb-1">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]"
                required
              />
            </div>
            {error && (
              <p className="text-xs text-[#B23E27] bg-[#FBEAE6] rounded-xl px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 bg-[#1F4D47] text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
