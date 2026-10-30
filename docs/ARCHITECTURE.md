# ARCHITECTURE.md

## Resumen del Blueprint

NULL_PROTOCOL es un wargame de hacking multijugador donde el jugador opera
exclusivamente a través de una terminal Linux simulada.

### Stack

- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind CSS 3 (web), Tauri (desktop), Capacitor (móvil)
- **Backend:** Node.js 20 + Express 4 + TypeScript
- **Base de datos:** PostgreSQL 16
- **Caché / Colas:** Redis 7
- **Monorepo:** pnpm workspaces (apps/* + packages/*)

### Estructura de paquetes

| Paquete  | Ruta              | Descripción                             |
| -------- | ----------------- | --------------------------------------- |
| Frontend | `apps/frontend`   | Vite + React + TS, bootable placeholder |
| Backend  | `apps/backend`    | Express + TS, `/health` endpoint        |
| Shared   | `packages/shared` | Tipos y utilidades compartidas          |
| Desktop  | `apps/desktop`    | Tauri wrapper (Fase 3)                  |
| Mobile   | `apps/mobile`     | Capacitor wrapper (Fase 2)              |

### Comunicación

- Frontend → Backend: REST sobre HTTP (VITE_API_URL)
- Frontend → Backend: WebSocket (VITE_WS_URL) — fase 0.2
- Backend → PostgreSQL: conexión directa — fase 0.3
- Backend → Redis: caché y sesiones — fase 0.3

### Límites de fase

Este sub-paso (0.1) solo establece la base: monorepo, tooling, CI/CD.
No hay lógica de juego, esquema de DB, terminal, auth ni deploy todavía.
