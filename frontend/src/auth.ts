/**
 * Autenticación OAuth2 via Google Identity Services (Token/Implicit flow).
 * No requiere backend. El usuario autoriza una vez y se obtiene un access token
 * para llamar directamente a la Google Sheets API v4.
 */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
}

interface TokenResponse {
  access_token: string;
  expires_in: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
    APP_SCRIPT_URL?: string;
  }
}

let _tokenClient: TokenClient | null = null;
let _accessToken: string | null = null;
let _tokenExpiry = 0;
let _resolvePending: ((token: string) => void) | null = null;
let _rejectPending: ((err: Error) => void) | null = null;

export function initAuth(clientId: string): void {
  if (!window.google?.accounts?.oauth2) {
    console.error("Google Identity Services no está cargado.");
    return;
  }
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: (response: TokenResponse) => {
      if (response.error) {
        const err = new Error(response.error_description ?? response.error);
        _rejectPending?.(err);
        _rejectPending = null;
        _resolvePending = null;
        return;
      }
      _accessToken = response.access_token;
      // expires_in en segundos; guardamos con 60s de margen
      _tokenExpiry = Date.now() + (Number(response.expires_in) - 60) * 1000;
      _resolvePending?.(_accessToken);
      _resolvePending = null;
      _rejectPending = null;
    }
  });
}

export function isTokenValid(): boolean {
  return _accessToken !== null && Date.now() < _tokenExpiry;
}

export function getToken(): string | null {
  return isTokenValid() ? _accessToken : null;
}

/**
 * Solicita un token. Si ya hay uno válido lo devuelve inmediatamente.
 * Si no, abre el popup de Google OAuth (puede requerir interacción del usuario).
 */
export function requestToken(prompt = ""): Promise<string> {
  if (isTokenValid()) return Promise.resolve(_accessToken!);
  if (!_tokenClient) return Promise.reject(new Error("Auth no iniciado. Llamá a initAuth() primero."));

  return new Promise((resolve, reject) => {
    _resolvePending = resolve;
    _rejectPending = reject;
    _tokenClient!.requestAccessToken({ prompt });
  });
}

export function signOut(): void {
  if (_accessToken) {
    window.google?.accounts?.oauth2?.revoke(_accessToken, () => {});
  }
  _accessToken = null;
  _tokenExpiry = 0;
}
