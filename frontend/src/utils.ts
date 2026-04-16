export const toMoney = (value: number): number => Math.round(value * 100) / 100;

export const parseDecimal = (raw: string): number => {
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const nowIso = (): string => new Date().toISOString();

export const makeId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
