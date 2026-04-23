import React from "react";
import { StoreName } from "../../../../types";

interface SupermarketManagerMenuProps {
  storeMenuOpen: boolean;
  showAddStoreInput: boolean;
  newStoreName: string;
  inactiveStores: StoreName[];
  optionalActiveStores: StoreName[];
  hasDisableOptions: boolean;
  hasStoreMenuOptions: boolean;
  addStoreInputRef: React.RefObject<HTMLInputElement>;
  onToggleMenu: () => void;
  onShowAddInput: () => void;
  onNewStoreNameChange: (value: string) => void;
  onAddStore: () => void;
  onActivateStore: (store: StoreName) => void;
  onDisableStore: (store: StoreName) => void;
}

export function SupermarketManagerMenu({
  storeMenuOpen,
  showAddStoreInput,
  newStoreName,
  inactiveStores,
  optionalActiveStores,
  hasDisableOptions,
  hasStoreMenuOptions,
  addStoreInputRef,
  onToggleMenu,
  onShowAddInput,
  onNewStoreNameChange,
  onAddStore,
  onActivateStore,
  onDisableStore
}: SupermarketManagerMenuProps) {
  return (
    <div className="store-menu-wrap">
      <button
        type="button"
        className={`store add-store-btn ${storeMenuOpen ? "active" : ""}`}
        onClick={onToggleMenu}
        title="Gestionar supermercados"
      >
        Super {storeMenuOpen ? "v" : ">"}
      </button>
      {storeMenuOpen && (
        <div className="store-menu">
          <button
            type="button"
            className="store-menu-action"
            onClick={onShowAddInput}
          >
            + Agregar supermercado
          </button>
          {showAddStoreInput && (
            <div className="store-add-form">
              <input
                ref={addStoreInputRef}
                type="text"
                value={newStoreName}
                onChange={(e) => onNewStoreNameChange(e.target.value)}
                placeholder="Nombre del supermercado"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onAddStore();
                  }
                }}
              />
              <button type="button" onClick={onAddStore}>Agregar</button>
            </div>
          )}
          {inactiveStores.map((store) => (
            <button
              key={store}
              type="button"
              className="store-menu-item"
              onClick={() => onActivateStore(store)}
            >
              {store}
            </button>
          ))}
          {hasDisableOptions && (
            <div className="store-menu-group-label">Activos</div>
          )}
          {optionalActiveStores.map((store) => (
            <button
              key={`disable-${store}`}
              type="button"
              className="store-menu-item warn"
              onClick={() => onDisableStore(store)}
            >
              Ocultar {store}
            </button>
          ))}
          {!hasStoreMenuOptions && (
            <p className="store-menu-empty">No hay supermercados inactivos.</p>
          )}
        </div>
      )}
    </div>
  );
}
