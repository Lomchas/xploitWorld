# M6 · Dispositivo persistente y cambio de arena

## Actualización

Inicia PostgreSQL y ejecuta estos comandos desde el `null-protocol` de M6 con los archivos `.env` de tu instalación.

```powershell
pnpm install --frozen-lockfile
pnpm db:setup
pnpm dev
```

La migración `20261111150000_m6_workspace_arenas` crea las arenas piloto, el espacio de trabajo y el registro de enlaces. Conserva tu `DATABASE_URL` para usar tu cuenta y el equipo existente. El logo muestra **M6**.

## Trasladar el dispositivo

1. Abre **Servidores** y elige Bogotá. Los botones + y − ajustan el zoom. Arrastra para desplazar el mapa ampliado o girar el globo. También puedes enfocar el mapa y usar las flechas.
2. Pulsa **Entrar a Bogotá**. En el primer despliegue, elige un alias. Para probar con dos operadores usa dos perfiles de navegador.
3. Vuelve a **Servidores**, elige Tokio y pulsa **Entrar a Tokio**. El equipo conserva saldo, inventario, integridad y configuración. La IPv6 virtual, los jugadores y los eventos corresponden a Tokio. Al volver a Bogotá recuperas los puntos de esa arena.
4. Si el alias está ocupado, la ficha permite escribir otro. Los enlaces de la arena de origen se cierran al trasladar el equipo.

Cada piloto admite 128 equipos residentes. La ocupación cuenta a todos los equipos registrados en esa arena. Los operadores activos se cuentan por separado con la presencia reciente. Un nodo vacío muestra ceros al recibir la telemetría.

## Guardar trabajo

Abre **Historia → Archivos** para crear carpetas, editar notas, importar PNG, JPEG o WebP y guardar el registro de la arena. La terminal usa el mismo directorio.

```text
cd ~/trabajo
mkdir informes
write informes/revision.txt "Portal revisado"
cat informes/revision.txt
chmod 600 informes/revision.txt
```

Los permisos se aplican en las dos interfaces. Una edición concurrente avisa que el archivo cambió. Abre la versión actual antes de guardarla de nuevo. El espacio admite 160 entradas, 16 KiB por nota, 128 KiB de texto total, 2 MiB por imagen y 12 MiB por cuenta. Para recuperar el equipo desde otro navegador, vincula el invitado en **Exchange** e inicia sesión con su clave.

## Comprobar un enlace virtual

1. En **PvP**, selecciona el equipo del segundo operador. Elige TCP/80 y pulsa **Abrir enlace virtual**.
2. En la sesión del segundo operador abre **Dispositivo** y cierra el portal web. El primer operador verá el cierre y su motivo en **Enlaces de tu dispositivo**.
3. Abre el portal y establece otro enlace. Parchea el portal en el segundo equipo. El enlace se cierra durante el reinicio de tres segundos. Después puedes establecer un enlace nuevo al servicio actualizado.
4. Comprueba el mismo efecto con la política de firewall, el aislamiento o el cambio de puerto por TLS.

Los enlaces describen operaciones del motor de juego con equipos registrados en la misma arena. El historial de enlaces y las decisiones de configuración se guardan en PostgreSQL.
