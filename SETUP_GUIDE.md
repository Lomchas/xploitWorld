# Instalar XploitworlD M6.5

El arranque `pnpm jugar` prepara y ejecuta el juego completo desde el menú. Para publicarlo en un VPS con Historia y PvP, consulta la [guía del servidor completo](docs/SERVIDOR_COMPLETO.md).

## Requisitos y arranque

Instala Node.js 24.15 o posterior dentro de la rama 24, pnpm 9.15.9 y Docker Desktop con Compose v2. Extrae el ZIP y abre PowerShell dentro de `null-protocol`.

```powershell
pnpm install --frozen-lockfile
docker compose -f docker/docker-compose.story.yml up -d --wait
docker compose -f docker/docker-compose.pvp.yml up -d --wait
pnpm db:setup
pnpm dev
```

| Sitio | Dirección | Base local |
| --- | --- | --- |
| Menú y configuración | <http://127.0.0.1:5173> | |
| Historia | <http://historia.localhost:5174/historia> | PostgreSQL 5434 |
| PvP | <http://pvp.localhost:5175/pvp> | PostgreSQL 5433 |

Abre el menú en un navegador actual. Si Windows no resuelve los nombres terminados en `.localhost`, añade `127.0.0.1 historia.localhost pvp.localhost` al archivo hosts de Windows. Usa los nombres indicados para que el navegador mantenga las sesiones por separado.

El ZIP incluye `apps/backend/.env`, `apps/backend/.env.pvp` y `apps/frontend/.env`. Si administras otra instalación, las variables `STORY_DATABASE_URL` y `PVP_DATABASE_URL` permiten sustituir las conexiones locales sin editar los archivos. El servicio comprueba que la base se inicializó para su modo.

Si ya tienes M6.5, conserva los volúmenes de PostgreSQL y ejecuta `pnpm install --frozen-lockfile` y `pnpm db:setup` en la versión nueva con ambas bases levantadas. La migración registra las nuevas arenas del Atlas. Con `pnpm dev pvp`, abre <http://pvp.localhost:5175/servidores>. El arranque autónomo con `pnpm start:pvp` aplica las migraciones de Arena a la base configurada.

## Actualizar desde M6.4

Detén el juego anterior y conserva su contenedor y volumen PostgreSQL como origen. La instalación estándar de M6.4 usa `127.0.0.1:5432/nullprotocol`. Levanta también las dos bases nuevas con los comandos anteriores y ejecuta `pnpm db:setup`. Antes de iniciar M6.5 por primera vez, ejecuta lo siguiente.

```powershell
pnpm migrate:split
pnpm dev
```

Si tu origen usa una conexión distinta, establece `LEGACY_DATABASE_URL` antes de `pnpm migrate:split`. Puedes ensayar la migración con un respaldo restaurado en otro PostgreSQL. Usa destinos recién inicializados. El comando verifica los saldos contra el libro contable, conserva el total disponible y los depósitos abiertos y registra los ajustes que requiera la separación. El origen se lee en una transacción y queda disponible para revisar el histórico. Las antiguas publicaciones de artículos dejan sus objetos disponibles en el inventario de Historia.

- **Historia con cuenta vinculada.** Abre **Pausa → Exchange → Cuenta de Historia → Iniciar sesión** y usa tu nombre y clave anteriores.
- **Historia como invitado.** Usa **Migrar perfil M6.4** en Cuenta de Historia. Los códigos de un solo uso se guardan en `migracion-m64/claims-private.json` bajo `storyClaims`, por identificador anterior.
- **PvP existente.** En **Recuperar acceso a Arena → Migrar perfil M6.4**, usa el código de tu equipo en `claims-private.json` bajo `claims`. Elige un usuario y una clave de Arena. Se recuperan el equipo, su registro, la economía de Arena y sus contratos.
- **Archivos antiguos.** Los archivos de la carpeta común pasan a Historia. Los equipos conservan sus eventos en Arena y pueden exportar la bitácora desde su propia terminal. El respaldo M6.4 conserva el historial original del mercado y las sesiones anteriores.

Guarda el archivo de códigos en privado. La ejecución de nuevo con el mismo origen y directorio reconoce los destinos ya importados. Si aparece una discrepancia del libro anterior, comprueba ese saldo contra el respaldo antes de reintentar.

## Servidores independientes

`pnpm dev` levanta los tres sitios. Para trabajar por separado, abre una terminal por servicio y usa el comando correspondiente.

```powershell
pnpm dev menu
pnpm dev story
pnpm dev pvp
```

`pnpm build` genera `dist/menu`, `dist/story` y `dist/pvp` dentro de `apps/frontend`. Sirve cada directorio en su origen. Configura `VITE_MENU_ORIGIN`, `VITE_STORY_ORIGIN` y `VITE_PVP_ORIGIN` al compilar para tus dominios. Configura `/api`, `/health` y `/ws` del sitio para apuntar a su backend, con HTTPS en producción y solo el origen de su propia web en `FRONTEND_ORIGINS`.

### PvP en Docker

En una instalación de desarrollo que vaya a ejecutar el backend de Arena dentro de Docker, usa el perfil siguiente. La API y PostgreSQL quedan en la red interna y la pasarela HTTP escucha en el puerto local 3001. Para el frontend, ejecuta `pnpm --filter @null-protocol/frontend dev --mode pvp`. Mantén aparte el backend de Historia. Para una instalación pública nueva, configura TLS en el proxy de entrada, una contraseña de base de datos en `XWD_PVP_DB_PASSWORD` (una cadena hexadecimal generada al azar), el origen HTTPS de la web en `PVP_FRONTEND_ORIGINS` y `PVP_NODE_ENV=production`. [Redes internas de Compose](https://docs.docker.com/compose/how-tos/networking/#internal-networks)

```powershell
docker compose -f docker/docker-compose.pvp.yml -f docker/docker-compose.pvp-server.yml up -d --build
```

El arbitraje y los perfiles de prueba apuntan a Arena cuando se ejecutan desde la raíz con `pnpm resolve:dispute` o `pnpm demo:pvp`.

## Verificar

```powershell
pnpm prisma:generate
pnpm check
$env:NODE_ENV = "test"
$env:TEST_DATABASE_URL = "postgresql://xwd_story:xwd_story@127.0.0.1:5434/xwd_story"
pnpm test:integration
Remove-Item Env:NODE_ENV
Remove-Item Env:TEST_DATABASE_URL
```

Las pruebas crean esquemas temporales. Para comprobar la separación desde el navegador, guarda `nota.txt` en la terminal de Historia y crea otro archivo con el mismo nombre en la de Arena. Comprueba el contenido en ambos modos tras recargar. La prueba de contratos requiere dos sesiones de Arena vinculadas y un dispositivo por sesión. La compra de herramientas se verifica en Exchange de Historia.
