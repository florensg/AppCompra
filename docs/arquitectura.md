# Arquitectura AppCompras

## Objetivo

AppCompras permite cargar y comparar compras por supermercado, con foco en uso movil, colaboracion basica y tolerancia a cortes de red.

## Componentes principales

### 1) Frontend (`frontend/`)

- Stack: React 18 + TypeScript + Webpack + Tailwind/CSS.
- Entrada: `frontend/src/index.tsx`.
- Aplicacion principal: `frontend/src/App.tsx`.
- Autenticacion: Firebase Auth (`frontend/src/auth.ts`).
- Estado offline local: Dexie (`frontend/src/db.ts`).
- Integracion de datos: capa hibrida en `frontend/src/api.ts`.

### 2) Backend Apps Script (`apps-script/`)

- Archivo principal: `apps-script/Code.gs`.
- Runtime: V8.
- Fuente de datos principal: Google Sheets (hoja `Compras`).
- Modelo de catalogo:
  - Fila 2: nombres de supermercados.
  - Desde fila 4: productos.

### 3) Firebase

- Auth: login con Google para acceso a la app.
- Firestore:
  - Respaldo de catalogo.
  - Persistencia de entries.
  - Sesiones colaborativas en vivo por fecha.

## Flujo de datos

### Bootstrap de catalogo

1. Frontend llama `fetchBootstrap()`.
2. `api.ts` intenta `GET bootstrap` en Apps Script.
3. Si responde Sheets, se usa como fuente principal y se sincroniza copia a Firestore.
4. Si falla Sheets, frontend cae a Firestore y luego a cache local Dexie.

### Guardado de ronda

1. Usuario carga precios/cantidades por item y supermercado.
2. Frontend persiste entries en Firestore.
3. Si hay red, intenta sincronizar lote en Apps Script (`POST entries/batch`).
4. Si no hay red o falla sincronizacion, se encola en Dexie (`syncQueue`) para reintento.

### Colaboracion en vivo

1. Se obtiene/crea `liveSessionId` por fecha en Firestore.
2. Se abre listener de entries por `fecha + sessionId`.
3. Cambios remotos se fusionan en UI, respetando conflicto por timestamp.

## Endpoints Apps Script vigentes

- `GET /bootstrap`
- `POST /entries/batch`
- `POST /sync` (alias)
- `POST /items/create`
- `POST /items/update`
- `POST /items/delete`
- `GET /round?fecha=YYYY-MM-DD`
- `GET /totals` (actualmente retorna vacio)

Nota tecnica: desde frontend se invocan via `?path=...` por limitacion de ruteo del Web App de Apps Script.

## Decisiones estructurales actuales

- Sheets es la fuente principal de lectura de catalogo y destino de cierre de ronda.
- Firestore actua como capa de respaldo y colaboracion en vivo.
- Dexie cubre modo offline local y cola de sincronizacion.

## Riesgos y pendientes tecnicos

- Claves Firebase embebidas en codigo fuente (`frontend/src/firebaseConfig.ts`).
- Texto con problemas de encoding en algunas vistas/comentarios.
- `GET /totals` en Apps Script no implementa calculo real.
- Existe codigo legado/deprecado (`frontend/src/sheetsApi.ts`, constantes de API v4).
