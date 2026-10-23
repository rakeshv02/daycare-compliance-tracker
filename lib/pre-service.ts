export function validatePreService(
  completed: boolean,
  date: string | null,
  allowMissingDate = false
) {
  if (typeof completed !== "boolean") throw new Error("Invalid pre-service status.");
  if (!completed) return { completed: false, date: null };
  if (!date) {
    if (!allowMissingDate) throw new Error("Enter the pre-service completion date.");
    return { completed: true, date: null };
  }
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Enter a valid pre-service completion date.");
  }
  return { completed: true, date };
}
