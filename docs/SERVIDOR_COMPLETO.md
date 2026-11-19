# Jugar XploitworlD completo

## Abrir el juego en tu computador

Instala Node.js 24, pnpm 9.15.9 y Docker Desktop. Abre Docker Desktop y, dentro de `null-protocol`, ejecuta en PowerShell.

```powershell
pnpm install --frozen-lockfile
pnpm jugar
```

Abre <http://127.0.0.1:5173>. Este es el menú principal del juego. El arranque prepara las dos bases de datos, aplica las migraciones y abre los servicios de Historia y PvP.

| Entrada | Módulos disponibles |
| --- | --- |
| Menú principal | Historia, Multijugador PvP y Configuración |
| Historia | Introducción, terminal de campaña, misiones, prácticas, partidas guardadas, tienda e inventario de Exchange y cuenta de Historia |
| PvP | Computadora personal, terminal, archivos, dispositivo, panel de arena, Atlas y contratos |

## Alojarlo para jugar desde otros dispositivos

Para las primeras pruebas con pocas personas, prepara un VPS Linux con al menos 2 vCPU, 4 GB de RAM, 40 GB de disco y una IPv4 pública. Es una recomendación inicial de capacidad para esta aplicación. Los recursos necesarios aumentarán con la concurrencia.

Necesitarás acceso SSH al VPS, Docker Engine con Compose v2 y Node.js 24 para ejecutar el configurador. En el firewall del proveedor habilita TCP 80 y 443 para el juego y el acceso SSH de tu administrador. [Instalar Docker en Ubuntu](https://docs.docker.com/engine/install/ubuntu/)

1. Sube el ZIP actualizado al VPS por SFTP o SCP y extráelo. Conserva la carpeta `null-protocol` como raíz de la instalación.
2. Abre una sesión SSH y entra en `null-protocol`.
3. Configura la IP pública real del VPS. El ejemplo usa una dirección reservada para documentación.

```bash
node scripts/server.mjs config 203.0.113.10
node scripts/server.mjs start
```

El primer comando crea `.env.server` y genera automáticamente contraseñas diferentes para las dos bases. Al repetirlo reutiliza las contraseñas. Conserva este archivo junto a la instalación.

El segundo comando construye y levanta el servidor web, Historia, PvP y sus bases persistentes. Aplica las migraciones, espera a los servicios y comprueba los tres puntos de entrada por HTTPS antes de anunciar que el juego está disponible. Los contenedores se inician automáticamente después de reiniciar el VPS. [Orden de arranque de Compose](https://docs.docker.com/compose/how-tos/startup-order/)

Con la IP de ejemplo, imprime estas direcciones.

| Sitio | Dirección de ejemplo |
| --- | --- |
| Menú principal | `https://xploitworld.203-0-113-10.sslip.io` |
| Historia | `https://historia.xploitworld.203-0-113-10.sslip.io/historia` |
| PvP | `https://pvp.xploitworld.203-0-113-10.sslip.io/pvp` |

`sslip.io` resuelve los nombres a la IP incluida en ellos y permite usar un nombre gratuito. Caddy solicita y renueva los certificados HTTPS cuando los nombres resuelven al VPS y sus puertos públicos están accesibles. [DNS de sslip.io](https://sslip.io/) · [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https)

Comparte la dirección del menú principal con los jugadores. Cada navegador puede entrar a Historia o PvP desde ese menú.

Si tienes un dominio propio, ejecuta `node scripts/server.mjs config juego.tudominio.com` y crea registros DNS para ese nombre, `historia.juego.tudominio.com` y `pvp.juego.tudominio.com`, apuntando los tres al VPS. Después vuelve a ejecutar el comando de arranque.

## Reemplazar la introducción

La versión española usa el video de reconocimiento en 1080p con la narración de Carlos. Dura 86,5 segundos. El reproductor pasa a la terminal al terminar.

| Archivo dentro de `null-protocol` | Contenido |
| --- | --- |
| `apps/frontend/public/intro/vanta-es.mp4` | Video en español que puedes reemplazar |
| `apps/frontend/public/intro/vanta-es.vtt` | Subtítulos sincronizados |
| `apps/frontend/public/intro/vanta-es-poster.webp` | Imagen previa del video español |
| `apps/frontend/public/intro/vanta-en.mp4` | Video en inglés |
| `apps/frontend/public/intro/vanta-en.vtt` | Subtítulos en inglés |
| `apps/frontend/src/views/story-opening.json` | Transcripción de ambas versiones |

Exporta las mejoras como MP4 H.264 con audio AAC. Reemplaza `vanta-es.mp4` en la misma ruta. En el despliegue completo, esa carpeta se monta directamente en el servidor web y los videos se revalidan al abrirlos. Puedes subir el nuevo archivo con un nombre temporal y renombrarlo al terminar la transferencia. Actualiza también los subtítulos si cambias la narración.

En Historia abre **Pausa → Partidas guardadas → Volver a ver la introducción** para revisarla de nuevo. Si cambias la transcripción del código, vuelve a ejecutar el comando de arranque para recompilar.

## Comprobar la partida

1. Abre el menú y entra en **Historia**. Pulsa **Iniciar historia con voz**. Al finalizar la intro debe aparecer la terminal. Ejecuta `cat README.txt` y después `mission continuar`.
2. Desde **Pausa**, comprueba las partidas guardadas, las prácticas y Exchange. Vincula una cuenta de Historia si quieres recuperar ese progreso desde otro navegador.
3. Vuelve al menú y entra en **Multijugador PvP**. Crea tu computadora personal. Abre el Atlas y elige una capital.
4. En otro navegador o dispositivo entra a PvP y crea un equipo diferente en esa misma capital. Ambos deben verse en **Panel de arena**.
5. Desde el primer equipo abre un enlace virtual TCP/80 al segundo. Cambia de capital desde el Atlas y comprueba el cierre del enlace en la otra sesión.

## Actualizar y consultar el estado

Después de actualizar el código en la misma instalación, ejecuta `node scripts/server.mjs start`. Las partidas y archivos del juego se almacenan en los volúmenes de PostgreSQL del servidor.

```bash
docker compose --env-file .env.server -f docker/docker-compose.server.yml ps
docker compose --env-file .env.server -f docker/docker-compose.server.yml logs --tail=60
```

El archivo de despliegue está en `docker/docker-compose.server.yml`. Las rutas públicas y el HTTPS se configuran en `docker/Caddyfile`.
