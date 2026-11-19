# XploitworlD M6.5

El menú principal abre dos juegos con servidores y guardados propios. **Historia** sigue la investigación de Vanta en la campaña UNO. **PvP** abre tu computadora de Arena con archivos personales, dispositivos, Atlas, herramientas defensivas y contratos.

## Iniciar en Windows

Con Docker Desktop abierto, ejecuta en PowerShell desde `null-protocol`.

```powershell
pnpm install --frozen-lockfile
pnpm jugar
```

Abre <http://127.0.0.1:5173>. Los archivos de configuración local vienen incluidos. Si tienes una partida de M6.4, consulta [Actualizar desde M6.4](SETUP_GUIDE.md#actualizar-desde-m64) antes de abrir los nuevos modos.

## Historia

La primera partida abre **La primera guardia**, una cinemática con voz, subtítulos y transcripción en español o inglés. Pulsa **Iniciar historia con voz**. Al terminar, el juego abre la terminal automáticamente. Desde **Pausa → Partidas guardadas** puedes volver a ver la introducción.

- `cat README.txt` abre el encargo de la guardia.
- `echo "nota.txt"` abre el editor. Ctrl+O guarda y Ctrl+X cierra.
- `mission continuar` retoma el siguiente escenario. `hint` ofrece una pista y `check` entrega la evidencia de campaña.
- En **Pausa → Exchange** están la tienda, el inventario y las recompensas de Historia. El taller abre la misión 1.08. El SSD abre la 5.05 y amplía la capacidad de archivos.
- Los expedientes de práctica, los archivos de trabajo y el progreso se guardan en Historia.

## PvP

Crea un usuario y un nombre de equipo para ver tu escritorio. Las herramientas de defensa vienen instaladas. Desde el escritorio se abren la terminal, los archivos, el Atlas, el dispositivo y los contratos. La terminal opera sobre los archivos de Arena. Escribe `help` para ver las utilidades y `export-log nota.txt` para guardar una copia de la bitácora de tu equipo.

En **Atlas de señales** puedes desplegarte en 208 ubicaciones de capitales y sedes. Usa el mapa o el directorio para ver la hora, el aforo, la actividad y las reglas de cada arena. Filtra por cupos libres y alterna entre la actividad de la capital seleccionada y la global. Puedes pulsar cada barra del gráfico para consultar su desglose horario. Al trasladar tu equipo cambian tu red virtual y los rivales visibles. Consulta el [diseño y las fuentes del Atlas](docs/ATLAS.md).

Los **BTC de Arena** se usan en contratos entre operadores. La plataforma retiene el pago, valida la entrega sobre el activo autorizado y aplica los cambios de mantenimiento o recuperación al equipo del cliente. El operador vincula su cuenta de Arena en **Contratos**. El laboratorio usa simulaciones defensivas y redes virtuales del juego.

Para alojar el menú y ambos modos, sigue la [guía del servidor completo](docs/SERVIDOR_COMPLETO.md). Incluye la configuración automática de las dos bases, HTTPS y la ruta para reemplazar la introducción. La [guía de pruebas PvP](docs/PRUEBAS_REMOTAS.md) documenta la conexión entre operadores.

## Desarrollo y comprobación

```powershell
pnpm check
```

La compilación genera tres sitios en `apps/frontend/dist`. Consulta la [guía de instalación y despliegue](SETUP_GUIDE.md) para arrancar cada modo de forma independiente, migrar una partida y ejecutar las pruebas con PostgreSQL.

El código mantiene la declaración de licencia privada del proyecto original. La [ficha de la cinemática](docs/CINEMATICA_VANTA.md) documenta las voces y los archivos incluidos.
