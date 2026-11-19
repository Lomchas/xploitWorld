# Revisión técnica de NULL_PROTOCOL

Fecha: 6 de noviembre de 2026. Alcance: todos los archivos fuente y de configuración recuperables del ZIP entregado. No se contó con `node_modules`, repositorio Git, base del usuario ni servicios externos del proyecto.

## Resultado

La entrega convierte una base que no compilaba en una versión alpha con navegación, terminal virtual conectada, sesiones de invitado, primer reto y progreso validado por el servidor. Conserva el tema oscuro y los seis niveles de ejemplo. No representa un juego multijugador terminado.

## Integridad del material recibido

El ZIP contenía 118 entradas, todas sin directorios, con nombres repetidos (`package.json`, `index.ts`, `README.md` y otros). Extraerlo normalmente habría sobrescrito archivos de distintos paquetes.

Se recuperaron 73 archivos fuente/configuración en un monorepo coherente con la documentación y los imports. Se omitieron 27 archivos de Prisma generado, 17 archivos internos de Husky y un `.env` que coincidía con su ejemplo. Los generados incluían un motor binario de Windows de unos 21 MB; deben regenerarse para cada entorno.

Las ubicaciones se infirieron; no equivalen a una recuperación exacta del árbol original. La carpeta de la migración inicial se nombró `20261106000000_init` porque el nombre original no estaba disponible. Es necesario recuperar ese historial antes de aplicar migraciones a una base que ya existía. Los imports que apuntaban a vistas ausentes se resolvieron creando versiones básicas de esas vistas.

## Hallazgos y correcciones

| Prioridad                         | Hallazgo original y efecto                                                                            | Corrección aplicada                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Crítica para integridad del juego | Los endpoints públicos devolvían `flag`; bastaba consultar el catálogo para conocer las respuestas.   | DTO público sin solución; selección explícita de campos y solo niveles activos.                                                                        |
| Crítica para integridad del juego | El cliente enviaba `userId` y `completed`, y el backend los aceptaba.                                 | Sesión de invitado verificada, identidad del servidor y validación de `{ levelId, flag }`. Se rechazan los campos anteriores.                          |
| Alta                              | El invitado usaba un identificador aleatorio sin un usuario real en la base.                          | Creación de usuario GUEST y sesión persistida. Cookie opaca; solo el hash del token se guarda en PostgreSQL.                                           |
| Alta                              | No se instalaba el middleware JSON antes de leer `req.body`.                                          | JSON limitado a 8 KiB, validación de estructura y respuestas 400/413.                                                                                  |
| Alta                              | Express 4 no capturaba los rechazos de las rutas asíncronas.                                          | Wrapper explícito que llama a `next(error)` y manejador central sin devolver detalles internos.                                                        |
| Bloqueante                        | `Planet3D` y `ServerSelector` tenían JSX inválido; faltaban vistas y dependencias.                    | Vistas implementadas, dependencias declaradas y componentes tipados. Globo SVG accesible, sin dependencias 3D incompletas.                             |
| Bloqueante                        | `Routes` no tenía `BrowserRouter`, la ruta inicial devolvía `null` y no se importaba el CSS global.   | Router instalado en el punto de entrada, redirección a Historia y estilos conectados.                                                                  |
| Alta                              | La terminal capturaba niveles, progreso y estado de procesamiento desactualizados dentro del efecto.  | Estado de entrada y bloqueo dentro del ciclo de vida, consultas actuales por comando y limpieza al desmontar.                                          |
| Alta                              | La terminal no enviaba sus comandos al WebSocket; el backend solo respondía `executed: ...`.          | Cliente con IDs y timeout, backend con shell virtual y primer escenario guiado.                                                                        |
| Alta                              | Un JSON válido pero de estructura incorrecta podía romper el handler de WebSocket.                    | Guards de estructura y payload, errores controlados, límites, autenticación y procesamiento en orden.                                                  |
| Media                             | El cliente WebSocket permitía conexiones duplicadas y callbacks de conexiones antiguas.               | Guard de OPEN/CONNECTING, descarte de callbacks antiguos, cancelación de timers y rechazo de comandos pendientes.                                      |
| Media                             | La URL de API no se usaba; el WebSocket no incluía `/ws`; no había proxy.                             | Mismo origen por defecto, proxies de Vite y preview, soporte HTTP/HTTPS y WS/WSS.                                                                      |
| Media                             | El informe de progreso cruzaba slugs con IDs; trataba fechas JSON como `Date`.                        | Cruce por ID, contratos compartidos y fechas ISO.                                                                                                      |
| Media                             | Intentos posteriores podían deshacer un éxito o cambiar su fecha; faltaba fecha al crear un éxito.    | Transacción, incremento atómico y conservación del primer éxito.                                                                                       |
| Media                             | El historial se recreaba y su puntero exportado quedaba desactualizado.                               | Hook estable, fábrica testeable, getters y límite de 200 entradas en `sessionStorage`.                                                                 |
| Media                             | `ignoreDeprecations: "6.0"` no correspondía a TypeScript 5; Tailwind y plugins no estaban conectados. | TypeScript 5.5.4 compatible con el tooling existente, PostCSS y configuración Tailwind válida.                                                         |
| Media                             | pnpm no tenía una versión exacta y el CI configuraba su caché antes de instalarlo.                    | pnpm 9.15.9, Node 24, instalación reproducible y orden corregido del CI.                                                                               |
| Media                             | La documentación afirmaba capacidades no implementadas y proponía ejecutar comandos reales.           | Documentación de comportamiento actual y simulación en memoria. PVP, Redis y apps nativas quedan identificados como pendientes.                        |
| Rendimiento                       | La terminal se incluía en el JavaScript de todas las rutas.                                           | Carga diferida del terminal. El build observado pasó de un chunk de ~521 kB a una entrada de ~180 kB y un chunk de terminal de ~342 kB, antes de gzip. |

## Verificación

El estado de las comprobaciones está resumido en [VALIDACION.md](VALIDACION.md). Se comprobaron lint, tipos de producción y pruebas, tests y compilación de los tres paquetes.

Las pruebas originales eran ocho y pasaban a pesar de los errores de compilación del frontend. La cobertura nueva incluye parser, payloads nulos, comandos virtuales, historial estable, reconexión, errores HTTP, sesiones, flags y escrituras simultáneas de progreso.

La integración local se ejecuta con Prisma contra PostgreSQL en WebAssembly mediante PGlite y su interfaz TCP, con un pool de una conexión. Permite verificar consultas y transacciones del recorrido funcional; no demuestra comportamiento de carga o concurrencia de un servidor PostgreSQL 16 con varios procesos. El workflow de CI preparado usa PostgreSQL 16 real; no se ejecutó en GitHub durante esta revisión.

La consulta externa de vulnerabilidades de dependencias quedó pendiente: la revisión automática de permisos rechazó enviar a npm los metadatos de dependencias de producción. No se afirma que las dependencias estén libres de vulnerabilidades. Se mantuvo la familia principal del stack para acotar cambios de compatibilidad.

## Límites que siguen vigentes

- Solo el primer nivel dispone de un escenario jugable. Los otros cinco conservan sus metadatos y soluciones de ejemplo en el backend.
- Las soluciones del seed son estáticas y están visibles para quien tenga acceso al código del servidor. Para competición deberán generarse por jugador o partida.
- Las regiones son una selección visual. No hay matchmaking, salas, oponentes, economía ni combate.
- La sesión de invitado dura hasta 7 días; borrar cookies o vencer la sesión impide recuperar esa identidad desde la interfaz. El registro y la recuperación de cuenta no están implementados.
- La shell es una simulación básica, sin pipes, redirecciones, permisos completos, procesos reales ni red real. Su estado de archivos/cwd se reinicia al reconectar.
- Los límites HTTP y WebSocket viven en memoria por proceso. Faltan coordinación entre instancias, métricas, limpieza periódica de sesiones/invitados y política de retención.
- Desktop y móvil contienen reservas documentales. No hay empaquetado nativo ni despliegue publicado.
- El árbol y el nombre de la migración se reconstruyeron; hay que contrastarlos con el repositorio original si todavía existe.

## Orden recomendado para continuar

1. **Misiones completas:** definir cada escenario, archivos, pistas, permisos virtuales y condición de éxito. Diseñar un esquema de misión versionado antes de añadir más comandos sueltos.
2. **Identidad recuperable:** registro/login, hash de contraseñas, recuperación de acceso y migración del progreso de invitado.
3. **Aislamiento y persistencia del mundo:** instancias por misión/jugador, flags por partida y snapshot del filesystem virtual.
4. **PVP autoritativo:** salas por región, estado calculado en servidor, eventos tipados, reglas y pruebas de dos jugadores sobre el mismo mundo.
5. **Operación:** ejecutar CI sobre PostgreSQL 16, revisar dependencias cuando se autorice la consulta, configurar TLS/proxy, métricas, límites distribuidos y pruebas de carga.
6. **Empaquetado nativo y 3D real:** retomarlos cuando el recorrido web y los escenarios estén estables.

## Referencias consultadas

- [Express 4: manejo de errores](https://expressjs.com/en/4x/guide/error-handling/).
- [Prisma 6: configuración](https://www.prisma.io/docs/orm/v6/reference/prisma-config-reference).
- [Prisma 6: seed](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/seeding).
- [xterm: uso de addons](https://xtermjs.org/docs/guides/using-addons/).
- [PGlite Socket: interfaz y limitaciones](https://pglite.dev/docs/pglite-socket).
