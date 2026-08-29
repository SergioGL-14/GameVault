# GameVault

Biblioteca personal de videojuegos de escritorio, con interfaz inspirada en Steam e integrado todo en español.

## Estado actual (MVP)

- **Perfil editorial**: cabecera personalizable (avatar, fondo, ubicación y bio), nivel derivado de juegos completados, resumen visual, expositor, completados recientes, actividad y géneros frecuentes.
- **Biblioteca de carátulas**: mural compacto con búsqueda y filtros. Cada juego tiene una ficha independiente con fondo, descripción, capturas, metadatos, progreso, puntuación y notas personales.
- **Catálogos por proveedor**: Steam es la búsqueda principal sin configuración. RAWG queda como fuente opcional para juegos ausentes de Steam y también se pueden crear fichas manuales.
- **Persistencia**: base de datos SQLite local (`userData/gamevault.db`).

Lo que quedó para el futuro (no existe todavía): sistema de logros, estadísticas históricas, selección de imágenes desde archivo e integración directa con bibliotecas de plataformas.

## Catálogos

### Steam

No requiere configuración. GameVault consulta los endpoints públicos de búsqueda y detalle de la tienda en español e importa la ficha seleccionada. Estos endpoints funcionan sin API key, pero no forman parte de una API de tienda oficialmente garantizada por Steamworks; están encapsulados para poder sustituirlos si cambian.

### RAWG (opcional)

1. Obtén una clave personal en [RAWG](https://rawg.io/login?forward=developer).
2. En **Biblioteca → Añadir juego → Buscar en RAWG**, pega la clave y pulsa **Guardar y conectar**.
3. GameVault verifica la clave y la cifra en `userData/rawg-key.bin` mediante `safeStorage` (DPAPI en Windows). La clave no se expone al renderer ni se guarda en SQLite.

En desarrollo también se puede definir `RAWG_API_KEY` en el entorno. No se debe incluir ninguna clave compartida en el repositorio, `.env`, bundle o instalador. La decisión y sus condiciones están documentadas en [`docs/catalog-api.md`](docs/catalog-api.md).

## Stack

- Electron 39 + electron-vite 5
- React 19 + TypeScript 5.9
- better-sqlite3 13 (SQLite vía N-API; los prebuilds incluidos funcionan en Node y Electron sin compilar nativo)
- Vitest para pruebas del repositorio

## Arquitectura

```
src/
  shared/    Dominio compartido entre procesos: tipos, canales IPC, validación
  main/      SQLite, repositorio, proveedores Steam/RAWG, almacén cifrado e IPC
  preload/   contextBridge: expone window.api (GameVaultApi)
  renderer/  React: Perfil, mural de Biblioteca, ficha de juego y flujo de importación
```

Flujo de datos: el renderer usa `window.api` (contextBridge → `ipcRenderer.invoke`), el main valida la entrada en el repositorio (`guard` del trust boundary) y opera sobre SQLite. Los proveedores externos también quedan en el main y devuelven un modelo normalizado común. Los tipos y validadores del dominio viven en `src/shared`.

## Scripts

```bash
npm run dev        # desarrollo (HMR renderer)
npm run test       # tests del repositorio (vitest)
npm run lint       # eslint
npm run typecheck  # tsc (node + web)
npm run build:win  # paquete instalable de Windows
```

Nota: no hay `postinstall` de electron-builder. better-sqlite3 13 trae prebuilds N-API y no necesita recompilación nativa, por lo que `npm install` funciona sin Visual Studio.
