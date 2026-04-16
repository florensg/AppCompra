import { CategoryId, StoreName } from "./types";

export const ACTIVE_STORES: StoreName[] = ["CHEK", "CUCHER", "VITAL"];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  1: "Comestibles",
  2: "Aseo y limpieza",
  3: "Otros artículos"
};

export const APP_SCRIPT_URL = (window as Window & { APP_SCRIPT_URL?: string }).APP_SCRIPT_URL ?? "";
