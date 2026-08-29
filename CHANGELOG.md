# Changelog

## Unreleased

### Added

- Catálogo principal de Steam sin API key, con búsqueda, ficha localizada, carátula, fondo y capturas.
- Selector de proveedor al añadir juegos: Steam, RAWG opcional o entrada manual.
- Catálogo RAWG con búsqueda, importación de metadatos y capturas, y clave personal cifrada mediante Electron `safeStorage`.
- Ficha independiente por juego con fondo, descripción, galería, datos editoriales y progreso personal.
- Campos de perfil para ubicación, avatar y fondo.
- Migraciones SQLite no destructivas para instalaciones del primer MVP.
- Migración de procedencia para distinguir juegos de Steam, RAWG y manuales.
- Documentación de decisión y condiciones del proveedor en `docs/catalog-api.md`.

### Changed

- Biblioteca rediseñada como mural denso de carátulas con filtros.
- Perfil rediseñado con cabecera editorial, resumen visual, expositores y columna lateral de estadísticas reales.
- Ventana inicial ampliada a 1440 × 900 y mínimo de 980 × 680.
