import React from "react";
import { AppHeader } from "../../shared/ui/AppHeader";
import { ProductListView } from "../../features/products";
import { ShoppingView, useShoppingModule } from "../../features/shopping";
import { ComparisonView } from "../../features/comparison";
import { FiltersBar } from "./FiltersBar";
import { StoreTotalsBar } from "./StoreTotalsBar";

interface AppShellProps {
  isOnline: boolean;
  status: string;
  onSignOut: () => void;
  onClearStatus: () => void;
}

export function AppShell({ isOnline, status, onSignOut, onClearStatus }: AppShellProps) {
  const { view, setView } = useShoppingModule();

  return (
    <div className="app-shell">
      <AppHeader isOnline={isOnline} onSignOut={onSignOut} />
      <StoreTotalsBar />

      <nav className="tabs">
        {(["lista", "carga", "comparacion"] as const).map((id) => (
          <button key={id} className={view === id ? "tab active" : "tab"} onClick={() => setView(id)} type="button">
            {id === "lista" ? "Lista" : id === "carga" ? "Carga" : "Comparar"}
          </button>
        ))}
      </nav>

      <FiltersBar />

      {view === "lista" && <ProductListView />}
      {view === "carga" && <ShoppingView />}
      {view === "comparacion" && <ComparisonView />}

      {status && (
        <div className="toast-notification" role="alert">
          <span>{status}</span>
          <button type="button" className="toast-close" onClick={onClearStatus} aria-label="Cerrar">x</button>
        </div>
      )}
    </div>
  );
}
