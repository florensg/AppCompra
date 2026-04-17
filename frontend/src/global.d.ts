// Tipos globales del browser extendidos

interface Window {
  APP_SCRIPT_URL?: string;
  google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token: string;
            expires_in: string;
            error?: string;
            error_description?: string;
          }) => void;
        }) => {
          requestAccessToken: (overrides?: { prompt?: string }) => void;
        };
        revoke: (token: string, callback: () => void) => void;
      };
    };
  };
}
