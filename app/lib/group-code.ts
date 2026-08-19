// Group IDs omit characters that are commonly misread aloud. Accept a missing
// dash and harmless whitespace, but never truncate or reinterpret longer input.
export const GROUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export function normalizeGroupCode(value: FormDataEntryValue | string | null): string | null {
  const compact = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
  if (!GROUP_CODE_PATTERN.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}
