# M2 · Mundo multijugador PVP

Cada región es una arena persistente. Al desplegar tu primer dispositivo, eliges el alias y la región. PostgreSQL guarda el equipo, las defensas, la clasificación y el registro privado. El crédito de despliegue se añade a la billetera de tu cuenta.

## Probar con dos jugadores

1. Arranca la aplicación siguiendo la [guía de instalación](../SETUP_GUIDE.md). Abre [Operaciones PVP](http://127.0.0.1:5173/pvp).
2. Abre otra sesión de navegador, por ejemplo una ventana normal y otra privada. Despliega dos alias distintos en Sudamérica. Cada cuenta recibe 20 BTC en su primer despliegue.
3. En el segundo equipo, abre **Defensas** e instala **Sensor IDS**, **Captura de tráfico**, **Laboratorio de análisis** y **Firewall**. Los paquetes consumen 6 puntos de energía cada uno.
4. En el primer equipo, busca la IPv4 o IPv6 del segundo en **Operaciones** y pulsa **Escanear dispositivo**. Lanza una sonda a TCP/80. El equipo atacado pasa de 100 a 66 de integridad y recibe una alerta.
5. En el segundo equipo, abre **Incidentes**. Expande la muestra NPX1 y pulsa **Analizar muestra**. En el filtro **Análisis** aparece la firma NPX-WEB-01 y el parche que corresponde al portal.
6. Vuelve al filtro **Incidentes**. La alerta de sonda permite **Contraatacar** a un puerto del origen identificado. Después usa **Bloquear origen** para colocar una regla de descarte al principio de la cadena. La siguiente sonda de ese origen quedará filtrada.
7. En **Capturas**, abre el flujo TCP/80 de la primera sonda y observa el intercambio SYN, SYN-ACK y ACK. Recarga la página para comprobar que se conservan el saldo, la integridad y la regla.

En Exchange puedes vincular tu perfil y volver al mismo equipo desde otro navegador. Usa Dispositivo para controlar los servicios, parches y TLS.

## Operaciones y defensas

| Mecánica           | Regla del juego                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superficie inicial | Administración TCP/22, portal TCP/80 y DNS UDP/53 abiertos y sin parche.                                                                          |
| Reconocimiento     | Una observación dura cinco minutos. El escaneo muestra puertos abiertos, cerrados o filtrados según el punto de vista del atacante.               |
| Sonda              | Consume 12 de energía y tiene tres segundos de enfriamiento. El servidor vuelve a comprobar las defensas y el servicio al ejecutarla.             |
| Compromiso         | Al llegar a cero de integridad, el equipo pierde acceso a la red hasta repararse. El atacante gana diez puntos de clasificación.                  |
| Firewall           | Primera regla coincidente por origen, transporte y puerto. La política por defecto se aplica al final. Puedes ordenar hasta 12 reglas.            |
| Aislamiento        | El firewall permite separar el equipo de la red. Detiene operaciones de entrada y salida hasta que se retire.                                     |
| Parches            | Cada parche cuesta 4 de energía y neutraliza la sonda de su servicio. Cerrar un servicio también elimina su superficie.                           |
| TLS                | Activa el portal en TCP/443 y cifra los datos observados. La vulnerabilidad de la aplicación se corrige con su parche.                            |
| VPN                | Restringe TCP/22 a pares con confianza mutua. El firewall debe permitir el puerto del túnel UDP/51820 y la administración virtual.                |
| Captura e IDS      | La captura guarda metadatos de flujos. El IDS detecta sondas y reconoce su origen. El registro básico avisa si cae la integridad.                 |
| Ingeniería inversa | El laboratorio verifica SHA-256 y desensambla una muestra NPX1 inerte. La evidencia pertenece al equipo que la registró.                          |
| Respuesta          | Una alerta IDS reciente permite bloquear su origen. Una alerta de sonda permite un contraataque de 14 de energía sujeto a las defensas del rival. |
| Recuperación       | La energía sube un punto cada dos segundos. Reparar cuesta 15 de energía, restaura hasta 40 de integridad y tiene 30 segundos de enfriamiento.    |
| Presencia          | El estado activo refleja actividad reciente. El equipo permanece en la arena cuando cierras la vista, con sus defensas instaladas.                |

En **Terminal**, escribe `help`. Algunos comandos son `scan <IP>`, `exploit <IP> tcp 80`, `pkg install firewall` y `firewall add drop tcp 80`. `peers` muestra los objetivos de la página actual. `alerts` y `rules` muestran los identificadores necesarios para responder a incidentes o cambiar prioridades.

## Implementación y revisión

- El motor acepta identificadores de dispositivos de la misma región. Las direcciones virtuales usan el prefijo de documentación IPv6. Las sondas, muestras, flujos y respuestas se resuelven dentro del modelo del juego.
- El backend obtiene el actor de la sesión autenticada. La respuesta pública expone alias, dirección virtual, presencia y clasificación. El saldo, la configuración y la evidencia salen por la vista privada del dueño.
- Una transacción de PostgreSQL serializa las mutaciones de cada región. El UUID de acción y su huella guardan el resultado para que un reintento tras perder la respuesta devuelva el mismo resultado. El primer despliegue crea el saldo y su asiento inicial juntos.
- WebSocket envía avisos de revisión de estado. La UI vuelve a consultar el estado autenticado y hace una reconciliación periódica al perder la conexión. Las dos instancias pueden observar cambios en la misma base.
- La migración `20261109000000_pvp` agrega tablas y regiones sobre el esquema de M1. Las restricciones de base de datos comprueban la integridad, la energía y el asiento inicial.
- Las pruebas de concurrencia ejecutan solicitudes HTTP paralelas. La comprobación local de base usa una conexión Prisma a PostgreSQL en WebAssembly. El workflow de CI tiene configurada la integración con PostgreSQL 16. La capacidad de producción requiere medición de carga con sus propios límites de conexión y retención de eventos.

### API

| Ruta                           | Operación                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/pvp/state?page=0&q=` | Estado propio, inventario regional paginado, clasificación y hasta 60 eventos recientes.                        |
| `POST /api/pvp/join`           | Recibe `regionId` y `alias`. Devuelve si se aplicó la bonificación de primer ingreso.                           |
| `POST /api/pvp/action`         | Recibe `requestId` y una acción tipada. Aplica efectos en el servidor.                                          |
| `WS /ws`                       | `pvp_watch` y `pvp_unwatch` con payload nulo controlan la suscripción. `pvp_update` avisa de revisiones nuevas. |

## Referencias del modelo

- Prefijo de documentación IPv6. [RFC 3849](https://www.rfc-editor.org/rfc/rfc3849.html)
- Flujos TCP y UDP. [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html) y [RFC 768](https://www.rfc-editor.org/rfc/rfc768.html)
- Política de filtrado. [NIST SP 800-41 Rev. 1](https://csrc.nist.gov/pubs/sp/800/41/r1/final)
- Correlación entre alertas y flujos. [Suricata EVE JSON](https://docs.suricata.io/en/suricata-8.0.0/output/eve/eve-json-format.html)
- Bloqueos de fila. [PostgreSQL 16](https://www.postgresql.org/docs/16/explicit-locking.html)
