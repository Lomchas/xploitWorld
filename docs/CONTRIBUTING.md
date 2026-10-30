# CONTRIBUTING.md

## Flujo de branches

- `main`: rama de producción estable.
- `develop`: rama de integración para desarrollo.
- Feature branches: `feature/<descripcion>` a partir de `develop`.
- Hotfix branches: `hotfix/<descripcion>` a partir de `main`.

## Convenciones de commits (Conventional Commits)

Los mensajes de commit deben seguir el formato:

```
<tipo>[alcance opcional]: <descripcion>
```

Tipos permitidos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`.

Ejemplos válidos:

- `feat: add health endpoint`
- `fix(backend): correct env validation`
- `docs: update architecture blueprint`
- `ci: add pnpm cache to workflow`

Los commits no convencionales son rechazados por commitlint en el hook `commit-msg`.

## Pull Requests

1. Crea una feature branch desde `develop`.
2. Abre un PR contra `develop`.
3. El CI debe pasar (lint + typecheck + build + test).
4. Solicita al menos un revisor.
5. Haz squash merge a `develop` tras la aprobación.
6. Las releases se hacen mergeando `develop` a `main`.
