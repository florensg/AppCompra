# Módulos de negocio

Esta carpeta queda organizada por dominio funcional:

- `auth`: inicio/cierre de sesión.
- `products`: catálogo y ABM de productos.
- `shopping`: carga de compra (precio/cantidad/carrito).
- `comparison`: comparación de precios entre supermercados.
- `supermarkets`: ABM de supermercados activos/inactivos.

## Regla de dependencias

- `products` y `supermarkets` no dependen entre sí.
- `shopping` y `comparison` consumen datos de `products/supermarkets`.
- `auth` es transversal (no dominio de compras).
