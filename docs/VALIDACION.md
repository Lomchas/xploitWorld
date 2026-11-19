# Validación de M2

La comprobación se ejecutó el 9 de noviembre de 2026 en Linux con Node.js 24.22.1 y pnpm 9.15.9.

| Comprobación                                                  | Resultado                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ESLint, TypeScript y build de los tres paquetes               | Aprobados                                                                                                  |
| Pruebas unitarias de contratos compartidos                    | 25 aprobadas                                                                                               |
| Pruebas unitarias de backend                                  | 29 aprobadas                                                                                               |
| Pruebas unitarias de frontend                                 | 26 aprobadas                                                                                               |
| Integración de Historia, sesiones, HTTP y WebSocket           | 15 aprobadas                                                                                               |
| Integración de M2 con clientes autenticados en dos instancias | 8 aprobadas                                                                                                |
| Recorrido de navegador en desarrollo y preview compilado      | Aprobado en dos procesos Chromium independientes                                                           |
| Diseño a 1440 × 1000 y 390 × 844                              | Las vistas comprobadas caben sin desbordamiento horizontal                                                 |
| Arranque en frío desde `pnpm dev`                             | Compiló los contratos, inició frontend y backend y desplegó un equipo                                      |
| Actualización de M1 a M2                                      | Prisma aplicó la migración, conservó el progreso de Historia y detectó que ya estaba aplicada al repetirla |

**103 pruebas automatizadas aprobadas**, además de la comprobación de navegador, el arranque en frío y la prueba de migración.

## Casos revisados

- **Identidad y saldo.** Las dos solicitudes simultáneas de primer ingreso produjeron un solo dispositivo y un solo asiento de 420 BTC. El cliente recibe un DTO público de los rivales con sus alias y direcciones virtuales.
- **Autorización.** Se rechazaron destinos externos, el propio dispositivo, objetivos de otra región, evidencia ajena, evidencia vencida y campos que intentaban cambiar el saldo.
- **Resolución de combate.** Se verificaron daño y compromiso, contador de clasificación, enfriamiento, filtrado por reglas en orden, aislamiento, reparación, TLS, VPN y parches.
- **Evidencia.** Se verificó la firma NPX, el intercambio TCP, los flujos UDP y cifrados, la alerta de origen y el contraataque. El otro jugador vio las revisiones por WebSocket.
- **Consistencia.** Se perdió deliberadamente la respuesta de una sonda ya confirmada. Reintentar conservó el mismo UUID, recuperó el resultado y dejó un solo impacto y un solo recibo.
- **Persistencia.** Recargar la página conservó el equipo, la integridad, el saldo y la regla del firewall. La migración se probó también con el primer reto de Historia ya completado.
- **Arranque.** La primera prueba en frío detectó una recompilación duplicada del paquete compartido que reiniciaba el backend. El build incremental compartido eliminó el reinicio. La segunda prueba en frío desplegó el equipo mediante la ruta habitual.

La base temporal de comprobación usa PostgreSQL compilado a WebAssembly mediante PGlite, por TCP y con una conexión Prisma. Las solicitudes HTTP simultáneas probaron la deduplicación del flujo. El CI está preparado con PostgreSQL 16 para repetir las suites en una base nativa. El despliegue público y su capacidad bajo carga requieren una comprobación en el entorno de producción.

## Repetir las pruebas

```bash
pnpm prisma:generate
pnpm check
```

Con PostgreSQL de desarrollo y permisos para crear esquemas, en PowerShell:

```powershell
$env:NODE_ENV = "test"
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/nullprotocol"
pnpm test:integration
Remove-Item Env:NODE_ENV
Remove-Item Env:TEST_DATABASE_URL
```

La suite crea esquemas temporales separados y aplica todas las migraciones rastreadas. [Recorrido manual de M2](M2_PVP.md)
