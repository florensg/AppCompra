# AppCompras

Repositorio de la aplicación de compras para celular (PWA) + backend Google Apps Script.

## Estructura
- `frontend/`: app React + TypeScript + Webpack + PWA.
- `apps-script/`: backend para Google Sheets (`/bootstrap`, `/entries/batch`, `/sync`, `/totals`).

## 1) Levantar frontend
```powershell
cd frontend
npm install
npm run dev
```

## 2) Desplegar Apps Script
1. Abrir la planilla Google Sheets (`Compras`).
2. Extensiones -> Apps Script.
3. Copiar `apps-script/Code.gs` y `apps-script/appsscript.json`.
4. Deploy -> New deployment -> Web app.
5. Acceso: usuarios del hogar con permisos de la planilla.
6. Copiar URL del Web App.

## 3) Conectar frontend con backend
En `frontend/public/index.html`, antes de cerrar `</head>`, agregar:
```html
<script>
  window.APP_SCRIPT_URL = "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec";
</script>
```

## Git
`.gitignore` ya incluye dependencias, build, cachés locales y la planilla `.xlsx`.
