# Changelog

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
