import React, { useCallback, useState } from "react";
import { LoginScreen, useAppSession } from "./features/auth";
import { ShoppingModuleProvider } from "./features/shopping";
import { GlobalUIProvider } from "./features/ui";
import { AppShell } from "./app/components/AppShell";
import "./styles.css";

export default function App() {
  const [status, setStatus] = useState("Cargando...");

  const onSignedIn = useCallback((displayName?: string | null) => {
    setStatus(`Bienvenido, ${displayName || "Usuario"}`);
  }, []);

  const onSignedOut = useCallback(() => {
    setStatus("Inicia sesion para comenzar.");
  }, []);

  const { signedIn, authLoading, isOnline, handleSignIn, handleSignOut } = useAppSession({
    onSignedIn,
    onSignedOut,
    onStatus: setStatus
  });

  if (!signedIn) {
    return <LoginScreen authLoading={authLoading} status={status} onSignIn={() => void handleSignIn()} />;
  }

  return (
    <GlobalUIProvider>
      <ShoppingModuleProvider signedIn={signedIn} setStatus={setStatus} onIdleSignOut={handleSignOut}>
        <AppShell isOnline={isOnline} status={status} onSignOut={handleSignOut} onClearStatus={() => setStatus("")} />
      </ShoppingModuleProvider>
    </GlobalUIProvider>
  );
}
