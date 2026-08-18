/**
 * Converts a browser datetime-local value plus getTimezoneOffset() into an ISO
 * instant. The offset is supplied by the browser because the server's zone is
 * unrelated to the person filling out the form.
 */
export function parseLocalDateTime(
  value: FormDataEntryValue | null,
  offsetMinutes: number,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(raw);
  if (!match) return null;

  const asUtc = Date.parse(`${match[1]}${match[2] ?? ":00"}Z`);
  if (Number.isNaN(asUtc)) return null;

  return new Date(asUtc + offsetMinutes * 60_000).toISOString();
}
