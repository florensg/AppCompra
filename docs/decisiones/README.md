# Decisiones tecnicas (ADR)

Este directorio registra decisiones de arquitectura y tecnologia.

## Convencion

- `0000-template.md`: plantilla base.
- `0001-*.md`, `0002-*.md`, etc: decisiones reales en orden cronologico.

## ADRs actuales

- `0001-arquitectura-hibrida.md`: define el modelo Sheets + Firestore + Dexie.
- `0002-desacople-appshell-modulos-feature.md`: separa AppShell/UI global/shopping/comparison para reducir acoplamiento y prop drilling sin cambiar contratos de sync.
