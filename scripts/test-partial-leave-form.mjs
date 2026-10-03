import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const reactUrl = import.meta.resolve("react");
const mockedReact = moduleUrl(`
  import React from ${JSON.stringify(reactUrl)};
  export * from ${JSON.stringify(reactUrl)};
  export function useState(initial) {
    const state = globalThis.partialLeaveFormTest;
    const index = state.index++;
    const value = index === 0 ? true : index === 5 ? state.duration : index === 6 ? "2026-09-28" : initial;
    return React.useState(value);
  }
`);
const actionsUrl = moduleUrl(`export async function cancelLeaveRequest(){};export const staffLeaveLogout="/test-logout";export async function submitLeaveRequest(){};`);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react" && context.parentURL?.endsWith("/staff-leave-portal.tsx")) return { url: mockedReact, shortCircuit: true };
    if (specifier === "next/navigation") return { url: moduleUrl(`export const useRouter=()=>({refresh(){}});`), shortCircuit: true };
    if (specifier === "@/lib/leave-actions") return { url: actionsUrl, shortCircuit: true };
    if (specifier === "@/lib/leave") return nextResolve(new URL("../lib/leave.ts", import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) {
      return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    }
    return nextLoad(url, context);
  },
});
const { default: Portal } = await import("../components/staff-leave-portal.tsx");
const React = await import("react");
const props = {
  staff: { id: "test", name: "Test Employee", site: "Test", hireDate: "" },
  requests: [{ id: 1, leaveType: "Medical", dateFrom: "2026-09-28", dateTo: "2026-09-28",
    duration: "Half day", startTime: "09:00", endTime: "13:00", status: "Pending", reason: "", directorNote: "" }],
  summaries: [{ year: 2026, approvedDaysTaken: 0.5, approvedHoursTaken: 2, paidVacationTaken: 0,
    paidVacationHoursTaken: 0, pendingDays: 0.5, pendingHours: 0, lateDates: [], missingDates: [] }],
};
const htmlFor = (duration) => {
  globalThis.partialLeaveFormTest = { index: 0, duration };
  return renderToStaticMarkup(React.createElement(Portal, props));
};
test("full-day form keeps the date range and does not send time fields", () => {
  const html = htmlFor("Full day");
  assert.match(html, /name="duration"/);
  for (const option of ["Full day", "Half day", "Part of day"]) assert.ok(html.includes(`>${option}</option>`));
  assert.match(html, /<option[^>]*selected[^>]*>Full day<\/option>/);
  assert.match(html, /name="dateTo"[^>]*type="date"/);
  assert.ok(!html.includes('name="startTime"'));
  assert.ok(!html.includes('name="endTime"'));
});
test("half-day form requires both time inputs and sends matching from/to dates", () => {
  const html = htmlFor("Half day");
  assert.match(html, /<option[^>]*selected[^>]*>Half day<\/option>/);
  assert.match(html, /name="startTime"[^>]*type="time"[^>]*required/);
  assert.match(html, /name="endTime"[^>]*type="time"[^>]*required/);
  assert.match(html, /name="dateTo"[^>]*type="hidden"[^>]*value="2026-09-28"/);
  assert.ok(html.includes("Counts as 0.5 day"));
  assert.ok(html.includes("9:00 AM–1:00 PM"));
});
test("part-day form uses time inputs and the staff summary retains separate hours", () => {
  const html = htmlFor("Part of day");
  assert.match(html, /<option[^>]*selected[^>]*>Part of day<\/option>/);
  assert.ok(html.includes("Recorded in hours using your selected times."));
  assert.match(html, /name="startTime"/);
  assert.match(html, /name="endTime"/);
  assert.ok(html.includes("0.5 days + 2 hrs"));
  assert.ok(html.includes("max-h-[90dvh]"));
});