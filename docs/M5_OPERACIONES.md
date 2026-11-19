# XploitworlD M5 · Recorrido de la entrega

## Actualización

Esta entrega incorpora la migración aditiva 20261109220000_exchange_observatory_services. La inicial 20261105181806_initial_schema y la de PvP 20261109000000_pvp conservan sus archivos y checksums. Usa el mismo DATABASE_URL para conservar operadores, equipos, saldo y progreso. El seed actualiza las misiones por slug y añade los capítulos 2 y 3.

## Exchange

1. Vincula tu cuenta en Exchange y despliega un dispositivo en PvP.
2. Compra en Tienda y prueba el artículo en Inventario. Equipar CPU, escáner y SSD cambia el enfriamiento, el costo de escaneo y la ventana de registros. La carga restaura integridad y el chasis aparece en Dispositivo. Los talleres se leen desde el inventario.
3. Completa objetivos en Historia o PvP y consulta Recompensas. La arena acredita 20 BTC por rival elegible y día UTC, con un máximo de 60 BTC por día. Repetir un objetivo ya acreditado conserva el asiento original.
4. Completa el tutorial para publicar un artículo disponible o comprarle a otro operador. Publicar reserva el artículo. Cancelar lo devuelve. Al vender, el comprador recibe el artículo y el vendedor recibe el importe menos la comisión del 2%.

Los BTC representan saldo interno. Cada mutación usa enteros en satoshis y un recibo por solicitud. Si una conexión falla, el botón de reintento reutiliza el mismo identificador. La liquidación se registra en los movimientos de ambas partes.

## Servicios

1. En Exchange, selecciona Servicios y guarda tu perfil de comerciante.
2. Publica una especialidad con precio y plazo de 1 a 168 horas. Un cliente contrata con los términos que ve en la oferta. El importe sale de su saldo disponible y queda reservado.
3. Para auditar, comparte arena con el cliente, escanea la IP virtual que figura en el contrato y vuelve a Servicios. Usa Actualizar y elige la evidencia. Las demás especialidades piden una prueba propia de análisis NPX, reparación o configuración en la arena. El servidor comprueba que la operación corresponda al comerciante, al tipo de servicio y al plazo, y que la evidencia siga sin entregar.
4. El cliente revisa la evidencia, libera el pago y califica, o abre una disputa. El comerciante puede reembolsar. Si vence el plazo antes de entregar, el cliente puede pedir devolución. Tras 48 horas de una entrega sin respuesta, el comerciante puede abrir una disputa.
5. El administrador del entorno puede liquidar una disputa activa desde el servidor. Sustituye el identificador, la decisión y el motivo.

```powershell
pnpm resolve:dispute ID_DEL_CONTRATO refund "Evidencia insuficiente"
pnpm resolve:dispute ID_DEL_CONTRATO pay "Evidencia verificada"
```

Cada parte ve reserva, entrega, disputa y resolución en su historial. Las auditorías revisan el equipo del cliente. Las otras especialidades entregan el resultado de una prueba del comerciante dentro de XploitworlD.

## Atlas e Historia

**Servidores** abre el Atlas plano de la referencia. El selector cambia a un globo con inclinación y rotación pausables. Puedes elegir una región o nodo con ratón, toque o teclado. La vista consulta al servidor cada ocho segundos. Las gráficas cuentan escaneos, sondas y compromisos de las últimas doce horas. El ranking usa las puntuaciones persistidas de PvP. Las trazas confirmadas se mantienen dentro de su arena, y el ejercicio interregional tiene una leyenda propia.

El mapa deriva de los datos vectoriales de dominio público de [Natural Earth 1:110m](https://www.naturalearthdata.com/about/terms-of-use/). La representación agrupa las costas para las regiones jugables y simplifica su geometría.

En Historia, completa el tutorial y abre cada capítulo con mission y el identificador que muestra levels.

- **Chapter 1 · La ciudad borrada.** La señal de ECO-7 apunta al lote 017.
- **Chapter 2 · El Mercado Cero.** Tu identidad figura en dos pujas. Los recibos contradicen la versión del vendedor.
- **Chapter 3 · Protocolo de Olvido.** Un manifiesto preservado por el archivista permite atribuir la orden y restaurar la ruta a Vanta.
