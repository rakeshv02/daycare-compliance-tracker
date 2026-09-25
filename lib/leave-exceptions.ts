import type { AttendanceDay } from "./attendance";

export const EXCEPTION_TYPES = [
  { key: "late", label: "Late arrivals", singular: "Late arrival", short: "LA", color: "#AC5426", background: "#FAE9DD" },
  { key: "early", label: "Early departures", singular: "Early departure", short: "ED", color: "#8A4D85", background: "#F5E9F3" },
  { key: "overtime", label: "Overtime days", singular: "Overtime", short: "OT", color: "#236F68", background: "#E0F2EE" },
  { key: "missingPunch", label: "Missing punches", singular: "Missing punch", short: "MP", color: "#A43E39", background: "#FBE9E6" },
  { key: "missingDay", label: "Missing scheduled days", singular: "Missing scheduled day", short: "MS", color: "#525CA0", background: "#E9ECFA" },
] as const;

export type ExceptionKind = (typeof EXCEPTION_TYPES)[number]["key"];
export type SummaryException = {
  date: string;
  kind: ExceptionKind;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  firstIn: string | null;
  lastOut: string | null;
  classification: string;
  note: string;
};

const PUNCH_EXCEPTION_KINDS: { label: string; kind: ExceptionKind }[] = [
  { label: "Late arrival", kind: "late" },
  { label: "Early departure", kind: "early" },
  { label: "Overtime", kind: "overtime" },
  { label: "Missing punch", kind: "missingPunch" },
];

export function buildSummaryExceptions(days: AttendanceDay[], missingDates: string[]): SummaryException[] {
  const punchExceptions = days.flatMap((day) =>
    PUNCH_EXCEPTION_KINDS.filter(({ label }) => day.exceptions.includes(label)).map(({ kind }) => ({
      date: day.date,
      kind,
      scheduledStart: day.scheduledStart,
      scheduledEnd: day.scheduledEnd,
      firstIn: day.firstIn,
      lastOut: day.lastOut,
      classification: day.classification,
      note: day.note,
    })),
  );
  return [
    ...punchExceptions,
    ...missingDates.map((date) => ({
      date,
      kind: "missingDay" as const,
      scheduledStart: null,
      scheduledEnd: null,
      firstIn: null,
      lastOut: null,
      classification: "",
      note: "",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}