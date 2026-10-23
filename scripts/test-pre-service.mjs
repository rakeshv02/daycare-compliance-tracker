// Isolated tests: no live staff records, credentials, or external requests.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STAFF_BASE } from "../lib/staff.ts";
import { validatePreService } from "../lib/pre-service.ts";
import { initializePreService } from "./init-db-pre-service.mjs";

const noah = "Noah's Arks";
const light = "Light House Academy";
const state = {
  site: "all", initialized: false, fail: false, writes: 0,
  members: new Map([
    [STAFF_BASE[0].id, { id: STAFF_BASE[0].id, site: noah, hire_date: "2024-02-03", is_db_only: false }],
    ["EXISTING_NO_DATE", { id: "EXISTING_NO_DATE", site: light, hire_date: null, is_db_only: true }],
  ]),
  records: new Map(),
};
let snapshot;
const db = {
  async connect() { return { query: db.query.bind(db), release() {} }; },
  async query(sql, args = []) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q === "BEGIN") {
      snapshot = structuredClone({ initialized: state.initialized, members: state.members, records: state.records });
    } else if (q === "ROLLBACK") {
      Object.assign(state, snapshot);
    } else if (q === "COMMIT" || q.startsWith("SELECT pg_advisory")) {
      // No writes.
    } else if (q.startsWith("SELECT to_regclass")) {
      return { rows: [{ existing: state.initialized ? "staff_pre_service" : null }] };
    } else if (q.startsWith("CREATE TABLE staff_pre_service")) {
      state.initialized = true;
    } else if (q.startsWith("SELECT id, hire_date")) {
      return { rows: [...state.members.values()] };
    } else if (q.startsWith("SELECT site FROM staff_members")) {
      return { rows: state.members.has(args[0]) ? [state.members.get(args[0])] : [] };
    } else if (q.startsWith("SELECT completed, completed_date")) {
      return { rows: state.records.has(args[0]) ? [state.records.get(args[0])] : [] };
    } else if (q.startsWith("INSERT INTO staff_pre_service")) {
      if (state.fail) throw Error("Simulated database failure");
      const backfill = q.includes("'hire_date_backfill'");
      const [id] = args;
      const completed = backfill ? true : args[1];
      const date = backfill ? args[1] : args[2];
      const prior = state.records.get(id);
      state.records.set(id, {
        completed, completed_date: date,
        date_source: backfill ? "hire_date_backfill" :
          prior?.completed === completed && prior.completed_date === date ? prior.date_source : "manual",
      });
      state.writes++;
    } else if (q.startsWith("INSERT INTO staff_members")) {
      const [id, , site, hireDate] = args;
      state.members.set(id, { id, site, hire_date: hireDate, is_db_only: true });
    } else if (!q.startsWith("INSERT INTO staff_roles")) {
      throw Error("Unhandled test SQL: " + q);
    }
    return { rows: [] };
  },
};
globalThis.preServiceTest = { state, db };
const virtual = (source) => ({ url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true });
const libFile = (name) => ({ url: pathToFileURL(`${process.cwd()}/lib/${name}.ts`).href, shortCircuit: true });
registerHooks({
  resolve(s, context, next) {
    if (s === "@/lib/actions") return libFile("actions");
    if (s === "@/lib/staff") return libFile("staff");
    if (s === "@/lib/pre-service") return libFile("pre-service");
    if (s === "./pre-service-fields") return {
      url: pathToFileURL(`${process.cwd()}/components/pre-service-fields.tsx`).href, shortCircuit: true,
    };
    if (s === "next-auth") return virtual("export async function getServerSession(){const s=globalThis.preServiceTest.state.site;return s?{user:{site:s}}:null}");
    if (s === "next/cache") return virtual("export function revalidatePath(){}");
    if (s === "./db") return virtual("export default globalThis.preServiceTest.db");
    if (s === "./auth") return virtual("export const authOptions={}");
    if (s === "./staff") return libFile("staff");
    if (s === "./pre-service") return libFile("pre-service");
    if (s === "./inquiries") return virtual("export function siteFromSlug(){}");
    if (s === "./sms") return virtual("export async function sendSms(){};export function thankYouMessage(){}");
    if (s === "./staff-codes") return virtual("export function staffNameForCode(){}");
    if (s === "./attendance-matching") return virtual("export async function reconcileUnmatchedAttendance(){}");
    return next(s, context);
  },
  load(url, context, next) {
    if (url.endsWith(".tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return next(url, context);
  },
});
const { addEmployee, savePreService, updateEmployee } = await import("../lib/actions.ts");

assert.deepEqual(validatePreService(false, "2026-01-01"), { completed: false, date: null });
assert.deepEqual(validatePreService(true, "2024-02-29"), { completed: true, date: "2024-02-29" });
assert.throws(() => validatePreService(true, "2025-02-29"), /valid/);
assert.throws(() => validatePreService(true, "not-a-date"), /valid/);
assert.throws(() => validatePreService(true, null), /completion date/);
assert.throws(() => validatePreService("true", null), /status/);
assert.deepEqual(validatePreService(true, null, true), { completed: true, date: null });

state.fail = true;
await assert.rejects(initializePreService(db), /database failure/);
assert.equal(state.initialized, false);
assert.equal(state.records.size, 0);
state.fail = false;
const backfill = await initializePreService(db);
assert.equal(backfill.backfilled, STAFF_BASE.length + 1);
assert.equal(backfill.missingHireDates, 1);
assert.equal(state.records.get(STAFF_BASE[0].id).completed_date, "2024-02-03");
assert.equal(state.records.get("EXISTING_NO_DATE").completed_date, null);
assert.equal(state.records.get("EXISTING_NO_DATE").completed, true);
assert.equal(state.members.size, 2, "Backfill must not rewrite employee identities");

const before = new Set(state.members.keys());
await addEmployee("New starter", noah, "2026-01-05", "Caregiver");
const newId = [...state.members.keys()].find((id) => !before.has(id));
assert.equal(state.records.get(newId).completed, false);
assert.equal(state.records.get(newId).completed_date, null);
assert.equal((await initializePreService(db)).alreadyInitialized, true);
assert.equal(state.records.get(newId).completed, false, "Migration reruns must not complete new hires");

await assert.rejects(savePreService(newId, true, null), /completion date/);
await savePreService(newId, true, "2026-01-04");
assert.deepEqual(state.records.get(newId), {
  completed: true, completed_date: "2026-01-04", date_source: "manual",
});
await savePreService(newId, false, "2026-01-04");
assert.equal(state.records.get(newId).completed_date, null);
await savePreService("EXISTING_NO_DATE", true, null);
assert.equal(state.records.get("EXISTING_NO_DATE").date_source, "hire_date_backfill");

await addEmployee("Completed starter", light, "2026-01-05", "Director", true, "2026-01-03");
const completedId = [...state.members.keys()].at(-1);
assert.equal(state.records.get(completedId).completed, true);
assert.equal(state.records.get(completedId).completed_date, "2026-01-03");
const memberCount = state.members.size;
await assert.rejects(addEmployee("Invalid date", noah, null, "Caregiver", true, null), /completion date/);
assert.equal(state.members.size, memberCount);
state.fail = true;
await assert.rejects(addEmployee("Rollback test", noah, null, "Caregiver"), /database failure/);
assert.equal(state.members.size, memberCount, "Staff creation must roll back if pre-service cannot be saved");
state.fail = false;

state.site = noah;
await savePreService(newId, true, "2026-01-04");
let writes = state.writes;
await assert.rejects(savePreService(completedId, false, null), /Unauthorized/);
await assert.rejects(addEmployee("Wrong site", light, null, "Caregiver"), /Unauthorized/);
assert.equal(state.writes, writes);
// DB overrides take priority over static seed sites for access control.
state.members.get(STAFF_BASE[0].id).site = light;
await assert.rejects(savePreService(STAFF_BASE[0].id, false, null), /Unauthorized/);
state.site = null;
await assert.rejects(savePreService(newId, false, null), /Unauthorized/);
await assert.rejects(addEmployee("No session", noah, null, "Caregiver"), /Unauthorized/);
state.site = "all";
await assert.rejects(savePreService("UNKNOWN", true, "2026-01-04"), /Unauthorized/);
const existing = structuredClone(state.records.get(newId));
await updateEmployee(newId, "Renamed employee", noah, "2026-02-01", true);
assert.deepEqual(state.records.get(newId), existing, "Editing hire date must not rewrite the recorded pre-service date");
const { PreServiceFields } = await import("../components/pre-service-fields.tsx");
const { EmployeeFormModal } = await import("../components/employee-form-modal.tsx");
const { EmployeeDetailsModal } = await import("../components/employee-details-modal.tsx");
const fields = renderToStaticMarkup(createElement(PreServiceFields, {
  completed: true, date: "2026-01-03", onChange() {},
}));
assert.ok(fields.includes('type="checkbox"') && fields.includes('checked=""'));
assert.ok(fields.includes('type="date"') && fields.includes('value="2026-01-03"'));
const addForm = renderToStaticMarkup(createElement(EmployeeFormModal, {
  mode: { type: "add" }, sessionSite: noah, onClose() {},
}));
assert.ok(addForm.includes("Pre-service completed"));
assert.ok(!addForm.includes('checked=""'), "New-hire checkbox starts unchecked");
const detail = renderToStaticMarkup(createElement(EmployeeDetailsModal, {
  staff: { id: "FIXTURE", name: "Fixture", site: noah, role: "Caregiver", hireDate: "2025-05-01",
    preServiceCompleted: true, preServiceDate: "2025-05-01" },
  lifecycle: { isActive: true, leavingDate: null },
  driverInfo: { isDriver: false, dlNumber: null, dlExpires: null, transportTrainingDate: null },
  onClose() {},
}));
assert.ok(detail.includes('checked=""') && detail.includes('value="2025-05-01"'));
console.log("PASS: validation, one-time backfill, missing dates, new hires, create/edit/clear, transactions, site isolation, authorization, preserved dates, and rendered add/details controls.");
