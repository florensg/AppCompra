# AppCompras Frontend

Frontend mobile-first para cargar compras por supermercado.

## Requisitos
- Node.js 16+
- npm 8+

## Scripts
- `npm run dev`: desarrollo local en `http://127.0.0.1:5173`
- `npm run build`: build de producción
- `npm run typecheck`: chequeo TypeScript

## Configuración API
La URL del Web App de Google Apps Script se expone en `window.APP_SCRIPT_URL`.

Podés definirla agregando este bloque en `public/index.html`:

```html
<script>
  window.APP_SCRIPT_URL = "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec";
</script>
```

Si no está configurada, la app corre en modo catálogo local demo.
