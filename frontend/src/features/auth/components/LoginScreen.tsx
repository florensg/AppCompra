import React from "react";

interface LoginScreenProps {
  authLoading: boolean;
  status: string;
  onSignIn: () => void;
}

export function LoginScreen({ authLoading, status, onSignIn }: LoginScreenProps) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🛒</div>
        <h1>AppCompras v2</h1>
        <p>Carga rápida de precios y cantidades</p>
        <button
          id="btn-google-signin"
          type="button"
          className="google-btn"
          onClick={onSignIn}
          disabled={authLoading}
        >
          {authLoading ? "Conectando..." : "Iniciar sesión con Google"}
        </button>
        {status !== "Iniciá sesión para cargar datos." && (
          <p className="status-inline">{status}</p>
        )}
      </div>
    </div>
  );
}
