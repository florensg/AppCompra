import React from "react";
import { CATEGORY_LABELS } from "../../constants";
import { useGlobalUI } from "../../features/ui";

export function FiltersBar() {
  const ui = useGlobalUI();

  return (
    <section className="filters-bar">
      <select
        className="h-10 rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        value={String(ui.categoryFilter)}
        onChange={(e) => ui.setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
      >
        <option value="all">Todo</option>
        {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
          <option key={id} value={id}>{label}</option>
        ))}
      </select>

      <div className="priority-controls">
        <div className={`search-inline ${ui.searchOpen || ui.search ? "open" : ""}`}>
          <button type="button" className="search-inline-btn" onClick={() => ui.setSearchOpen(true)} aria-label="Buscar">
            Buscar
          </button>
          <input
            className="search-inline-input"
            value={ui.search}
            onChange={(e) => ui.setSearch(e.target.value)}
            placeholder="Buscar..."
            onBlur={() => {
              if (!ui.search) ui.setSearchOpen(false);
            }}
          />
          {ui.search && <button type="button" className="search-clear" onClick={() => { ui.setSearch(""); ui.setSearchOpen(false); }}>x</button>}
        </div>

        <select className="h-10 rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" value={ui.priorityFilter} onChange={(e) => ui.setPriorityFilter(e.target.value as any)}>
          <option value="all">Todos</option>
          <option value="orange">Naranja</option>
          <option value="red">Rojo</option>
          <option value="none">Sin color</option>
        </select>

        <select className="h-10 rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" value={ui.priorityMode} onChange={(e) => ui.setPriorityMode(e.target.value as any)}>
          <option value="orange-first">Asc: Naranja, Rojo</option>
          <option value="red-first">Desc: Rojo, Naranja</option>
        </select>
      </div>
    </section>
  );
}
