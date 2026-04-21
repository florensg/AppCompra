import { CategoryId, StoreName } from "./types";

export const BASE_STORES: StoreName[] = ["CHEEK", "CUCHER", "VITAL"];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  1: "Comestibles",
  2: "Aseo y limpieza",
  3: "Otros artículos"
};

// Google Sheets API v4
export const GOOGLE_CLIENT_ID =
  "540221693720-hhc8po9k6up4p8e8hd7u7i9r9ndhcfmu.apps.googleusercontent.com";

export const SPREADSHEET_ID = "1KDeMzrNf-Q_dCH5N6ef1irwJnLOtNrRWPeA44H0onQ4";

// Mantenido por compatibilidad (ya no se usa en producción)
export const APP_SCRIPT_URL = (window as Window & { APP_SCRIPT_URL?: string }).APP_SCRIPT_URL ?? "";
