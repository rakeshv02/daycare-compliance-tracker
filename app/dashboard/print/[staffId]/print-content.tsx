"use client";

import { useEffect } from "react";

const TOPIC_LABEL: Record<string, string> = {
  core:  "Core (child dev / curriculum / guidance)",
  abuse: "Abuse/neglect prevention & reporting",
  other: "Other required topics",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    valid: "✔ Valid", expiring: "⚠ Expiring soon", expired: "✘ Expired", missing: "— Not on file",
  };
  return <span>{map[status] ?? status}</span>;
}

type Props = {
  staff: { id: string; name: string; site: string; hireDate: string; role: string };
  credentials: Record<string, { issued: string | null; expires: string }>;
  cprStatus: string;
  bgStatus: string;
  trainingEntries: { date: string; title: string; hours: number; topic: string }[];
  training: { status: string; total: number; core: number; abuse: number; meetsCore: boolean; meetsAbuse: boolean; meetsTotal: boolean; window: { start: Date; end: Date } | null };
  requiredHours: number;
  lifecycle: { isActive: boolean; leavingDate: string | null };
  driver: { isDriver: boolean; dlNumber: string | null; dlExpires: string | null; transportTrainingDate: string | null };
  printedAt: string;
};

export default function PrintContent({
  staff, credentials, cprStatus, bgStatus, trainingEntries, training,
  requiredHours, lifecycle, driver, printedAt,
}: Props) {
  useEffect(() => {
    window.print();
  }, []);

  const cpr = credentials["CPR/First Aid"];
  const bg  = credentials["Background Check"];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; background: #fff; }
        @media print {
          @page { size: letter portrait; margin: 0.75in; }
          .no-print { display: none !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        .page { max-width: 7.5in; margin: 0 auto; padding: 20px; }
        h1 { font-size: 16pt; font-weight: bold; margin-bottom: 2px; }
        h2 { font-size: 12pt; font-weight: bold; margin: 16px 0 6px; border-bottom: 1.5px solid #000; padding-bottom: 2px; }
        .meta { font-size: 9pt; color: #444; margin-bottom: 16px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 8px; }
        .field { display: flex; flex-direction: column; gap: 1px; margin-bottom: 4px; }
        .label { font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #555; }
        .value { font-size: 10.5pt; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 8px; }
        th { background: #f0f0f0; border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 8.5pt; text-transform: uppercase; }
        td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
        .summary-row { display: flex; gap: 32px; margin-top: 8px; font-size: 9.5pt; }
        .summary-item { display: flex; flex-direction: column; }
        .summary-item .s-label { font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #555; }
        .summary-item .s-value { font-size: 11pt; font-weight: bold; }
        .ok { color: #1a6640; }
        .warn { color: #8a5a00; }
        .bad { color: #9a1a00; }
        .print-btn { margin-bottom: 16px; padding: 8px 20px; background: #1F4D47; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 10pt; }
        .sig-line { border-bottom: 1px solid #000; width: 240px; margin-top: 32px; display: inline-block; }
        .footer { margin-top: 24px; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 6px; }
      `}</style>

      <div className="page">
        <button className="print-btn no-print" onClick={() => window.print()}>🖨 Print this page</button>

        <h1>Staff Compliance Record</h1>
        <div className="meta">
          {staff.site} · Printed {printedAt} · Texas HHSC Child Care Licensing
        </div>

        {/* Identity */}
        <h2>Employee Information</h2>
        <div className="grid-2">
          <div className="field"><span className="label">Full name</span><span className="value">{staff.name}</span></div>
          <div className="field"><span className="label">Role</span><span className="value">{staff.role}</span></div>
          <div className="field"><span className="label">Site</span><span className="value">{staff.site}</span></div>
          <div className="field"><span className="label">Employment status</span><span className="value">{lifecycle.isActive ? "Active" : "Inactive"}</span></div>
          <div className="field"><span className="label">Hire date</span><span className="value">{staff.hireDate || "—"}</span></div>
          {lifecycle.leavingDate && (
            <div className="field"><span className="label">Leaving date</span><span className="value">{lifecycle.leavingDate}</span></div>
          )}
          <div className="field"><span className="label">Employee ID</span><span className="value">{staff.id}</span></div>
        </div>

        {/* Credentials */}
        <h2>Credentials</h2>
        <div className="grid-2">
          <div className="field">
            <span className="label">CPR / First Aid</span>
            <span className="value"><StatusBadge status={cprStatus} /></span>
            {cpr && <span style={{ fontSize: "9pt", color: "#444" }}>Issued: {cpr.issued ?? "—"} · Expires: {cpr.expires}</span>}
          </div>
          <div className="field">
            <span className="label">Background Check</span>
            <span className="value"><StatusBadge status={bgStatus} /></span>
            <span style={{ fontSize: "9pt", color: "#444" }}>
              Date: {bg?.issued ?? staff.hireDate ?? "—"}
              {bg?.expires ? ` · Expires: ${bg.expires}` : ""}
            </span>
          </div>
        </div>

        {/* Driver */}
        {driver.isDriver && (
          <>
            <h2>Driver Information</h2>
            <div className="grid-2">
              <div className="field"><span className="label">Driver's license #</span><span className="value">{driver.dlNumber || "—"}</span></div>
              <div className="field"><span className="label">DL expiration</span><span className="value">{driver.dlExpires || "—"}</span></div>
              <div className="field">
                <span className="label">Transportation safety training (2 hrs)</span>
                <span className="value">{driver.transportTrainingDate ? `Completed ${driver.transportTrainingDate}` : "Not on file"}</span>
              </div>
            </div>
          </>
        )}

        {/* Training log — mirrors Form 7250 */}
        <h2>Completed Training — Texas HHSC Form 7250</h2>
        {training.window && (
          <div style={{ fontSize: "10pt", fontWeight: "bold", background: "#f0f0f0", border: "1px solid #ccc", borderRadius: "4px", padding: "6px 10px", marginBottom: "8px", display: "inline-block" }}>
            Training Year: {training.window.start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – {training.window.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            <span style={{ fontWeight: "normal", fontSize: "8.5pt", color: "#555", marginLeft: "8px" }}>(hours do not carry over)</span>
          </div>
        )}

        {trainingEntries.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th style={{ width: "90px" }}>Date</th>
                <th>Title / Description</th>
                <th style={{ width: "55px", textAlign: "center" }}>Hours</th>
                <th style={{ width: "200px" }}>Category</th>
              </tr>
            </thead>
            <tbody>
              {trainingEntries.map((e, i) => (
                <tr key={i}>
                  <td>{e.date}</td>
                  <td>{e.title || "—"}</td>
                  <td style={{ textAlign: "center" }}>{e.hours}</td>
                  <td>{TOPIC_LABEL[e.topic] ?? e.topic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ fontSize: "9.5pt", color: "#666", marginBottom: "8px" }}>No training entries logged for the current training year.</p>
        )}

        {/* Training summary */}
        <div className="summary-row">
          <div className="summary-item">
            <span className="s-label">Total hours</span>
            <span className={`s-value ${training.meetsTotal ? "ok" : "bad"}`}>{training.total} / {requiredHours}</span>
          </div>
          <div className="summary-item">
            <span className="s-label">Core topics (min 6 hrs)</span>
            <span className={`s-value ${training.meetsCore ? "ok" : "warn"}`}>{training.core} hrs</span>
          </div>
          <div className="summary-item">
            <span className="s-label">Abuse/neglect prevention (min 1 hr)</span>
            <span className={`s-value ${training.meetsAbuse ? "ok" : "warn"}`}>{training.abuse} hrs</span>
          </div>
        </div>

        {/* Signature block */}
        <div style={{ marginTop: "32px", display: "flex", gap: "48px" }}>
          <div>
            <div className="sig-line" />
            <div style={{ fontSize: "8.5pt", marginTop: "3px" }}>Director signature</div>
          </div>
          <div>
            <div className="sig-line" />
            <div style={{ fontSize: "8.5pt", marginTop: "3px" }}>Date</div>
          </div>
        </div>

        <div className="footer">
          This document was generated from the Blossoms Connect Staff Compliance Tracker and reflects records on file as of {printedAt}. Retain per Texas HHSC licensing requirements (minimum 2 years).
        </div>
      </div>
    </>
  );
}
