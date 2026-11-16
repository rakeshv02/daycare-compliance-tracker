// Isolated server and component tests: no live records, SMS, or payment requests.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { normalizeInquiryPayment, mapInquiryRow } from "../lib/inquiries.ts";

const row = (id, site) => ({
  id, site, parent_first: "Fixture", parent_last: "Parent", phone: "555",
  created_at: "2026-01-01", child1_first: "Fixture", child1_last: "Child",
  tour_completed: false, enrolled: false, start_date: "2026-10-01",
  registration_paid: false, teacher_notified: false, ccs_approved: false,
  payment_receipt_number: null, payment_date: null,
});
const state = {
  records: new Map([[1, row(1, "Noah's Arks")], [2, row(2, "Light House Academy")]]),
  writes: [], refreshes: 0, closes: 0, fail: false, hooks: [], hookIndex: 0,
};
const db = {
  async query(sql, params) {
    if (sql.startsWith("SELECT site FROM inquiries")) {
      return { rows: state.records.has(params[0]) ? [state.records.get(params[0])] : [] };
    }
    const match = sql.match(/UPDATE inquiries SET (\w+) = \$1/);
    if (match) {
      state.records.get(params[1])[match[1]] = params[0];
      state.writes.push({ field: match[1] });
      return { rows: [] };
    }
    if (sql.includes("SET payment_receipt_number = $1, payment_date = $2")) {
      if (state.fail) throw Error("Simulated save failure");
      assert.equal(params.length, 3);
      const rec = state.records.get(params[2]);
      if (!rec) return { rows: [] };
      rec.payment_receipt_number = params[0];
      rec.payment_date = params[1];
      state.writes.push({ receipt: [...params] });
      return { rows: [{ id: params[2] }] };
    }
    throw Error("Unexpected test query");
  },
};
globalThis.inquiryPaymentTest = {
  state, db,
  useState(initial) {
    const i = state.hookIndex++;
    if (!(i in state.hooks)) state.hooks[i] = initial;
    return [state.hooks[i], (v) => { state.hooks[i] = typeof v === "function" ? v(state.hooks[i]) : v; }];
  },
};
const virtual = (code) => ({ url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true });
const lib = (name) => ({ url: pathToFileURL(`${process.cwd()}/lib/${name}.ts`).href, shortCircuit: true });
registerHooks({
  resolve(s, context, next) {
    if (s === "react" && context.parentURL?.endsWith("/inquiry-detail-modal.tsx")) {
      return virtual("export const useState=globalThis.inquiryPaymentTest.useState;export function useTransition(){return[false,f=>f()]}");
    }
    if (s === "next/navigation") return virtual("export function useRouter(){return{refresh(){globalThis.inquiryPaymentTest.state.refreshes++}}}");
    if (s === "next-auth") return virtual("export async function getServerSession(){return null}");
    if (s === "next/cache") return virtual("export function revalidatePath(){}");
    if (s === "./db") return virtual("export default globalThis.inquiryPaymentTest.db");
    if (s === "./auth") return virtual("export const authOptions={}");
    if (s === "./sms") return virtual("export function sendSms(){throw Error('SMS must not be sent')};export function thankYouMessage(){}");
    if (s === "./staff-codes") return virtual("export function staffNameForCode(){}");
    if (s === "./attendance-matching") return virtual("export async function reconcileUnmatchedAttendance(){}");
    if (s === "@/lib/actions") return lib("actions");
    if (s === "@/lib/inquiries") return lib("inquiries");
    if (["./staff", "./inquiries", "./pre-service"].includes(s)) return lib(s.slice(2));
    return next(s, context);
  },
  load(url, context, next) {
    if (url.endsWith("/inquiry-detail-modal.tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return next(url, context);
  },
});
const { saveInquiryPayment, updateInquiryField } = await import("../lib/actions.ts");
const { InquiryDetailModal } = await import("../components/inquiry-detail-modal.tsx");

assert.deepEqual(normalizeInquiryPayment(" 00aB123 ", "2024-02-29"), {
  receiptNumber: "00aB123", paymentDate: "2024-02-29",
});
assert.deepEqual(normalizeInquiryPayment(" ", null), { receiptNumber: null, paymentDate: null });
for (const values of [
  ["ABC", null], [null, "2026-01-01"], ["A B", "2026-01-01"],
  ["';DROP", "2026-01-01"], ["A".repeat(101), "2026-01-01"],
  ["ABC", "2025-02-29"], ["ABC", "2026-02-30"], ["ABC", "not-a-date"],
]) assert.throws(() => normalizeInquiryPayment(...values));
let writes = state.writes.length;
await assert.rejects(saveInquiryPayment(-1, "ABC", "2026-01-01"), /Invalid inquiry/);
await assert.rejects(saveInquiryPayment(999, "ABC", "2026-01-01"), /not found/);
await assert.rejects(saveInquiryPayment(1, "ABC", null), /both/);
assert.equal(state.writes.length, writes);
await assert.rejects(updateInquiryField(1, "payment_receipt_number", "ABC"), /not editable/);
await saveInquiryPayment(1, "00aB123", "2026-09-01");
assert.equal(state.records.get(1).enrolled, false);
assert.equal(state.records.get(1).tour_completed, false);
assert.equal(state.records.get(1).registration_paid, false);
const mapped = mapInquiryRow(state.records.get(1));
assert.equal(mapped.paymentReceiptNumber, "00aB123");
assert.equal(mapped.paymentDate, "2026-09-01");
await saveInquiryPayment(1, "EDIT456", "2026-09-02");
assert.equal(state.records.get(1).payment_receipt_number, "EDIT456");
await saveInquiryPayment(1, null, null);
assert.equal(state.records.get(1).payment_receipt_number, null);
assert.equal(state.records.get(1).payment_date, null);

let inquiry;
function render(id, reset = false) {
  if (reset) { state.hooks = []; inquiry = mapInquiryRow(state.records.get(id)); }
  state.hookIndex = 0;
  return InquiryDetailModal({ inquiry, onClose() { state.closes++; } });
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
function input(tree, id) { return find(tree, n => n.props?.id === id); }
function save(tree) { return find(tree, n => n.type === "button" && n.props.children === "Save changes").props.onClick(); }

for (const id of [1, 2]) {
  let tree = render(id, true);
  input(tree, `receipt-${id}`).props.onChange({ target: { value: "PRESTART001" } });
  input(tree, `payment-date-${id}`).props.onChange({ target: { value: "2026-09-01" } });
  await save(render(id));
  assert.equal(state.records.get(id).payment_receipt_number, "PRESTART001");
  assert.equal(state.records.get(id).payment_date, "2026-09-01");
  tree = render(id, true);
  assert.equal(input(tree, `receipt-${id}`).props.value, "PRESTART001");
  assert.equal(input(tree, `payment-date-${id}`).props.value, "2026-09-01");
  input(tree, `receipt-${id}`).props.onChange({ target: { value: "" } });
  input(tree, `payment-date-${id}`).props.onChange({ target: { value: "" } });
  await save(render(id));
  assert.equal(state.records.get(id).payment_date, null);
}
let tree = render(1, true);
input(tree, "receipt-1").props.onChange({ target: { value: "ABC" } });
writes = state.writes.length;
await save(render(1));
assert.equal(state.writes.length, writes, "Incomplete receipt must block the whole UI save before writes");
assert.ok(find(render(1), n => n.props?.role === "alert").props.children.includes("both"));
input(render(1), "payment-date-1").props.onChange({ target: { value: "2026-09-01" } });
state.fail = true;
const closes = state.closes;
await save(render(1));
assert.equal(state.closes, closes, "Failed receipt save must leave details open");
assert.ok(find(render(1), n => n.props?.role === "alert").props.children.includes("failure"));
assert.equal(state.records.get(1).payment_receipt_number, null);
console.log("PASS: receipt validation, atomic save/edit/clear, persistence mapping, pre-start payments, both sites, detail form inputs/save/reopen, and visible save errors.");
