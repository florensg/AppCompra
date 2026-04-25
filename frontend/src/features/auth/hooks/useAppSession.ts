import { useEffect, useState } from "react";
import { onAuthStatusChange, signIn, signOut as authSignOut } from "../../../auth";

interface UseAppSessionParams {
  onSignedIn: (displayName?: string | null) => void;
  onSignedOut: () => void;
  onStatus: (value: string) => void;
}

export function useAppSession({ onSignedIn, onSignedOut, onStatus }: UseAppSessionParams) {
  const [signedIn, setSignedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const unsubscribe = onAuthStatusChange((user) => {
      if (user) {
        setSignedIn(true);
        onSignedIn(user.displayName);
      } else {
        setSignedIn(false);
        onSignedOut();
      }
    });
    return () => unsubscribe();
  }, [onSignedIn, onSignedOut]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const handleSignIn = async () => {
    setAuthLoading(true);
    onStatus("Conectando con Google...");
    try {
      await signIn();
    } catch (err) {
      onStatus(`Error: ${String(err)}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    authSignOut();
    setSignedIn(false);
    onSignedOut();
    onStatus("Sesion cerrada.");
  };

  return {
    signedIn,
    authLoading,
    isOnline,
    handleSignIn,
    handleSignOut
  };
}
