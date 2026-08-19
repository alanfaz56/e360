# Dashboard Gerencial — Estación 360

Implementa un Dashboard Gerencial en la aplicación existente.

## REGLAS

1. Antes de modificar código, inspecciona la arquitectura existente.
2. Reutiliza componentes, estilos, permisos, queries, filtros, fechas, moneda y patrones server-side existentes.
3. No agregues librerías si ya existe una solución equivalente.
4. No inventes datos, estados, timestamps ni métricas.
5. Si una métrica no puede calcularse confiablemente con el schema actual, no la implementes; indícalo al final.
6. No hagas queries desde cada componente. Centraliza la obtención de datos server-side según la arquitectura existente.
7. PostgreSQL debe hacer agregaciones cuando sea posible (`COUNT`, `SUM`, `AVG`, `GROUP BY`, etc.).
8. Evita N+1 queries y traer registros completos a JavaScript para agregarlos posteriormente.
9. No uses `Float` para dinero.
10. Controla divisiones entre cero, `NaN`, `Infinity` y gráficas sin datos.
11. No dupliques autorización en frontend.
12. Ejecuta al final lint/typecheck/tests existentes.

---

# 1. Acceso

Ruta objetivo:

`/panel/dashboard`

Si ya existe una ruta equivalente, reutilízala.

Acceso únicamente para roles con permisos de administración/gerencia.

Antes de crear permisos:

- revisar `src/lib/roles.ts`
- revisar `permiso_rol`
- revisar `requirePermission`
- reutilizar el sistema existente

Si se necesita un permiso nuevo, registrarlo siguiendo la arquitectura actual y hacerlo editable por rol desde el administrador de permisos.

---

# 2. Datos

Analiza `schema.prisma` y las relaciones reales antes de implementar.

Entidades relevantes:

- `cita`
- `nota_servicio`
- `cotizacion`
- `cotizacion_concepto`
- `cotizacion_interna`
- `cotizacion_interna_concepto`
- `factura`
- `factura_concepto`
- `pago`
- `producto`
- `inventario_entrada`
- `inventario_capa`
- `inventario_movimiento`
- `solicitud_refaccion`
- `user`
- `taller`
- `nota_transferencia`
- `cliente`
- `unidad`
- `unidad_kilometraje`
- `recordatorio`

No asumas que todos los estados, costos o timestamps existen. Verifica el schema.

---

# 3. UX

El objetivo es que un gerente entienda la situación del taller en <30 segundos.

Prioridad:

1. Dinero
2. Operación
3. Problemas
4. Tendencias
5. Detalle

Desktop primero; tablet/mobile razonables.

Reutiliza el design system existente.

Debe incluir:

- KPI cards
- gráficas
- tablas
- badges/estados
- skeletons
- empty states
- error states

No colocar todas las gráficas al inicio; priorizar información accionable.

---

# 4. Filtros

Header:

- Dashboard
- Hoy
- Esta semana
- Este mes
- Últimos 30 días
- Este año
- Personalizado

Para personalizado:

- fecha desde
- fecha hasta

Filtros opcionales:

- taller
- mecánico
- tipo de trabajo

Todos los módulos deben respetar los mismos filtros.

Cuando sea posible, comparar contra el período anterior equivalente y mostrar `% de variación`.

La lógica de comparación debe considerar que en algunas métricas menor es mejor, por ejemplo:

- tiempo de reparación
- cuentas vencidas
- garantías

---

# 5. KPIs

Implementar cuando los datos permitan calcularlos:

### Ventas
Total vendido/facturado en el período + comparación anterior.

### Utilidad

`ventas - costos`

Costos posibles:

- refacciones/inventario
- cotizaciones internas aprobadas
- costos externos registrados

### Margen %

`utilidad / ventas * 100`

### Trabajos abiertos

`nota_servicio` no entregada/cancelada.

### Ticket promedio

`ventas / trabajos`

### Cuentas por cobrar

`facturas - pagos aplicados`

Separar:

- por vencer
- vencido

---

# 6. Ventas / utilidad

Gráfica temporal agrupada por día/semana según el período.

Series:

- ventas
- costos
- utilidad

Tooltip:

- fecha
- ventas
- costos
- utilidad
- margen %

---

# 7. Operación

Sección `Estado del taller`.

Mostrar estados reales disponibles en el schema:

- recibidas
- diagnóstico
- taller
- listas
- entregadas
- canceladas

Además:

- vehículos actualmente en taller
- listos para entregar
- atrasados
- esperando autorización
- esperando refacción

Para "atrasado", definir una regla explícita basada en datos reales y centralizar el umbral en constantes.

---

# 8. Tiempo de reparación

Calcular únicamente si existen timestamps confiables:

- recepción → entrega
- recepción → diagnóstico
- autorización → trabajo terminado
- terminado → entrega

Mostrar:

- promedio
- mediana si es sencilla
- máximo
- permanencia promedio

No inventar timestamps ni reconstruir eventos inexistentes.

---

# 9. Cotizaciones

Crear funnel basado exclusivamente en estados existentes:

`creadas → enviadas → autorizadas → proceso → completadas → cobradas`

Mostrar cantidad e importe.

KPIs disponibles:

- cotizado
- autorizado
- rechazado
- pendiente
- % autorización

Tabla `Cotizaciones pendientes`:

- folio
- cliente
- unidad
- importe
- estado
- creación
- días pendientes

Ordenar por antigüedad.

---

# 10. Rentabilidad

Por `nota_servicio`, calcular si es posible:

`venta - refacciones - costos internos - costos externos = utilidad`

Mostrar:

- venta
- costo
- utilidad
- margen %

Crear:

### Menor margen
Top 10 por menor margen.

### Mayor utilidad
Top 10 por utilidad absoluta.

El objetivo es detectar trabajos con alta venta pero baja rentabilidad.

---

# 11. Mecánicos

Por mecánico:

- trabajos asignados
- terminados
- abiertos
- tiempo promedio si existe
- venta asociada
- costos
- utilidad

Usar el término **Desempeño operativo**, no "productividad", salvo que existan horas reales trabajadas.

No implementar todavía métricas de:

- horas estimadas
- horas reales
- eficiencia
- horas facturables

Dejar la arquitectura preparada si resulta natural.

---

# 12. Talleres externos

Usar `taller` y `nota_transferencia`.

Mostrar:

- trabajos enviados
- trabajos fuera actualmente
- costo externo
- tiempo fuera
- QA aprobado
- QA con detalles
- QA rechazado

Crear ranking por desempeño.

---

# 13. Inventario

KPIs:

- valor estimado
- productos con existencia
- productos debajo de mínimo
- solicitudes de refacción pendientes
- consumo del período

Gráficas:

### Entradas vs salidas

Agrupar por período.

### Productos más utilizados

Top 10 por cantidad salida.

### Bajo mínimo

Tabla:

- SKU
- producto
- existencia
- mínimo
- diferencia

Agregar alerta visual.

---

# 14. Cuentas por cobrar

Aging:

- por vencer
- 1–30 días
- 31–60
- 61–90
- 90+

Mostrar:

- importe
- número de facturas

Top 10 clientes por deuda:

- cliente
- facturas
- saldo
- vencido
- días de atraso

---

# 15. Clientes

Mostrar:

- activos
- nuevos en período
- recurrentes
- ticket promedio
- ventas por cliente

Tablas:

- Top clientes por venta
- Top clientes por utilidad

No asumir que mayor facturación = mayor rentabilidad.

---

# 16. Vehículos

Usar `unidad` y `unidad_kilometraje`.

Mostrar:

- unidades atendidas
- servicios realizados
- servicios promedio por unidad
- marcas con más servicios

Gráfica:

`Servicios por marca`

Tabla de vehículos con mayor gasto acumulado si puede calcularse correctamente.

---

# 17. Citas

Usar `cita`.

KPIs:

- solicitudes
- confirmadas
- atendidas
- canceladas
- no-show
- conversión cita → nota

Gráfica diaria.

No-show:

`no_asistio / citas_confirmadas`

Controlar división por cero.

---

# 18. Garantías

Usar `nota_servicio.garantiaDeId`.

Mostrar:

- trabajos de garantía
- % de trabajos que regresan como garantía
- costo asociado
- tiempo entre original y garantía

Gráfica mensual.

---

# 19. Alertas gerenciales

Crear sección:

## Requiere atención

Generar únicamente alertas respaldadas por datos reales:

- trabajos demasiado tiempo abiertos
- cotizaciones antiguas sin autorización
- vehículos listos para entregar
- facturas vencidas
- productos bajo mínimo
- solicitudes de refacción pendientes
- vehículos con talleres externos
- garantías recientes
- recordatorios vencidos

Cada alerta:

- severidad
- título
- descripción
- enlace al registro

Ejemplo:

`4 trabajos llevan más de 7 días abiertos → Ver trabajos`

Los umbrales deben estar centralizados en constantes.

No generar alertas arbitrarias.

---

# 20. Arquitectura

No imponer una estructura si el proyecto ya tiene otra.

Conceptualmente, centralizar módulos como:

- resumen
- ventas
- operación
- cotizaciones
- rentabilidad
- inventario
- cobranza
- clientes
- mecánicos
- talleres
- alertas

Funciones conceptuales:

- `getDashboardResumen()`
- `getDashboardVentas()`
- `getDashboardOperacion()`
- `getDashboardCotizaciones()`
- `getDashboardInventario()`
- `getDashboardCobranza()`
- `getDashboardAlertas()`

Adaptarlas a la arquitectura existente.

---

# 21. Performance

Obligatorio:

- agregaciones en PostgreSQL cuando sea posible
- seleccionar únicamente columnas necesarias
- evitar N+1
- reutilizar queries existentes
- revisar índices
- agregar índices únicamente si una query nueva realmente lo requiere

No implementar cache complejo inicialmente.

Primero optimizar queries y validar resultados.

---

# 22. No implementar

No agregar:

- IA/predicciones
- forecasting
- metas automáticas
- tracking de horas
- comisiones
- EBITDA
- depreciación
- contabilidad
- métricas sin datos confiables

---

# 23. Validación

Antes de terminar:

1. Verifica que las métricas coincidan con el schema y estados reales.
2. Verifica filtros.
3. Verifica período anterior.
4. Verifica estados vacíos.
5. Verifica división por cero.
6. Verifica permisos.
7. Verifica queries pesadas.
8. Ejecuta lint.
9. Ejecuta typecheck.
10. Ejecuta tests existentes.

---

# 24. Resultado final

Al terminar reporta únicamente:

- archivos creados
- archivos modificados
- queries nuevas
- permisos nuevos
- índices nuevos
- métricas implementadas
- métricas no implementadas y motivo
- decisiones técnicas importantes
- resultado de lint/typecheck/tests

No describas código que no haya sido implementado.

## PRINCIPIO CENTRAL

Primero entiende el proyecto y los datos existentes. Después implementa.

**No inventes datos. No reinventes arquitectura. No dupliques lógica. Prioriza exactitud, performance y utilidad gerencial.**