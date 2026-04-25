# Changelog

## 2026-04-25

### Refactor de arquitectura frontend (sin cambios funcionales)

- Se desacoplo `App`/`AppShell` del dominio de compras, dejando orquestacion de vistas y estado de sesion.
- Se extrajo estado global de UI a `features/ui/hooks/useGlobalUI.tsx`:
  - `search`, `searchOpen`, `categoryFilter`, `priorityFilter`, `priorityMode`.
- Se refactorizo `ShoppingView`, `ProductListView` y `ComparisonView` para consumir hooks de modulo en lugar de prop drilling masivo.
- Se incorporo `useComparisonModule` para encapsular:
  - filtrado por UI global
  - acceso a entries
  - calculo de comparacion por item (precios validos y minimo).
- Se agrego `getEntry(store, itemId)` en `useShoppingModule` para encapsular acceso a `entryMap` y mantener compatibilidad con `entryMap` + `entryKey`.

### Infraestructura y contratos

- Se centralizo acceso IO en servicios de infraestructura:
  - `frontend/src/infrastructure/api/shoppingApiService.ts`
  - `frontend/src/infrastructure/storage/shoppingStorageService.ts`
- No hubo cambios de contrato en endpoints Apps Script:
  - `GET /bootstrap`
  - `GET /round`
  - `GET /totals`
  - `POST /entries/batch` (`/sync` alias)
  - `POST /items/create|update|delete`
- Se mantiene flujo offline-first Dexie (`syncQueue`) y sync eventual con Firestore/Apps Script.

### Validacion

- `npm run typecheck` OK.
- `npm run build` OK (solo warnings de tamano de bundle, sin errores).

## 2026-04-23

### Documentacion

- Se normalizo documentacion base del proyecto:
  - `README.md` raiz actualizado.
  - `docs/arquitectura.md` con flujo y componentes actuales.
  - `docs/dev-setup.md` con setup local y despliegue Apps Script.
  - `docs/decisiones/` con ADR template y ADR inicial.

### Estado tecnico actual

- Arquitectura operativa hibrida:
  - Google Sheets + Apps Script como backend funcional.
  - Firestore como respaldo y colaboracion en vivo.
  - Dexie para cola offline y cache local.
- Frontend en React + TypeScript + Webpack (PWA).
- Endpoints de catalogo/ronda/productos activos en Apps Script.

### Pendientes detectados

- Implementar o definir estrategia para endpoint de totales en backend.
- Revisar manejo de configuraciones sensibles (Firebase/App Script URL).
- Limpiar codigo deprecado y problemas de encoding de texto.
