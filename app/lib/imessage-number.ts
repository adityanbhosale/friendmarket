export const DEFAULT_SIDEBAR_IMESSAGE_NUMBER = "+14842528904";

export function normalizeSidebarImessageNumber(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^\+\d{8,15}$/.test(trimmed)) return null;
  return trimmed;
}

export function sidebarImessageNumber(
  configuredValue?: string | null,
): string {
  return (
    normalizeSidebarImessageNumber(configuredValue) ??
    DEFAULT_SIDEBAR_IMESSAGE_NUMBER
  );
}

export function formatSidebarImessageNumber(value: string): string {
  const northAmerican = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value);
  if (!northAmerican) return value;
  return `+1 (${northAmerican[1]}) ${northAmerican[2]}-${northAmerican[3]}`;
}

export function sidebarSmsHref(value: string): string {
  return `sms:${value}`;
}
