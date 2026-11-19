# Prueba de PvP desde dos equipos

El menú principal, Historia y PvP se alojan juntos siguiendo la [guía del servidor completo](SERVIDOR_COMPLETO.md). Esta guía contiene las comprobaciones de conexión entre los operadores de PvP.

## Enlace gratis para una sesión de prueba

En el computador que ejecuta el juego, abre Docker Desktop. En Windows, instala Cloudflare Tunnel una vez y vuelve a abrir PowerShell. [Descargas de Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/downloads/)

```powershell
winget install --id Cloudflare.cloudflared -e
```

Entra a la carpeta `null-protocol` del ZIP actualizado y ejecuta lo siguiente.

```powershell
pnpm install --frozen-lockfile
pnpm compartir:pvp
```

Abre en ambos computadores la dirección `https://…trycloudflare.com/pvp` que imprime PowerShell. El otro jugador solo necesita el navegador y puede estar en otra red. Deja abiertos PowerShell y Docker Desktop durante la prueba. El enlace cambia al volver a ejecutar el comando. Se crea una base temporal para Arena y sus perfiles se eliminan al terminar la sesión. [Túneles rápidos de Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

Para limitar el enlace a dos personas, puedes usar sus correos como argumentos. El anfitrión también debe estar en la lista si va a jugar desde el enlace. Cada persona verifica el acceso con un código enviado a su correo.

```powershell
pnpm compartir:pvp jugador1@ejemplo.com jugador2@ejemplo.com
```

## Comprobar que los dos jugadores se ven

1. En el primer navegador abre **Elegir arena en el Atlas**, busca **Santo Tomé** y pulsa **Copiar enlace**. Abre ese enlace en el segundo navegador. En ambos pulsa **Desplegar aquí** y crea una computadora con un usuario distinto, por ejemplo `operador-a` y `operador-b`.
2. En ambos equipos abre **Panel de arena**. Cada uno debe ver al otro por su alias en la lista de dispositivos.
3. En A, selecciona el alias de B, elige **TCP/80** en **Puerto del enlace** y pulsa **Abrir enlace virtual**.
4. En **Enlaces de tu dispositivo**, A debe ver **Hacia operador-b · TCP/80** y B debe ver **Desde operador-a · TCP/80**. Ambos deben mostrar **Activo**.
5. En B, vuelve al **Escritorio**, abre **Dispositivo** y cierra **Portal web**. El enlace debe cambiar a **Cerrado** en A sin recargar. Vuelve al **Panel de arena** de B para comprobar su registro.
6. En el Atlas selecciona **Santo Tomé** y mantén **Esta arena** activo. El panel muestra la señal del enlace y su desglose horario. Selecciona **Santiago de Chile** para consultar su actividad. Pulsa **Global** para consultar la actividad de todas las arenas.
7. Vuelve a activar **Portal web** en B y abre otro enlace desde A. En el Atlas de A selecciona **Santiago de Chile** y pulsa **Trasladar mi equipo**. B debe recibir el cierre del enlace y A debe salir de su lista de dispositivos. La ficha de Santiago mostrará el despliegue y los cupos actualizados.

TCP/80 es un puerto simulado dentro del juego. Los dos navegadores intercambian el estado mediante el servidor de Arena.

## Subdominio gratis de Render

Usa esta opción si quieres un enlace que siga funcionando con tu computador apagado. En un repositorio privado de GitHub, sube el contenido de `null-protocol` como raíz del repositorio, con `render.yaml` al lado de `package.json`. Los archivos de entorno locales están excluidos por `.gitignore`. Sube el código fuente, sin `node_modules` ni el ZIP dentro del repositorio.

1. En Render, abre **New → Blueprint** y conecta el repositorio.
2. Selecciona el archivo `render.yaml` y aplica el Blueprint. Crea un servicio web gratuito y una base PostgreSQL gratuita. La conexión de la base y el origen público se toman del despliegue.
3. Cuando la comprobación `/health` marque el servicio como disponible, abre la dirección `https://…onrender.com` del servicio web en ambos equipos. La página inicial abre PvP.

El servicio gratuito de Render se suspende tras 15 minutos sin tráfico y la primera visita puede tardar alrededor de un minuto en reactivarlo. La base gratuita caduca a los 30 días. [Cómo desplegar con Blueprints](https://render.com/docs/infrastructure-as-code) · [Límites del plan gratuito](https://render.com/docs/free)

## Preparar cuentas para el servidor local

Con PostgreSQL de Arena en ejecución y `pnpm db:setup` completado, abre PowerShell desde la raíz.

```powershell
pnpm demo:pvp
```

El comando crea un operador en Sudamérica e imprime el nombre, la clave y las dos direcciones del equipo. Repítelo para obtener dos perfiles. Guarda cada clave en privado. En cada navegador abre **PvP → Recuperar acceso a Arena → Iniciar sesión** e introduce el usuario y su clave de Arena. Desde **Dispositivo** cambia la exposición de un servicio de tu equipo virtual. Comprueba el efecto desde **Panel de arena** en el otro perfil. Desde **Contratos** un operador puede publicar mantenimiento y el otro puede contratarlo para un servicio de su propio equipo.

## Publicación en un servidor propio

Para una prueba en internet, usa un host que controles y un dominio dedicado a PvP. Los dos navegadores abren ese mismo sitio. Los archivos compilados y las rutas `/api`, `/health` y `/ws` comparten su origen.

1. Inicia el backend de Arena con el [perfil de Docker](../SETUP_GUIDE.md#pvp-en-docker) y compila con `pnpm build`, configurando los orígenes de menú, Historia y PvP para sus respectivos dominios.
2. Adapta este ejemplo de Caddy. El proxy sirve `dist/pvp` y reenvía las peticiones de Arena al puerto local 3001.

```caddyfile
pvp.example.com {
    @backend path /api /api/* /health /ws
    handle @backend {
        reverse_proxy 127.0.0.1:3001
    }
    handle {
        root * /srv/xploitworld/apps/frontend/dist/pvp
        try_files {path} /index.html
        file_server
    }
}
```

3. Abre la dirección HTTPS en dos equipos y repite la prueba con los operadores. Revisa `/health` y el estado de conexión en la vista PvP si falla la conexión.

Caddy documenta el proxy WebSocket en <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>.
