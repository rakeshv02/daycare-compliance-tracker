"use client";

import { useState, useMemo, useTransition } from "react";
import { signOut } from "next-auth/react";
import {
  ShieldCheck, Search, AlertTriangle, Clock, CheckCircle2, Building2,
  LogOut, Car, Printer, UserX, Settings, UserPlus, Pencil, BarChart2, ShoppingCart,
} from "lucide-react";
import { CredentialModal } from "./credential-modal";
import { TrainingModal } from "./training-modal";
import { EmployeeDetailsModal } from "./employee-details-modal";
import { EmployeeFormModal } from "./employee-form-modal";
import { setStaffRole } from "@/lib/actions";
import {
  ROLE_HOURS, ROLES, DATE_CRED_TYPES,
  trainingStatus, credentialStatus,
} from "@/lib/staff";
import type { SiteFilter, StaffMember, TrainingEntry, LifecycleRecord, DriverInfo } from "@/lib/staff";

type Credentials = Record<string, Record<string, { issued: string | null; expires: string }>>;
type TrainingHours = Record<string, TrainingEntry[]>;
type LifecycleMap = Record<string, LifecycleRecord>;
type DriverMap = Record<string, DriverInfo>;

function statusMeta(status: string) {
  switch (status) {
    case "valid":    return { label: "Valid",         bg: "#EAF5F0", fg: "#2F7A60", dot: "#4A9B7F" };
    case "expiring": return { label: "Expiring soon", bg: "#FCF3E3", fg: "#9A6B14", dot: "#E0A732" };
    case "expired":  return { label: "Expired",       bg: "#FBEAE6", fg: "#B23E27", dot: "#D6634A" };
    default:         return { label: "Not on file",   bg: "#F0F0EE", fg: "#7A7A74", dot: "#A0A09A" };
  }
}

function Pill({ status, children }: { status: string; children?: React.ReactNode }) {
  const m = statusMeta(status);
  return (
    <span style={{ background: m.bg, color: m.fg }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
      <span style={{ background: m.dot }} className="w-1.5 h-1.5 rounded-full" />
      {children ?? m.label}
    </span>
  );
}

const SITES: { value: SiteFilter | "all"; label: string }[] = [
  { value: "all",                label: "All sites" },
  { value: "Noah's Arks",        label: "Noah's Arks" },
  { value: "Light House Academy", label: "Light House Academy" },
];

type StaffWithRole = StaffMember & { role: string };

export default function ComplianceTracker({
  allStaff,
  initialCredentials,
  initialTrainingHours,
  initialRoles,
  initialLifecycle,
  initialDriverInfo,
  sessionSite,
}: {
  allStaff: StaffMember[];
  initialCredentials: Credentials;
  initialTrainingHours: TrainingHours;
  initialRoles: Record<string, string>;
  initialLifecycle: LifecycleMap;
  initialDriverInfo: DriverMap;
  sessionSite: SiteFilter;
}) {
  const [siteFilter, setSiteFilter] = useState<SiteFilter | "all">(sessionSite === "all" ? "all" : sessionSite);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<StaffWithRole | null>(null);
  const [trainModal, setTrainModal] = useState<StaffWithRole | null>(null);
  const [detailModal, setDetailModal] = useState<StaffWithRole | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<{ staff: StaffWithRole; isDbOnly: boolean } | null>(null);
  const [, startTransition] = useTransition();

  const STAFF = useMemo(
    () => allStaff.map((s) => ({ ...s, role: initialRoles[s.id] ?? "Caregiver" })),
    [allStaff, initialRoles]
  );

  const availableSites = sessionSite === "all"
    ? SITES
    : SITES.filter((s) => s.value === sessionSite || s.value === "all");

  const filtered = useMemo(
    () => STAFF.filter((s) => {
      const isActive = initialLifecycle[s.id]?.isActive ?? true;
      const siteOk    = siteFilter === "all" || s.site === siteFilter;
      const sessionOk = sessionSite === "all" || s.site === sessionSite;
      const activeOk  = showInactive ? true : isActive;
      const searchOk  = s.name.toLowerCase().includes(q.toLowerCase());
      return siteOk && sessionOk && activeOk && searchOk;
    }),
    [STAFF, siteFilter, sessionSite, q, showInactive, initialLifecycle]
  );

  const summary = useMemo(() => {
    let missing = 0, expiring = 0, expired = 0, valid = 0;
    const scopedStaff = sessionSite === "all" ? STAFF : STAFF.filter((s) => s.site === sessionSite);
    scopedStaff.filter((s) => initialLifecycle[s.id]?.isActive !== false).forEach((s) => {
      DATE_CRED_TYPES.forEach((t) => {
        const rec = initialCredentials[s.id]?.[t];
        const st = t === "Background Check" && !rec && s.hireDate ? "valid" : credentialStatus(rec?.expires ?? null);
        if (st === "missing") missing++; else if (st === "expiring") expiring++; else if (st === "expired") expired++; else valid++;
      });
      const tr = trainingStatus(initialTrainingHours[s.id] ?? [], ROLE_HOURS[s.role] ?? 24, s.hireDate);
      if (tr.status === "missing") missing++; else if (tr.status === "expiring") expiring++; else if (tr.status === "expired") expired++; else valid++;
    });
    return { missing, expiring, expired, valid };
  }, [STAFF, initialCredentials, initialTrainingHours, sessionSite, initialLifecycle]);

  function handleRoleChange(staffId: string, role: string) {
    startTransition(() => setStaffRole(staffId, role));
  }

  const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  function openPrint(staffId: string) {
    window.open(`${BASE}/dashboard/print/${staffId}`, "_blank");
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1F4D47] flex items-center justify-center">
              <ShieldCheck size={20} className="text-[#E0A732]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>
                Staff Compliance Tracker
              </h1>
              <p className="text-xs text-[#A0A09A]">
                {STAFF.length} staff · Texas HHSC Form 7250 · saved automatically
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`${BASE}/dashboard/waitlist`}
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <UserPlus size={14} /> Waitlist
            </a>
            <a
              href={`${BASE}/dashboard/orders`}
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <ShoppingCart size={14} /> Orders
            </a>
            <a
              href={`${BASE}/dashboard/report`}
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <BarChart2 size={14} /> Report
            </a>
            <button
              onClick={() => signOut({ callbackUrl: `${BASE}/login` })}
              className="flex items-center gap-1.5 text-xs text-[#6B6B64] hover:text-[#33332F] transition px-3 py-2 rounded-xl hover:bg-white"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">
              <CheckCircle2 size={13} className="text-[#4A9B7F]" />Valid / complete
            </div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.valid}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">
              <Clock size={13} className="text-[#E0A732]" />In progress / expiring
            </div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.expiring}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">
              <AlertTriangle size={13} className="text-[#D6634A]" />Expired
            </div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.expired}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E9E7DF] p-4">
            <div className="text-xs font-semibold text-[#6B6B64] uppercase tracking-wide mb-1">Not on file</div>
            <p className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>{summary.missing}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A09A]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search staff…"
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
          <label className="flex items-center gap-2 text-xs text-[#6B6B64] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            <UserX size={13} /> Show inactive staff
          </label>
          <button
            onClick={() => setAddModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[#1F4D47] text-white px-3 py-2 rounded-xl hover:opacity-90 transition"
          >
            <UserPlus size={14} /> Add employee
          </button>
        </div>
        <p className="text-xs text-[#A0A09A] -mt-2">
          {filtered.length} staff shown{siteFilter !== "all" ? ` at ${siteFilter}` : ""}{showInactive ? " (including inactive)" : ""}
        </p>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-[#E9E7DF] overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#A0A09A] border-b border-[#E9E7DF] bg-[#FAFAF7]">
                <th className="px-5 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                {DATE_CRED_TYPES.map((t) => (
                  <th key={t} className="px-4 py-3 font-semibold">{t}</th>
                ))}
                <th className="px-4 py-3 font-semibold">Training hours</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isActive     = initialLifecycle[s.id]?.isActive ?? true;
                const leavingDate  = initialLifecycle[s.id]?.leavingDate ?? null;
                const isDriver     = initialDriverInfo[s.id]?.isDriver ?? false;
                const tr           = trainingStatus(initialTrainingHours[s.id] ?? [], ROLE_HOURS[s.role] ?? 24, s.hireDate);
                const isDbOnly     = s.id.startsWith("DB_");
                return (
                  <tr key={s.id} className={`border-b border-[#F0F0EE] last:border-0 transition ${isActive ? "hover:bg-[#FAFAF7]" : "bg-[#F9F9F7] opacity-70"}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-[#4A9B7F]" : "bg-[#A0A09A]"}`} title={isActive ? "Active" : "Inactive"} />
                        <div>
                          <div className="font-medium text-[#33332F] flex items-center gap-1.5">
                            {s.name}
                            {isDriver && <span title="Driver"><Car size={12} className="text-[#6B6B64]" /></span>}
                          </div>
                          <div className="text-xs text-[#A0A09A]">
                            {s.site}
                            {s.hireDate ? ` · hired ${s.hireDate}` : ""}
                            {leavingDate ? ` · left ${leavingDate}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <select
                        defaultValue={s.role}
                        onChange={(e) => handleRoleChange(s.id, e.target.value)}
                        className="text-xs border border-[#E9E7DF] rounded-lg px-2 py-1.5 outline-none bg-white"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    {DATE_CRED_TYPES.map((t) => {
                      const rec = initialCredentials[s.id]?.[t];
                      const st = t === "Background Check" && !rec && s.hireDate
                        ? "valid"
                        : credentialStatus(rec?.expires ?? null);
                      const issuedDisplay = rec?.issued ?? (t === "Background Check" ? s.hireDate : null);
                      return (
                        <td key={t} className="px-4 py-3.5">
                          <button onClick={() => setModal(s)} className="text-left">
                            <Pill status={st} />
                            {(issuedDisplay || rec?.expires) && (
                              <div className="text-[10px] text-[#A0A09A] mt-1 font-mono" style={{ fontFamily: "IBM Plex Mono" }}>
                                {issuedDisplay && `${t === "Background Check" ? "date" : "issued"} ${issuedDisplay}`}
                                {rec?.expires && ` · exp ${rec.expires}`}
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3.5">
                      <button onClick={() => setTrainModal(s)} className="text-left">
                        <Pill status={tr.status}>{tr.total}/{ROLE_HOURS[s.role] ?? 24} hrs</Pill>
                        {!tr.meetsCore && tr.total > 0 && (
                          <div className="text-[10px] text-[#9A6B14] mt-1">core topics short</div>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        {(sessionSite === "all" || isDbOnly) && (
                          <button
                            onClick={() => setEditModal({ staff: s, isDbOnly })}
                            title="Edit employee"
                            className="p-1.5 rounded-lg text-[#A0A09A] hover:text-[#1F4D47] hover:bg-[#F0F0EE] transition"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setDetailModal(s)}
                          title="Employee details / driver info"
                          className="p-1.5 rounded-lg text-[#A0A09A] hover:text-[#1F4D47] hover:bg-[#F0F0EE] transition"
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          onClick={() => openPrint(s.id)}
                          title="Print staff sheet"
                          className="p-1.5 rounded-lg text-[#A0A09A] hover:text-[#1F4D47] hover:bg-[#F0F0EE] transition"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-[#A0A09A] py-8">No staff match that search.</p>
        )}
      </div>

      {modal && <CredentialModal staff={modal} onClose={() => setModal(null)} />}
      {trainModal && (
        <TrainingModal
          staff={trainModal}
          requiredHours={ROLE_HOURS[trainModal.role] ?? 24}
          entries={initialTrainingHours[trainModal.id] ?? []}
          onClose={() => setTrainModal(null)}
        />
      )}
      {detailModal && (
        <EmployeeDetailsModal
          staff={detailModal}
          lifecycle={initialLifecycle[detailModal.id] ?? { isActive: true, leavingDate: null }}
          driverInfo={initialDriverInfo[detailModal.id] ?? { isDriver: false, dlNumber: null, dlExpires: null, transportTrainingDate: null }}
          onClose={() => setDetailModal(null)}
        />
      )}
      {addModal && (
        <EmployeeFormModal
          mode={{ type: "add" }}
          sessionSite={sessionSite}
          onClose={() => setAddModal(false)}
        />
      )}
      {editModal && (
        <EmployeeFormModal
          mode={{ type: "edit", staff: editModal.staff, isDbOnly: editModal.isDbOnly }}
          sessionSite={sessionSite}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}
