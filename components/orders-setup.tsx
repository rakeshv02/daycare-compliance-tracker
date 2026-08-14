"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, Search, ShoppingCart, ArrowLeft } from "lucide-react";
import { findKrogerStoresAction, saveKrogerStore } from "@/lib/kroger-actions";
import type { StoreResult } from "@/lib/kroger";
import type { Site } from "@/lib/inquiries";
import type { StoreConfig } from "@/app/dashboard/orders/page";

const SITES: Site[] = ["Noah's Arks", "Light House Academy"];

function StoreFinder({ site, current, onSaved }: { site: Site; current: StoreConfig | undefined; onSaved: () => void }) {
  const [zip, setZip] = useState("");
  const [results, setResults] = useState<StoreResult[]>([]);
  const [error, setError] = useState("");
  const [pending, startSearch] = useTransition();
  const [savePending, startSave] = useTransition();

  function search() {
    if (!zip.trim()) return;
    setError("");
    startSearch(async () => {
      try {
        setResults(await findKrogerStoresAction(zip));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed.");
      }
    });
  }

  function save(store: StoreResult) {
    startSave(async () => {
      await saveKrogerStore(site, store);
      setResults([]);
      onSaved();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
      <h3 className="text-sm font-semibold text-[#1F4D47] mb-1" style={{ fontFamily: "Fredoka" }}>{site}</h3>
      {current ? (
        <p className="text-xs text-[#2F7A60] mb-3">
          <CheckCircle2 size={12} className="inline mr-1" />
          Ordering from <span className="font-medium">{current.storeName}</span> — {current.address}
        </p>
      ) : (
        <p className="text-xs text-[#A0A09A] mb-3">No store set yet.</p>
      )}
      <div className="flex gap-2">
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Zip code"
          className="flex-1 px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]"
        />
        <button
          onClick={search}
          disabled={pending}
          className="flex items-center gap-1.5 bg-[#1F4D47] text-white text-xs font-medium px-3 py-2 rounded-xl hover:opacity-90 disabled:opacity-50"
        >
          <Search size={12} /> {pending ? "Searching…" : "Find stores"}
        </button>
      </div>
      {error && <p className="text-xs text-[#B23E27] mt-2">{error}</p>}
      {results.length > 0 && (
        <div className="mt-3 space-y-2">
          {results.map((r) => (
            <div key={r.locationId} className="flex items-center justify-between border border-[#E9E7DF] rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-medium text-[#33332F]">{r.name}</p>
                <p className="text-[10px] text-[#A0A09A]">{r.address}</p>
              </div>
              <button
                onClick={() => save(r)}
                disabled={savePending}
                className="text-[10px] font-semibold text-white bg-[#1F4D47] px-2.5 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Use this store
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersSetup({
  authStatus,
  stores,
  justConnected,
  connectError,
}: {
  authStatus: { connected: boolean; connectedBy: string | null; connectedAt: string | null };
  stores: StoreConfig[];
  justConnected: boolean;
  connectError: string | null;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1F4D47] flex items-center justify-center">
            <ShoppingCart size={20} className="text-[#E0A732]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>Orders Setup</h1>
            <p className="text-xs text-[#A0A09A]">One-time setup — connect Kroger and pick each site's store</p>
          </div>
          <a href="/dashboard/orders" className="ml-auto flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] px-3 py-2 rounded-xl hover:bg-white">
            <ArrowLeft size={14} /> Back to Orders
          </a>
        </div>

        {justConnected && (
          <div className="bg-[#EAF5F0] text-[#2F7A60] rounded-xl px-3 py-2 text-xs flex items-center gap-2">
            <CheckCircle2 size={14} /> Kroger account connected.
          </div>
        )}
        {connectError && (
          <div className="bg-[#FBEAE6] text-[#B23E27] rounded-xl px-3 py-2 text-xs flex items-center gap-2">
            <AlertTriangle size={14} /> {connectError}
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
          <h2 className="text-sm font-semibold text-[#1F4D47] mb-2" style={{ fontFamily: "Fredoka" }}>Kroger account</h2>
          {authStatus.connected ? (
            <p className="text-xs text-[#2F7A60] flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Connected by {authStatus.connectedBy} on{" "}
              {authStatus.connectedAt ? new Date(authStatus.connectedAt).toLocaleDateString() : ""}
            </p>
          ) : (
            <p className="text-xs text-[#A0A09A]">Not connected yet — orders can't be pushed to a real Kroger cart until this is done.</p>
          )}
          <a
            href="/api/kroger/connect"
            className="inline-flex items-center gap-1.5 mt-3 bg-[#1F4D47] text-white text-xs font-medium px-4 py-2.5 rounded-xl hover:opacity-90"
          >
            {authStatus.connected ? "Reconnect Kroger account" : "Connect Kroger account"}
          </a>
          <p className="text-[10px] text-[#A0A09A] mt-2">
            This logs you into Kroger.com in a new step and asks you to approve cart access — do this with your real Kroger.com login.
          </p>
        </div>

        <div className="space-y-4">
          {SITES.map((site) => (
            <StoreFinder key={site} site={site} current={stores.find((s) => s.site === site)} onSaved={() => router.refresh()} />
          ))}
        </div>
      </div>
    </div>
  );
}
