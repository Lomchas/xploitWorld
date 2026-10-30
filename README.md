# NULL_PROTOCOL

**Wargame de hacking multijugador — terminal Linux simulada**

[![CI Status](https://img.shields.io/github/actions/status/null-protocol/null-protocol?label=CI)](https://github.com/null-protocol/null-protocol/actions)
[![Node Version](https://img.shields.io/badge/node-%3E=20.0.0-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Proprietary-blue)](LICENSE)

## Visión

NULL_PROTOCOL es un wargame de hacking multijugador donde el jugador opera
exclusivamente a través de una terminal Linux simulada. Disponible en web,
desktop y móvil con un solo código base.

## Stack

| Capa          | Tecnología                                      |
| ------------- | ----------------------------------------------- |
| Frontend      | React 18 + Vite 5 + TypeScript + Tailwind CSS 3 |
| Desktop       | Tauri                                           |
| Móvil         | Capacitor                                       |
| Backend       | Node.js 20 + Express 4 + TypeScript             |
| Base de datos | PostgreSQL 16                                   |
| Caché         | Redis 7                                         |
| Monorepo      | pnpm workspaces                                 |

## Estructura del repo

```
null-protocol/
├── apps/
│   ├── frontend/   # Vite + React + TS
│   ├── backend/    # Express + TS
│   ├── desktop/    # Tauri (Fase 3)
│   └── mobile/     # Capacitor (Fase 2)
├── packages/
│   └── shared/     # Tipos y utilidades compartidas
├── docker/         # Docker Compose (Postgres + Redis)
├── docs/           # ARCHITECTURE.md, CONTRIBUTING.md
├── .github/
│   └── workflows/  # CI/CD
├── .husky/         # Git hooks
├── package.json    # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Setup rápido

1. Instala dependencias:

   ```bash
   pnpm install
   ```

2. Levanta servicios de desarrollo (PostgreSQL + Redis):

   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

3. Copia las variables de entorno:

   ```bash
   cp apps/backend/.env.example apps/backend/.env
   cp apps/frontend/.env.example apps/frontend/.env
   ```

4. Inicia todo en modo desarrollo:
   ```bash
   pnpm dev
   ```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000 (GET /health)

## Scripts disponibles

| Script           | Descripción                              |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Levanta frontend y backend en paralelo   |
| `pnpm build`     | Construye todos los paquetes             |
| `pnpm lint`      | Ejecuta ESLint en todos los paquetes     |
| `pnpm typecheck` | Ejecuta TypeScript en todos los paquetes |
| `pnpm test`      | Ejecuta tests en todos los paquetes      |

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Resumen del blueprint
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — Reglas de commit y PR

## Contribuir

Consulta [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) para el flujo de
branches y convenciones de commit (Conventional Commits).

## Licencia

Proprietary
