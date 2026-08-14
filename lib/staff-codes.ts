// Lightweight action-codes for the no-login waitlist dashboard.
// Not a real auth system — just enough to tag WHO performed a sensitive
// action (delete a record, send a thank-you text) for the audit log.
//
// Set in env as: STAFF_ACTION_CODES="1234:Jane Doe,5678:Priya Singh,..."
// Give each staff member their own code personally (don't post it).

export type StaffCode = { code: string; name: string };

export function getStaffCodes(): StaffCode[] {
  const raw = process.env.STAFF_ACTION_CODES || "";
  return raw
    .split(",")
    .map((pair) => {
      const [code, ...rest] = pair.split(":");
      return { code: code?.trim() ?? "", name: rest.join(":").trim() };
    })
    .filter((c) => c.code && c.name);
}

// Returns the staff member's name if the code is valid, otherwise null.
export function staffNameForCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const match = getStaffCodes().find((c) => c.code === code.trim());
  return match?.name ?? null;
}
