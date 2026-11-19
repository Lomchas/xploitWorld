# Arquitectura de la primera versión

La separación de los servicios a partir de M6.5 se documenta en la [guía de instalación](../SETUP_GUIDE.md#servidores-independientes).

XploitworlD es una aplicación web de entrenamiento. El terminal trabaja sobre un sistema de archivos virtual en memoria en el backend. No inicia procesos ni accede a archivos o redes del sistema operativo anfitrión.

## Responsabilidades

| Módulo                      | Función                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `apps/frontend/src/App.tsx` | Navegación y ciclo de vida de la conexión                              |
| `components/Terminal`       | Entrada, representación xterm, historial y comandos de juego           |
| `lib/api.ts`                | HTTP con cookies, timeout y contratos compartidos                      |
| `lib/ws-client.ts`          | Correlación de comandos, reconexión y rechazo de peticiones pendientes |
| `apps/backend/src/app.ts`   | Sesiones, catálogo público, validación de flags y progreso             |
| `lib/session.ts`            | Cookies opacas, hash SHA-256, identidad y vencimiento                  |
| `ws`                        | Upgrade autenticado, límites, heartbeat y mensajes validados           |
| `game/shell.ts`             | Directorios, archivos y comandos del entorno virtual por conexión      |
| `packages/shared/src`       | DTO públicos, guards y parser sin dependencias del backend             |

El frontend compila los contratos compartidos desde su código fuente. El backend CommonJS consume su build. El terminal se carga con importación dinámica.

## REST

| Método y ruta           | Acceso            | Resultado                                                      |
| ----------------------- | ----------------- | -------------------------------------------------------------- |
| `GET /health`           | Público           | 200 o 503 según la base                                        |
| `POST /api/session`     | Público, limitado | Reutiliza la sesión válida o crea un invitado y una cookie     |
| `GET /api/session`      | Sesión            | Identidad del invitado                                         |
| `DELETE /api/session`   | Sesión            | Revoca la sesión y elimina la cookie                           |
| `GET /api/levels`       | Público           | Niveles activos, ordenados; sin flags                          |
| `GET /api/levels/:slug` | Público           | Detalle activo; sin flag                                       |
| `GET /api/progress`     | Sesión            | Solo el progreso del usuario autenticado                       |
| `POST /api/progress`    | Sesión, limitado  | Recibe `{ levelId, flag }` y devuelve `{ accepted, progress }` |

La API rechaza `userId` y `completed` enviados al guardar progreso. El backend verifica la solución; cada envío válido cuenta como un intento. Una solución errónea posterior no revierte un éxito ni su primera fecha. Las escrituras de intentos usan una transacción y un incremento atómico. Las fechas de los DTO JSON son cadenas ISO.

Las sesiones duran 7 días y guardan solo el hash del token en la base. La cookie es HttpOnly, SameSite=Strict y Secure en producción. No hay registro/login de cuentas en esta versión. Los endpoints de sesión y progreso no se cachean.

## WebSocket

La ruta es `/ws`. El upgrade exige una sesión vigente y valida `Origin` cuando está presente. Cada conexión tiene un entorno virtual independiente; al reconectar, los archivos de ejemplo y el directorio se reinician, mientras el progreso permanece en PostgreSQL.

```json
{ "type": "cmd", "id": "request-1", "payload": { "raw": "pwd" } }
```

```json
{
  "type": "cmd_response",
  "id": "request-1",
  "payload": { "output": "/home/guest", "exitCode": 0, "cwd": "/home/guest" }
}
```

`ping`, `pong` y `error` completan el protocolo. Los mensajes se procesan por orden en cada conexión y la sesión se valida nuevamente en cada mensaje, incluida su revocación. El cliente no reenvía automáticamente un comando interrumpido.

Límites actuales: 8 KiB por mensaje, 2000 caracteres por comando, 30 mensajes por 10 segundos y conexión, 10 conexiones/handshakes por IP y 1000 en total. El heartbeat termina conexiones sin respuesta o vencidas. HTTP tiene límites separados. Los contadores de rate limiting son locales a cada proceso. PVP coordina sus escrituras mediante PostgreSQL y envía avisos de revisión por WebSocket.

## Estado del juego

El primer nivel tiene una señal oculta en `/home/guest/.signal`, leída desde la base al abrir la conexión. Los otros cinco niveles conservan sus metadatos originales como catálogo de trabajo. Las regiones del selector enlazan con las arenas de M2. El modo PVP usa un modelo de red virtual y estado persistente en PostgreSQL. [Contratos y reglas de M2](M2_PVP.md)

El antiguo componente `Planet3D` se sustituyó por un globo SVG con selección accesible. La ilustración actual no es una escena WebGL. Se conservó el nombre del componente para reducir cambios de imports.

Desktop y móvil siguen reservados; no incluyen wrappers Tauri o Capacitor funcionales.
