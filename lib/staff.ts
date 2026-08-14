export type StaffMember = {
  id: string;
  name: string;
  site: "Noah's Arks" | "Light House Academy";
  hireDate: string;
};

export type SiteFilter = "Noah's Arks" | "Light House Academy" | "all";

export const STAFF_BASE: StaffMember[] = [
  { id: "EMP0113",  name: "Shawnette B Jenkins",            site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0114",  name: "Georgina F Daniel Shenouda",     site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0115",  name: "Julia Bagley",                   site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0116",  name: "McKenna Reese Malone",           site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0117",  name: "Sandra Brogdon",                 site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0120",  name: "April Dawn MacArthur",           site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0121",  name: "Delaina B Moore",                site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0122",  name: "Erendira Jaqueline Moreno",      site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0124",  name: "Nancy P Myers",                  site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0126",  name: "Katelynn Hansen",                site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0132",  name: "Cierra Howard",                  site: "Light House Academy", hireDate: "2025-03-17" },
  { id: "EMP0133",  name: "Raimey Penny",                   site: "Noah's Arks",        hireDate: "2025-01-27" },
  { id: "EMP0135",  name: "Alyah Gobert",                   site: "Noah's Arks",        hireDate: "2025-04-14" },
  { id: "EMP0136",  name: "Cassidy McLeod",                 site: "Noah's Arks",        hireDate: "2025-05-13" },
  { id: "EMPO140",  name: "Nefertari Scott",                site: "Noah's Arks",        hireDate: "2025-07-21" },
  { id: "EMPO147",  name: "Allysa Bishop",                  site: "Noah's Arks",        hireDate: "2025-10-06" },
  { id: "EMPO148",  name: "Christina Pacheco",              site: "Noah's Arks",        hireDate: "2025-10-06" },
  { id: "EMPO152",  name: "Margaret Horn",                  site: "Noah's Arks",        hireDate: "2025-10-13" },
  { id: "EMPO156",  name: "Savannah Pierce",                site: "Noah's Arks",        hireDate: "2026-01-19" },
  { id: "EMPO157",  name: "Haley Daugherty",                site: "Noah's Arks",        hireDate: "2026-02-02" },
  { id: "EMPO162",  name: "Changpheng Deuanxayasane",       site: "Noah's Arks",        hireDate: "2026-04-08" },
  { id: "EMPO164",  name: "NaSiah Thomas",                  site: "Noah's Arks",        hireDate: "2026-04-27" },
  { id: "EMPO166",  name: "Donna Whittaker",                site: "Noah's Arks",        hireDate: "2026-05-18" },
  { id: "EMPO169",  name: "Madison Hightower",              site: "Noah's Arks",        hireDate: "2026-05-19" },
  { id: "EMP04386", name: "Katie Clawson",                  site: "Light House Academy", hireDate: "2026-02-16" },
  { id: "EMP04391", name: "Brandy Smith",                   site: "Light House Academy", hireDate: "2026-02-16" },
  { id: "EMP04394", name: "Martha Lindsey",                 site: "Light House Academy", hireDate: "2026-02-16" },
  { id: "EMP04395", name: "Tawana Jones",                   site: "Light House Academy", hireDate: "2026-02-16" },
  { id: "EMP04396", name: "Morgan Hickmon",                 site: "Light House Academy", hireDate: "2026-02-16" },
  { id: "EMP04397", name: "Haven Griffith",                 site: "Light House Academy", hireDate: "2026-02-16" },
  { id: "EMPO4399", name: "Katelynn Hansen",                site: "Light House Academy", hireDate: "2026-02-16" },
  { id: "EMPO4400", name: "Brooke Byrd",                    site: "Light House Academy", hireDate: "2026-05-21" },
  { id: "EMPO171",  name: "Victoria Owens",                 site: "Noah's Arks",        hireDate: "2026-06-02" },
  { id: "EMPO172",  name: "Phou Manylott",                  site: "Noah's Arks",        hireDate: "2026-06-08" },
  { id: "EMPO173",  name: "Lorena Bassina",                 site: "Noah's Arks",        hireDate: "2026-06-08" },
  { id: "EMPO174",  name: "Ashley Parrish",                 site: "Noah's Arks",        hireDate: "2026-06-09" },
  { id: "EMPO175",  name: "Bailey Lambert",                 site: "Noah's Arks",        hireDate: "2026-06-15" },
  { id: "EMPO4403", name: "Melissa Sartain",                site: "Light House Academy", hireDate: "2026-06-18" },
  { id: "EMPO4404", name: "Miranda Carpenter",              site: "Light House Academy", hireDate: "2026-06-22" },
  { id: "EMPO176",  name: "Sheniquia Lewis",                site: "Noah's Arks",        hireDate: "2026-06-24" },
  { id: "EMPO177",  name: "Courtney Hammonds",              site: "Noah's Arks",        hireDate: "2026-06-29" },
];

export const ROLE_HOURS: Record<string, number> = {
  "Caregiver": 24,
  "Director": 30,
  "Site Director (School-Age)": 15,
  "Program Director (School-Age)": 20,
};
export const ROLES = Object.keys(ROLE_HOURS);

export const DATE_CRED_TYPES = ["CPR/First Aid", "Background Check"] as const;
export type CredType = typeof DATE_CRED_TYPES[number];

export const SEED_CPR: Record<string, { issued: string; expires: string }> = {
  "EMPO171":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0113":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0117":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0133":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO172":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO162":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO140":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO164":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0116":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO152":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO169":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO173":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0115":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0122":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO157":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0114":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO148":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0136":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO156":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO174":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0120":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP0135":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO147":  { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO4400": { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP04394": { issued: "2026-06-29", expires: "2028-06-29" },
  "EMPO4403": { issued: "2026-06-29", expires: "2028-06-29" },
  "EMP04396": { issued: "2026-06-29", expires: "2028-06-29" },
};

// Texas training year: hire-date anniversary window, hours don't carry over.
export function currentTrainingYearWindow(hireDateStr: string | null) {
  if (!hireDateStr) return null;
  const hire = new Date(hireDateStr);
  const today = new Date();
  const anniversary = new Date(today.getFullYear(), hire.getMonth(), hire.getDate());
  if (anniversary > today) anniversary.setFullYear(anniversary.getFullYear() - 1);
  const windowEnd = new Date(anniversary);
  windowEnd.setFullYear(windowEnd.getFullYear() + 1);
  return { start: anniversary, end: windowEnd };
}

export type TrainingEntry = { id?: number; date: string; title: string; hours: number; topic: string };

export function trainingStatus(
  entries: TrainingEntry[],
  requiredHours: number,
  hireDate: string | null
) {
  const window = currentTrainingYearWindow(hireDate);
  const inWindow = window
    ? entries.filter((e) => { const d = new Date(e.date); return d >= window.start && d < window.end; })
    : entries;
  const total = inWindow.reduce((s, e) => s + Number(e.hours), 0);
  const core  = inWindow.filter((e) => e.topic === "core").reduce((s, e) => s + Number(e.hours), 0);
  const abuse = inWindow.filter((e) => e.topic === "abuse").reduce((s, e) => s + Number(e.hours), 0);
  const meetsCore  = core >= 6;
  const meetsAbuse = abuse >= 1;
  const meetsTotal = total >= requiredHours;
  const noHireDate = !hireDate;
  const status =
    total === 0 ? "missing"
    : meetsTotal && meetsCore && meetsAbuse ? "valid"
    : "expiring";
  return { status, total, core, abuse, meetsCore, meetsAbuse, meetsTotal, window, noHireDate };
}

export type DBStaffOverride = {
  id: string;
  name: string;
  site: "Noah's Arks" | "Light House Academy";
  hireDate: string | null;
  isDbOnly: boolean;
};

export type LifecycleRecord = {
  isActive: boolean;
  leavingDate: string | null;
};

export type DriverInfo = {
  isDriver: boolean;
  dlNumber: string | null;
  dlExpires: string | null;
  transportTrainingDate: string | null;
};

export function credentialStatus(expires: string | null) {
  if (!expires) return "missing";
  const diff = (new Date(expires).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "expired";
  if (diff <= 30) return "expiring";
  return "valid";
}
