"use client";
import Link from "next/link";

export function ReportControls() {
  return (
    <div className="no-print" style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
      <Link href="/dashboard" className="btn">← Back</Link>
      <button className="btn" onClick={() => window.print()}>🖨 Print report</button>
    </div>
  );
}
