# Proveedores de catálogo de GameVault

Fecha de evaluación: 29 de agosto de 2026.

## Decisión actual

GameVault utiliza tres vías de entrada, en este orden:

1. **Steam** como buscador principal sin configuración.
2. **RAWG** como proveedor opcional con clave personal para ampliar cobertura.
3. **Entrada manual** para cualquier juego ausente de ambos catálogos.

Todos los proveedores se normalizan al mismo modelo del dominio antes de guardar una ficha en SQLite. La biblioteca no depende directamente del formato de Steam ni de RAWG, por lo que una futura API propia puede reemplazar estas implementaciones sin rehacer la interfaz o los datos personales.

## Steam: proveedor principal

La tienda expone actualmente dos endpoints HTTPS que responden sin credenciales:

- Búsqueda: `GET https://store.steampowered.com/api/storesearch/?term=portal&l=spanish&cc=ES`
- Detalle: `GET https://store.steampowered.com/api/appdetails?appids=400&l=spanish&cc=ES`

La búsqueda aporta AppID, título, miniatura, plataformas y Metacritic. El detalle aporta descripción localizada, desarrolladores, distribuidores, géneros, plataformas, fecha, imágenes, fondo y capturas. GameVault deriva además la cápsula vertical de biblioteca a partir del AppID y conserva una alternativa visual cuando no esté disponible.

### Limitación importante

Los endpoints anteriores funcionan públicamente, pero no aparecen en la referencia oficial de Steamworks Web API como un contrato soportado para terceros. Valve documenta que Steamworks contiene métodos públicos y protegidos, pero estos endpoints concretos pertenecen a la tienda y pueden cambiar, limitar peticiones o desaparecer sin compatibilidad garantizada.

Por eso Steam es adecuado para el MVP, pero queda detrás de la interfaz interna `GameCatalog`, con timeout, errores normalizados y persistencia local del resultado importado. No se consulta Steam cada vez que se abre una ficha.

## RAWG: proveedor opcional

RAWG cubre búsqueda, fichas, géneros, plataformas, desarrolladores, imágenes y capturas, incluidos juegos que no tienen página en Steam. Requiere una API key en cada petición.

En una aplicación Electron no se puede distribuir una clave global de forma secreta. Por ahora se utiliza BYOK (_bring your own key_): el usuario puede añadir su propia clave solo si necesita RAWG. GameVault la valida antes de guardarla, la cifra con Electron `safeStorage`, realiza las peticiones desde el proceso principal y nunca la devuelve al renderer.

RAWG exige atribución enlazada en las vistas que usan sus datos o imágenes. Sus condiciones publicadas indican 20.000 peticiones mensuales en el plan gratuito y la página comercial limita dicho plan a proyectos no comerciales. Antes de distribuir o monetizar GameVault debe confirmarse con RAWG el plan aplicable.

## Futura API de GameVault

Si el proyecto se distribuye ampliamente, el siguiente paso será un proxy propio:

```text
GameVault Desktop -> API GameVault -> proveedores externos
```

Ese servicio custodiará credenciales compartidas, aplicará caché, límites y control de abuso, y permitirá sustituir fuentes sin publicar una nueva versión del cliente. No se implementa todavía porque el catálogo de Steam y la entrada manual cubren el MVP sin infraestructura adicional.

## Fuentes primarias

- [Steam Store Search: respuesta del endpoint](https://store.steampowered.com/api/storesearch/?term=portal&l=spanish&cc=ES)
- [Steam Store App Details: respuesta del endpoint](https://store.steampowered.com/api/appdetails?appids=400&l=spanish&cc=ES)
- [Steamworks Web API Overview](https://partner.steamgames.com/doc/webapi_overview)
- [RAWG API](https://rawg.io/apidocs)
- [RAWG API Terms](https://rawg.io/tos_api)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)
