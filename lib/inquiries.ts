import type { SiteFilter } from "./staff";

export type Site = "Noah's Arks" | "Light House Academy";

// URL-friendly slugs used in /inquiry/[site]
export const SITE_SLUGS: Record<string, Site> = {
  noahs: "Noah's Arks",
  lighthouse: "Light House Academy",
};

export function siteFromSlug(slug: string): Site | null {
  return SITE_SLUGS[slug.toLowerCase()] ?? null;
}

export function slugFromSite(site: Site): string {
  return site === "Noah's Arks" ? "noahs" : "lighthouse";
}

export const REGISTRATION_TYPES = ["Parent Pay", "CCS/Subsidy", "Employee Discount", "Other"] as const;

export type Inquiry = {
  id: number;
  site: Site;
  createdAt: string;

  parentFirst: string;
  parentLast: string;
  phone: string;
  email: string | null;

  child1First: string | null;
  child1Last: string | null;
  child1Birthday: string | null;
  child1DateNeeded: string | null;

  child2First: string | null;
  child2Last: string | null;
  child2Birthday: string | null;
  child2DateNeeded: string | null;

  tourTime: string | null;
  tourCompleted: boolean;
  tourCompletedAt: string | null;

  thankYouSent: boolean;
  thankYouSentAt: string | null;
  thankYouError: string | null;

  enrolled: boolean;
  startDate: string | null;
  registrationType: string | null;
  assignedClassroom: string | null;
  paperworkReturnedDate: string | null;
  teacherNotified: boolean;
  registrationPaid: boolean;
  notes: string | null;

  flagged: boolean;
  flagReason: string | null;
  ccsApproved: boolean;

  auditLog: AuditLogEntry[];
};

export type AuditLogEntry = {
  action: string;
  staffName: string;
  detail: string | null;
  createdAt: string;
};

// Row shape as it comes back from `pg` (snake_case, dates as text via ::text casts)
export type InquiryRow = {
  id: number;
  site: string;
  created_at: string;
  parent_first: string;
  parent_last: string;
  phone: string;
  email: string | null;
  child1_first: string | null;
  child1_last: string | null;
  child1_birthday: string | null;
  child1_date_needed: string | null;
  child2_first: string | null;
  child2_last: string | null;
  child2_birthday: string | null;
  child2_date_needed: string | null;
  tour_time: string | null;
  tour_completed: boolean;
  tour_completed_at: string | null;
  thank_you_sent: boolean;
  thank_you_sent_at: string | null;
  thank_you_error: string | null;
  enrolled: boolean;
  start_date: string | null;
  registration_type: string | null;
  assigned_classroom: string | null;
  paperwork_returned_date: string | null;
  teacher_notified: boolean;
  registration_paid: boolean;
  notes: string | null;
  flagged: boolean;
  flag_reason: string | null;
  ccs_approved: boolean;
};

export function mapInquiryRow(r: InquiryRow, auditLog: AuditLogEntry[] = []): Inquiry {
  return {
    id: r.id,
    site: r.site as Site,
    createdAt: r.created_at,
    parentFirst: r.parent_first,
    parentLast: r.parent_last,
    phone: r.phone,
    email: r.email,
    child1First: r.child1_first,
    child1Last: r.child1_last,
    child1Birthday: r.child1_birthday,
    child1DateNeeded: r.child1_date_needed,
    child2First: r.child2_first,
    child2Last: r.child2_last,
    child2Birthday: r.child2_birthday,
    child2DateNeeded: r.child2_date_needed,
    tourTime: r.tour_time,
    tourCompleted: r.tour_completed,
    tourCompletedAt: r.tour_completed_at,
    thankYouSent: r.thank_you_sent,
    thankYouSentAt: r.thank_you_sent_at,
    thankYouError: r.thank_you_error,
    enrolled: r.enrolled,
    startDate: r.start_date,
    registrationType: r.registration_type,
    assignedClassroom: r.assigned_classroom,
    paperworkReturnedDate: r.paperwork_returned_date,
    teacherNotified: r.teacher_notified,
    registrationPaid: r.registration_paid,
    notes: r.notes,
    flagged: r.flagged,
    flagReason: r.flag_reason,
    ccsApproved: r.ccs_approved,
    auditLog,
  };
}

// Same access-control shape used across lib/actions.ts for staff records.
export function siteAllowed(site: string, sessionSite: SiteFilter | null) {
  if (!sessionSite) return false;
  if (sessionSite === "all") return true;
  return site === sessionSite;
}
