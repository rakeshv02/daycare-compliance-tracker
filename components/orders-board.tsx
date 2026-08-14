"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Settings, AlertTriangle,
  CheckCircle2, History, ListChecks, PackagePlus, X,
} from "lucide-react";
import {
  searchKrogerProductsAction, submitKrogerOrder, getSavedListItems,
  addCustomSavedListItem, removeSavedListItemAction,
} from "@/lib/kroger-actions";
import type { ProductResult } from "@/lib/kroger";
import type { SavedListItem, PendingOrder } from "@/lib/kroger-actions";
import type { SiteFilter } from "@/lib/staff";
import type { Site } from "@/lib/inquiries";
import type { StoreConfig, OrderHistoryEntry } from "@/app/dashboard/orders/page";
import PendingOrdersPanel from "@/components/pending-orders-panel";

const ALL_SITES: Site[] = ["Noah's Arks", "Light House Academy"];

type CartLine = { upc: string | null; name: string; brand: string | null; price: number | null; quantity: number; isCustom: boolean };

function money(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

function statusLabel(status: string, error: string | null) {
  if (status === "failed") return <span className="text-[#B23E27] text-xs" title={error ?? ""}>Failed</span>;
  if (status === "pending") return <span className="text-[#9A6B14] text-xs">Waiting for director</span>;
  return <span className="text-[#2F7A60] text-xs">Pushed to cart</span>;
}

const cartKey = (l: { upc: string | null; name: string }) => l.upc ?? `custom:${l.name}`;

export default function OrdersBoard({
  sessionSite,
  stores,
  history,
  pendingOrders,
}: {
  sessionSite: SiteFilter;
  stores: StoreConfig[];
  history: OrderHistoryEntry[];
  pendingOrders: PendingOrder[];
}) {
  const router = useRouter();
  const availableSites = sessionSite === "all" ? ALL_SITES : [sessionSite as Site];
  const [activeSite, setActiveSite] = useState<Site>(availableSites[0]);
  const [showHistory, setShowHistory] = useState(false);
  const isDirector = sessionSite === "all";

  // Cart is kept per-site so switching tabs doesn't lose either list.
  const [carts, setCarts] = useState<Record<string, CartLine[]>>({});
  const cart = carts[activeSite] ?? [];

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searchPending, startSearch] = useTransition();

  const [submitPending, startSubmit] = useTransition();
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Standard list (built from receipts, exact UPCs)
  const [savedList, setSavedList] = useState<SavedListItem[]>([]);
  const [savedListLoading, setSavedListLoading] = useState(true);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const [customFrequency, setCustomFrequency] = useState<"weekly" | "occasional">("occasional");
  const [customPending, startCustom] = useTransition();

  const store = stores.find((s) => s.site === activeSite);

  useEffect(() => {
    setSavedListLoading(true);
    getSavedListItems(activeSite)
      .then(setSavedList)
      .catch(() => setSavedList([]))
      .finally(() => setSavedListLoading(false));
  }, [activeSite]);

  function setCart(site: Site, updater: (prev: CartLine[]) => CartLine[]) {
    setCarts((prev) => ({ ...prev, [site]: updater(prev[site] ?? []) }));
  }

  function doSearch() {
    if (!term.trim()) return;
    setSearchError("");
    startSearch(async () => {
      try {
        const r = await searchKrogerProductsAction(term, activeSite);
        setResults(r);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed.");
        setResults([]);
      }
    });
  }

  function addLine(line: Omit<CartLine, "quantity">, quantity: number) {
    setCart(activeSite, (prev) => {
      const key = cartKey(line);
      const existing = prev.find((l) => cartKey(l) === key);
      if (existing) return prev.map((l) => (cartKey(l) === key ? { ...l, quantity: l.quantity + quantity } : l));
      return [...prev, { ...line, quantity }];
    });
  }

  function addProduct(p: ProductResult, quantity = 1) {
    addLine({ upc: p.upc, name: p.name, brand: p.brand, price: p.promoPrice ?? p.price, isCustom: false }, quantity);
  }

  function addSavedItem(item: SavedListItem) {
    addLine(
      { upc: item.upc, name: item.name, brand: item.brand, price: item.promoPrice ?? item.price, isCustom: item.isCustom },
      item.defaultQuantity
    );
  }

  function addAllByFrequency(frequency: "weekly" | "occasional") {
    for (const item of savedList.filter((i) => i.frequency === frequency)) addSavedItem(item);
  }

  function changeQty(line: CartLine, delta: number) {
    const key = cartKey(line);
    setCart(activeSite, (prev) =>
      prev.map((l) => (cartKey(l) === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)).filter((l) => l.quantity > 0)
    );
  }

  function removeLine(line: CartLine) {
    const key = cartKey(line);
    setCart(activeSite, (prev) => prev.filter((l) => cartKey(l) !== key));
  }

  const cartTotal = useMemo(() => cart.reduce((sum, l) => sum + (l.price ?? 0) * l.quantity, 0), [cart]);

  function saveCustomToList() {
    if (!customName.trim()) return;
    startCustom(async () => {
      await addCustomSavedListItem(activeSite, customName, customQty, customFrequency);
      setCustomName("");
      setCustomQty(1);
      setSavedList(await getSavedListItems(activeSite));
      setShowCustomForm(false);
    });
  }

  function addCustomToCartOnly() {
    if (!customName.trim()) return;
    addLine({ upc: null, name: customName.trim(), brand: null, price: null, isCustom: true }, customQty);
    setCustomName("");
    setCustomQty(1);
    setShowCustomForm(false);
  }

  function removeSavedItem(id: number) {
    startCustom(async () => {
      await removeSavedListItemAction(id);
      setSavedList((prev) => prev.filter((i) => i.id !== id));
    });
  }

  function submit() {
    if (!cart.length) return;
    const confirmed = window.confirm(
      `Submit ${cart.length} item(s) for ${activeSite}?\n\n` +
        (isDirector
          ? `This will wait in the review queue below — push it to Kroger when you're ready.`
          : `A director will review this and place the order on Kroger — you won't need to do anything else.`)
    );
    if (!confirmed) return;

    setSubmitResult(null);
    startSubmit(async () => {
      const result = await submitKrogerOrder(activeSite, cart);
      if (result.ok) {
        setSubmitResult({
          ok: true,
          message: isDirector
            ? `Submitted — find it in "Waiting for you to order" below to push it.`
            : `Submitted for ${activeSite}. A director will place the order on Kroger shortly.`,
        });
        setCart(activeSite, () => []);
        router.refresh();
      } else {
        setSubmitResult({ ok: false, message: result.error });
      }
    });
  }

  const weeklyItems = savedList.filter((i) => i.frequency === "weekly");
  const occasionalItems = savedList.filter((i) => i.frequency === "occasional");

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-[#1F4D47] flex items-center justify-center">
            <ShoppingCart size={20} className="text-[#E0A732]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
              Grocery Ordering
            </h1>
            <p className="text-xs text-[#A0A09A]">Pick from the standard list, search for anything else, submit for ordering</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <History size={14} /> {showHistory ? "Hide" : "Show"} order history
            </button>
            <a
              href="/dashboard/orders/setup"
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <Settings size={14} /> Setup
            </a>
            <a
              href="/dashboard"
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              Compliance tracker
            </a>
          </div>
        </div>

        {isDirector && <PendingOrdersPanel orders={pendingOrders} />}

        {availableSites.length > 1 && (
          <div className="flex gap-2">
            {availableSites.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSite(s)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  activeSite === s ? "bg-[#1F4D47] text-white" : "bg-white text-[#6B6B64] border border-[#E9E7DF]"
                }`}
              >
                {s} {carts[s]?.length ? `(${carts[s].length})` : ""}
              </button>
            ))}
          </div>
        )}

        {!store ? (
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-6 text-center">
            <AlertTriangle size={20} className="text-[#E0A732] mx-auto mb-2" />
            <p className="text-sm text-[#33332F] font-medium">No Kroger store set up yet for {activeSite}.</p>
            <a href="/dashboard/orders/setup" className="text-xs text-[#1F4D47] underline mt-2 inline-block">
              Go to Setup to find and save the store
            </a>
          </div>
        ) : (
          <>
            <p className="text-xs text-[#A0A09A]">
              Shopping at <span className="font-medium text-[#33332F]">{store.storeName}</span> — {store.address}
            </p>

            {/* Standard list */}
            <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[#1F4D47] flex items-center gap-1.5" style={{ fontFamily: "Fredoka" }}>
                  <ListChecks size={16} /> {activeSite}'s standard list
                </h2>
                <button
                  onClick={() => setShowCustomForm((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#1F4D47] hover:opacity-70"
                >
                  <PackagePlus size={14} /> Add item not in Kroger's catalog
                </button>
              </div>

              {showCustomForm && (
                <div className="mb-4 p-3 rounded-xl bg-[#FAFAF7] border border-[#E9E7DF] space-y-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Item name (e.g. birthday cake order)"
                      className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]"
                    />
                    <input
                      type="number"
                      min={1}
                      value={customQty}
                      onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]"
                    />
                    <select
                      value={customFrequency}
                      onChange={(e) => setCustomFrequency(e.target.value as "weekly" | "occasional")}
                      className="px-2 py-2 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47]"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="occasional">Occasional</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={addCustomToCartOnly}
                      disabled={!customName.trim()}
                      className="text-xs font-semibold text-white bg-[#1F4D47] px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      Add to this order only
                    </button>
                    <button
                      onClick={saveCustomToList}
                      disabled={!customName.trim() || customPending}
                      className="text-xs font-semibold text-[#1F4D47] bg-white border border-[#1F4D47] px-3 py-1.5 rounded-lg hover:bg-[#F0F0EE] disabled:opacity-50"
                    >
                      Add to standard list &amp; this order
                    </button>
                  </div>
                  <p className="text-[10px] text-[#A0A09A]">
                    Not in Kroger's catalog — won't be pushed automatically. Whoever pushes the order will need to add it on Kroger.com themselves.
                  </p>
                </div>
              )}

              {savedListLoading ? (
                <p className="text-xs text-[#A0A09A]">Loading…</p>
              ) : savedList.length === 0 ? (
                <p className="text-xs text-[#A0A09A]">No standard list yet for {activeSite}.</p>
              ) : (
                <div className="space-y-4">
                  {weeklyItems.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Weekly ({weeklyItems.length})</p>
                        <button onClick={() => addAllByFrequency("weekly")} className="text-[10px] font-semibold text-[#1F4D47] hover:underline">
                          Add all weekly
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-1.5">
                        {weeklyItems.map((item) => (
                          <SavedItemRow key={item.id} item={item} onAdd={() => addSavedItem(item)} onRemove={() => removeSavedItem(item.id)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {occasionalItems.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Occasional ({occasionalItems.length})</p>
                        <button onClick={() => addAllByFrequency("occasional")} className="text-[10px] font-semibold text-[#1F4D47] hover:underline">
                          Add all occasional
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-1.5">
                        {occasionalItems.map((item) => (
                          <SavedItemRow key={item.id} item={item} onAdd={() => addSavedItem(item)} onRemove={() => removeSavedItem(item.id)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Search for anything else */}
            <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
              <h2 className="text-sm font-semibold text-[#1F4D47] mb-2" style={{ fontFamily: "Fredoka" }}>
                Search for something else
              </h2>
              <div className="flex gap-2">
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder="Search products (e.g. milk, apple juice, paper towels)"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-[#E9E7DF] text-sm outline-none focus:border-[#1F4D47] bg-white"
                />
                <button
                  onClick={doSearch}
                  disabled={searchPending}
                  className="flex items-center gap-1.5 bg-[#1F4D47] text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50"
                >
                  <Search size={14} /> {searchPending ? "Searching…" : "Search"}
                </button>
              </div>
              {searchError && <p className="text-xs text-[#B23E27] mt-2">{searchError}</p>}

              {results.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                  {results.map((p) => (
                    <div key={p.upc} className="border border-[#E9E7DF] rounded-xl p-3 flex gap-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="w-12 h-12 object-contain flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 bg-[#F0F0EE] rounded-lg flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#33332F] leading-snug line-clamp-2">{p.name}</p>
                        {p.size && <p className="text-[10px] text-[#A0A09A]">{p.size}</p>}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-semibold text-[#1F4D47]">
                            {money(p.promoPrice ?? p.price)}
                            {p.promoPrice && p.price && p.promoPrice < p.price && (
                              <span className="text-[10px] text-[#A0A09A] line-through ml-1">{money(p.price)}</span>
                            )}
                          </span>
                          <button
                            onClick={() => addProduct(p)}
                            className="text-[10px] font-semibold text-white bg-[#1F4D47] px-2 py-1 rounded-lg hover:opacity-90"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart */}
            <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
              <h2 className="text-sm font-semibold text-[#1F4D47] mb-3" style={{ fontFamily: "Fredoka" }}>
                Your list for {activeSite} ({cart.length})
              </h2>
              {cart.length === 0 ? (
                <p className="text-xs text-[#A0A09A]">Nothing added yet — pick from the standard list above or search.</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((l) => (
                    <div key={cartKey(l)} className="flex items-center gap-3 border-b border-[#F0F0EE] last:border-0 pb-2 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#33332F] truncate">
                          {l.name} {l.isCustom && <span className="text-[9px] text-[#9A6B14] font-normal">(not in Kroger catalog)</span>}
                        </p>
                        <p className="text-[10px] text-[#A0A09A]">{l.price != null ? `${money(l.price)} each` : "price unknown"}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => changeQty(l, -1)} className="w-6 h-6 rounded-full border border-[#E9E7DF] flex items-center justify-center hover:bg-[#F0F0EE]">
                          <Minus size={10} />
                        </button>
                        <span className="text-xs w-5 text-center">{l.quantity}</span>
                        <button onClick={() => changeQty(l, 1)} className="w-6 h-6 rounded-full border border-[#E9E7DF] flex items-center justify-center hover:bg-[#F0F0EE]">
                          <Plus size={10} />
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-[#33332F] w-16 text-right">{money(l.price != null ? l.price * l.quantity : null)}</span>
                      <button onClick={() => removeLine(l)} className="text-[#A0A09A] hover:text-[#B23E27]">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-[#A0A09A]">Estimated total (Kroger's checkout price may differ)</span>
                    <span className="text-sm font-semibold text-[#1F4D47]">{money(cartTotal)}</span>
                  </div>
                </div>
              )}

              {submitResult && (
                <div
                  className={`mt-3 rounded-xl px-3 py-2 text-xs flex items-start gap-2 ${
                    submitResult.ok ? "bg-[#EAF5F0] text-[#2F7A60]" : "bg-[#FBEAE6] text-[#B23E27]"
                  }`}
                >
                  {submitResult.ok ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />}
                  <span>{submitResult.message}</span>
                </div>
              )}

              <button
                onClick={submit}
                disabled={!cart.length || submitPending}
                className="w-full mt-3 bg-[#1F4D47] text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {submitPending ? "Submitting…" : `Submit ${activeSite} order`}
              </button>
            </div>
          </>
        )}

        {showHistory && (
          <div className="bg-white rounded-xl border border-[#E9E7DF] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E9E7DF]">
              <p className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">Order history</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E9E7DF] text-left text-xs font-semibold text-[#6B6B64] uppercase tracking-wide">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Site</th>
                  <th className="px-4 py-2">Submitted by</th>
                  <th className="px-4 py-2">Items</th>
                  <th className="px-4 py-2">Est. total</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((o) => (
                  <tr key={o.id} className="border-b border-[#F0F0EE] last:border-0 align-top">
                    <td className="px-4 py-2.5 text-xs text-[#A0A09A] whitespace-nowrap">{new Date(o.submittedAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-[#33332F]">{o.site}</td>
                    <td className="px-4 py-2.5 text-[#33332F]">{o.submittedBy}</td>
                    <td className="px-4 py-2.5 text-[#6B6B64]">
                      {o.itemCount} item(s)
                      <div className="text-[10px] text-[#A0A09A]">{o.items.map((i) => i.name).join(", ")}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[#33332F]">{money(o.estimatedTotal)}</td>
                    <td className="px-4 py-2.5">{statusLabel(o.status, o.error)}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#A0A09A]">No orders yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SavedItemRow({ item, onAdd, onRemove }: { item: SavedListItem; onAdd: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 border border-[#E9E7DF] rounded-lg px-2.5 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#33332F] truncate">
          {item.name} {item.isCustom && <span className="text-[9px] text-[#9A6B14] font-normal">(manual)</span>}
        </p>
        <p className="text-[10px] text-[#A0A09A]">
          x{item.defaultQuantity} usually{item.price != null ? ` · ${money(item.price)} ea` : ""}
        </p>
      </div>
      <button onClick={onAdd} className="text-[10px] font-semibold text-white bg-[#1F4D47] px-2 py-1 rounded-lg hover:opacity-90 flex-shrink-0">
        Add
      </button>
      <button onClick={onRemove} className="text-[#A0A09A] hover:text-[#B23E27] flex-shrink-0" title="Remove from standard list">
        <X size={12} />
      </button>
    </div>
  );
}
