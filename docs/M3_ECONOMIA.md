# M3 · Economía de Exchange

M2 acredita 420 BTC del juego a cada primer perfil de PVP. En M3, el capital sirve para elegir una especialidad y asumir costos de operación. Los precios de este documento son hipótesis de balance para probar con jugadores.

## Disponibilidad

La entrega M5 incluye la tienda, inventario, recompensas y mercado. Los artículos disponibles y sus efectos están descritos en el catálogo de la aplicación y en el [recorrido de M5](M5_OPERACIONES.md). La siguiente tabla conserva hipótesis de balance y ampliaciones para iteraciones posteriores.

## Qué comprar y por qué

| Artículo                      | Precio inicial en BTC de juego | Ventaja propuesta                                                                                       |
| ----------------------------- | -----------------------------: | ------------------------------------------------------------------------------------------------------- |
| CPU de operaciones            |                             85 | Reduce un 10% el enfriamiento de las sondas. Límite de una mejora activa.                               |
| Memoria táctica               |                             65 | Amplía la capacidad de herramientas avanzadas equipadas cuando se introduzcan los espacios de equipo.   |
| SSD de evidencia              |                             45 | Retiene más capturas y permite comparar incidentes antiguos con los recientes.                          |
| Escáner de firmas avanzado    |                             75 | Añade correlación de banners observados y reduce el costo de reconocimiento de 3 a 2 puntos de energía. |
| Sensor IDS avanzado           |              55 por siete días | Agrupa alertas repetidas y clasifica firmas conocidas por campaña.                                      |
| Laboratorio NPX Pro           |                             70 | Compara dos muestras y muestra instrucciones que cambiaron entre variantes.                             |
| Módulo de recuperación        |                   20 por carga | Recupera integridad más rápido tras un incidente, con enfriamiento compartido con la reparación.        |
| Taller de análisis avanzado   |                          25–40 | Desbloquea ejercicios prácticos de tráfico, análisis de binarios y respuesta a incidentes.              |
| Identidad visual del operador |                          10–30 | Personaliza el equipo y el perfil, sin efecto en el combate.                                            |

Las herramientas básicas de M2 ofrecen el ciclo completo de protección y respuesta. Los artículos avanzados compran tiempo, capacidad, comodidad o contenido especializado. Cada mejora necesita un límite de acumulación y una contramedida para que un jugador nuevo pueda competir con preparación.

Con un presupuesto de 420, una configuración de investigación puede comprar CPU (85), laboratorio (70), SSD (45), licencia de IDS (55), taller (35) y una carga de recuperación (20). Gasta **310** y conserva **110** para experimentar con otras herramientas.

## Fuentes y costos recurrentes

- **Contratos de práctica:** recompensas de 8–20 BTC por objetivos verificables, como reconstruir un flujo o corregir un servicio vulnerable.
- **Desafíos defensivos:** recompensa por contener un incidente válido, aplicar una mitigación y comprobar que el servicio mantiene su disponibilidad.
- **PVP:** recompensas por objetivos con adversarios distintos, con tope diario provisional de 60 BTC. Evita premiar una secuencia repetida entre los mismos equipos y separa las recompensas de la clasificación.
- **Gastos:** licencias temporales, consumibles, talleres, mejoras y una comisión inicial del 2% sobre intercambios completados.
- **Recuperación:** la reparación básica y los contratos gratuitos proporcionan una vía para volver a operar si se agota el saldo.

## Cómo construir el intercambio

1. Vincular el invitado a una cuenta recuperable y mostrar saldo y movimientos. Entregado en M3.1. Para habilitar transferencias se añade la comprobación de elegibilidad del bono por cuenta.
2. Crear inventario, catálogo de precios y compras en tienda. Cobrar, entregar el artículo y registrar los asientos en una sola transacción, con reintentos deduplicados.
3. Crear contratos verificables y medir créditos emitidos y gastos por categoría. Las recompensas pueden empezar con límites por identidad y por pareja de rivales.
4. Abrir listados entre jugadores. Reservar el artículo al publicar la oferta y liberar la reserva al cancelar. Liquidar el precio, la comisión y la transferencia del artículo en la misma transacción.
5. Ajustar precios según saldos medianos, tiempo hasta la primera compra, abandono por saldo bajo y rendimiento de cada configuración.

El valor de una unidad sale de lo que permite comprar en el juego. El sistema usa unidades enteras equivalentes a satoshis de simulación y mantiene un historial de movimientos con referencias únicas. La economía se valida con escenarios de compra simultánea, saldo insuficiente, cancelación, comisiones y recompensas repetidas.
