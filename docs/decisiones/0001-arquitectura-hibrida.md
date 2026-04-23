# ADR-0001: Arquitectura hibrida Sheets + Firestore + cache offline

- Fecha: 2026-04-23
- Estado: Aprobada
- Responsable: Equipo AppCompras

## Contexto

La aplicacion necesita:

- Mantener un catalogo y una salida final simple para usuarios no tecnicos (hoja de calculo).
- Permitir colaboracion entre usuarios durante una ronda.
- Soportar cortes de conectividad en uso movil dentro de supermercado.

Una arquitectura solo con Sheets no cubre bien colaboracion en vivo ni offline. Una arquitectura solo con Firestore complica el modelo operativo actual del equipo, que usa Sheets como salida principal.

## Opciones evaluadas

1. Solo Google Sheets + Apps Script.
2. Solo Firebase (Firestore/Auth) como backend principal.
3. Hibrida: Sheets como fuente/destino operativo + Firestore para respaldo/live + Dexie para offline local.

## Decision

Adoptar opcion 3 (hibrida):

- Google Sheets (via Apps Script) se mantiene como backend funcional del catalogo y sincronizacion de rondas.
- Firestore se usa para respaldo de datos y colaboracion en tiempo real.
- Dexie se usa para cola de sincronizacion y cache local en modo offline.

## Consecuencias

### Positivas

- Se conserva el flujo operativo existente sobre Sheets.
- Se habilita colaboracion multiusuario por fecha/sesion.
- Se reduce riesgo de perdida de datos sin conectividad.

### Negativas / Trade-offs

- Mayor complejidad operativa por multiples fuentes y estados.
- Necesidad de reconciliar consistencia entre Firestore y Sheets.
- Mas puntos de fallo y observabilidad distribuida.

## Plan de implementacion

1. Mantener `fetchBootstrap` priorizando Sheets con fallback a Firestore/cache.
2. Mantener guardado por lote con cola local Dexie cuando no hay red.
3. Consolidar estrategia de totales (hoy incompleta en Apps Script).
4. Documentar reglas de consistencia y resolucion de conflictos.

## Notas

- Documentacion relacionada:
  - `docs/arquitectura.md`
  - `docs/dev-setup.md`
  - `docs/changelog.md`
