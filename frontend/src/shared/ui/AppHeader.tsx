import React from "react";

interface AppHeaderProps {
  isOnline: boolean;
  onSignOut: () => void;
}

export function AppHeader({ isOnline, onSignOut }: AppHeaderProps) {
  return (
    <header className="top-header">
      <div className="header-title">
        <span>🛒</span>
        <h1>AppCompras</h1>
      </div>
      <div className="header-right">
        <div className={`badge ${isOnline ? "online" : "offline"}`}>
          <span className="status-dot" />
          {isOnline ? "Online" : "Sin red"}
        </div>
        <button id="btn-signout" type="button" className="badge signout-btn" onClick={onSignOut}>
          Salir
        </button>
      </div>
    </header>
  );
}
