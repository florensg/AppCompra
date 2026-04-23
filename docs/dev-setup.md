# Entorno de desarrollo

## Requisitos

- Node.js 16+
- npm 8+
- Cuenta Google con acceso a la planilla
- Proyecto Firebase configurado

## 1) Frontend local

```powershell
cd frontend
npm install
npm run dev
```

- URL local: `http://127.0.0.1:5173`
- Build de produccion:

```powershell
npm run build
```

- Chequeo de tipos:

```powershell
npm run typecheck
```

## 2) Configuracion de Apps Script

1. Abrir la planilla Google Sheets del proyecto.
2. Extensiones -> Apps Script.
3. Copiar archivos locales:
   - `apps-script/Code.gs`
   - `apps-script/appsscript.json`
4. Deploy -> New deployment -> Web app.
5. Guardar la URL publicada del deployment.

## 3) Conectar frontend con Apps Script

Definir `window.APP_SCRIPT_URL` en `frontend/public/index.html`:

```html
<script>
  window.APP_SCRIPT_URL = "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec";
</script>
```

## 4) Firebase

La app usa:

- Firebase Auth (Google)
- Firestore (items, entries, totals, liveSessions)

La configuracion actual esta en `frontend/src/firebaseConfig.ts`.

## 5) Flujo recomendado para cambios

1. Implementar cambio.
2. Probar en local (`npm run dev`).
3. Ejecutar `npm run typecheck`.
4. Si cambia comportamiento/arquitectura, actualizar docs:
   - `docs/changelog.md`
   - `docs/decisiones/*.md` (si aplica)
5. Abrir PR con checklist de documentacion.

## 6) Checklist minima de PR

- [ ] Cambio probado en local.
- [ ] Sin errores de TypeScript.
- [ ] Changelog actualizado.
- [ ] ADR agregada/actualizada si hubo decision tecnica.
