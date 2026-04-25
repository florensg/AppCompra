# ADR-0002: Desacople de AppShell y modularizacion por feature (UI/Shopping/Comparison)

- Fecha: 2026-04-25
- Estado: Aprobada
- Responsable: Equipo AppCompras

## Contexto

`App.tsx` y el shell de la app acumulaban logica de dominio y prop drilling entre vistas.
Esto aumentaba el acoplamiento, dificultaba el mantenimiento y elevaba riesgo de regresiones al tocar `shopping` y `comparison`.

Al mismo tiempo, era necesario preservar el comportamiento existente de sincronizacion offline-first:

- Dexie (`syncQueue`, cache y rondas)
- Firestore (colaboracion/live)
- Apps Script (interoperabilidad legacy Sheets)

## Opciones evaluadas

1. Mantener estructura actual y reducir props de forma parcial.
2. Introducir un Context global unico para toda la app.
3. Separar por feature con hooks de modulo y contexto UI especifico.

## Decision

Adoptar opcion 3:

- `App` y `AppShell` quedan como orquestadores de sesion/navegacion/render.
- Estado de UI global (busqueda/filtros) se mueve a `features/ui/hooks/useGlobalUI`.
- Dominio de compras permanece en `features/shopping/hooks/useShoppingModule`.
- Comparacion se encapsula en `features/comparison/hooks/useComparisonModule`.
- Vistas (`ShoppingView`, `ComparisonView`, `ProductListView`) consumen hooks de feature sin prop drilling masivo.

## Consecuencias

### Positivas

- Menor acoplamiento entre shell y dominio.
- Responsabilidades mas claras (UI vs negocio vs infraestructura).
- Mejor mantenibilidad y menor costo de cambios incrementales.

### Negativas / Trade-offs

- Mas archivos/hook boundaries para navegar.
- Mayor disciplina en exports de feature para evitar dependencias cruzadas.

## Impacto en consistencia de datos y contratos

- Sin cambios en contratos de Apps Script (`/bootstrap`, `/round`, `/totals`, `/entries/batch`, `/items/*`).
- Sin cambios en semantica de Dexie `syncQueue` ni flujo de sincronizacion.
- Sin cambios en modelo de colaboracion Firestore; solo reorganizacion de consumo desde hooks.

## Notas

- Compatibilidad preservada manteniendo `entryMap` y `entryKey` en `useShoppingModule`.
- Se agrega `getEntry(store, itemId)` para encapsular acceso a entries sin romper API actual.
