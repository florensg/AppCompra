# AppCompras

Aplicacion de compras colaborativa para supermercado.

- Frontend: PWA React + TypeScript
- Backend operativo: Google Apps Script sobre Google Sheets
- Respaldo y colaboracion: Firebase (Auth + Firestore)

## Documentacion

- [Resumen de arquitectura](./docs/arquitectura.md)
- [Guia de entorno y desarrollo](./docs/dev-setup.md)
- [Registro de cambios](./docs/changelog.md)
- [Decisiones tecnicas (ADR)](./docs/decisiones)

## Estructura

- `frontend/`: app web mobile-first (PWA).
- `apps-script/`: API HTTP para lectura/escritura en Google Sheets.
- `docs/`: documentacion tecnica del proyecto.

## Flujo funcional (resumen)

1. Usuario inicia sesion con Google en frontend (Firebase Auth).
2. Frontend pide bootstrap de catalogo al Apps Script (`/bootstrap`).
3. Carga de ronda: se guardan entries en Firestore y se sincronizan a Sheets.
4. Si no hay red, la ronda queda en cola local (Dexie) y se reintenta al reconectar.

## Inicio rapido

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Servidor local: `http://127.0.0.1:5173`

### Apps Script

1. Abrir la planilla Google Sheets del proyecto.
2. Extensiones -> Apps Script.
3. Copiar `apps-script/Code.gs` y `apps-script/appsscript.json`.
4. Deploy -> New deployment -> Web app.
5. Copiar URL de deployment y exponerla en frontend:

```html
<script>
  window.APP_SCRIPT_URL = "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec";
</script>
```

## Reglas de documentacion

- Todo cambio funcional relevante debe actualizar `docs/changelog.md`.
- Toda decision tecnica de arquitectura debe crear/actualizar una ADR en `docs/decisiones/`.
- Todo PR que cambie comportamiento debe incluir ajuste de documentacion.
