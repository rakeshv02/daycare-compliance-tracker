"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { pushOrderToKroger } from "@/lib/kroger-actions";
import type { PendingOrder } from "@/lib/kroger-actions";

function money(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

export default function PendingOrdersPanel({ orders }: { orders: PendingOrder[] }) {
  const router = useRouter();
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);

  function push(order: PendingOrder) {
    const customCount = order.items.filter((i) => i.isCustom).length;
    const confirmed = window.confirm(
      `Push ${order.site}'s order (${order.items.length} item(s)) into your live Kroger cart?\n\n` +
        (customCount
          ? `${customCount} item(s) aren't in Kroger's catalog and won't be pushed — you'll need to add those manually.\n\n`
          : "") +
        `Complete checkout on Kroger.com for this order before pushing another site's order, since it's one shared cart.`
    );
    if (!confirmed) return;

    setPushingId(order.id);
    setResult(null);
    startTransition(async () => {
      const r = await pushOrderToKroger(order.id);
      setResult({
        id: order.id,
        ok: r.ok,
        message: r.ok ? (r.skipped.length ? `Pushed to your Kroger cart. Add manually: ${r.skipped.join(", ")}` : "Pushed to your Kroger cart.") : r.error,
      });
      setPushingId(null);
      router.refresh();
    });
  }

  if (!orders.length) return null;

  return (
    <div className="bg-white rounded-xl border border-[#E0A732] p-4">
      <h2 className="text-sm font-semibold text-[#1F4D47] mb-1 flex items-center gap-1.5" style={{ fontFamily: "Fredoka" }}>
        <Clock size={16} className="text-[#E0A732]" /> Waiting for you to order ({orders.length})
      </h2>
      <p className="text-xs text-[#A0A09A] mb-3">
        Push one at a time and finish checkout on Kroger.com before pushing the next — both sites share one Kroger cart.
      </p>
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="border border-[#E9E7DF] rounded-xl p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-medium text-[#33332F]">
                  {o.site} <span className="text-xs text-[#A0A09A] font-normal">— submitted by {o.submittedBy}</span>
                </p>
                <p className="text-[10px] text-[#A0A09A]">{new Date(o.submittedAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => push(o)}
                disabled={pending && pushingId === o.id}
                className="bg-[#1F4D47] text-white text-xs font-medium px-3 py-2 rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {pending && pushingId === o.id ? "Pushing…" : "Push to Kroger"}
              </button>
            </div>
            <p className="text-xs text-[#6B6B64] mt-2">
              {o.items.map((i) => `${i.name} (x${i.quantity})${i.isCustom ? " [not in Kroger catalog]" : ""}`).join(", ")}
            </p>
            <p className="text-[10px] text-[#A0A09A] mt-1">Estimated total: {money(o.estimatedTotal)}</p>

            {result?.id === o.id && (
              <div
                className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs flex items-start gap-1.5 ${
                  result.ok ? "bg-[#EAF5F0] text-[#2F7A60]" : "bg-[#FBEAE6] text-[#B23E27]"
                }`}
              >
                {result.ok ? <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />}
                <span>
                  {result.message}
                  {result.ok && (
                    <>
                      {" "}
                      <a href="https://www.kroger.com/cart" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
                        Open Kroger cart <ExternalLink size={10} />
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
