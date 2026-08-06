# Prompt: Create taller registry

Your task is to create a landing page for talleres to apply to be certified estacion 360 partners; this will be manually checked by estacion 360 gerente or admin. 

A taller can have sucursales with its own contact person. 


---

# ✅ COMPLETADO — 2026-08-05

## Lo que se construyó

- **`/talleres`** — landing pública con beneficios, requisitos y formulario, detrás de Turnstile.
  `<noscript>` con teléfono y WhatsApp. `/talleres/gracias` tras enviar (POST → redirect → GET).
- **Revisión manual por Gerente o Admin** — permiso `taller:review`. La cola se anuncia sola en
  `/panel/talleres` y cada solicitud se aprueba o se rechaza desde un cajón. **Un rechazo exige
  motivo**, porque es lo que se le explica al taller.
- **Sucursales con su propio responsable** — `taller_sucursal` con nombre, dirección, ciudad,
  teléfono y contacto (nombre, puesto, teléfono, correo). La matriz es una sucursal más
  (`esPrincipal`), con índice único parcial que impide dos matrices vivas.

## Decisiones

- **La certificación es un estado del registro, no una tabla aparte.** Aprobar es un cambio de
  estado, no una copia entre dos tablas que pueden terminar en desacuerdo.
- **Sólo un taller `aprobado` puede recibir una unidad**, verificado en `transferirNota` — en la
  escritura, no en qué opciones se pintaron.
- **`taller:review` no es `taller:read`.** El Operador elige a qué taller mandar un camión; quién se
  certifica es una decisión comercial y la solicitud trae el RFC y las notas privadas de la revisión.
  El filtro se aplica en la consulta: sin el permiso, `?estado=solicitado` sigue devolviendo el
  registro certificado.
- La solicitud pública se arma **campo por campo desde una lista blanca**, forzando
  `origen`/`estado`. Un `{"estado":"aprobado"}` en el body no certifica a nadie (verificado).
- La solicitud le llega como **aviso** a Admin y Gerente (integrado con issue-1).

## Archivos

`src/lib/talleres.ts` · `src/lib/server/talleres.ts` · `/talleres` + `/talleres/gracias` ·
`/panel/talleres` · `/api/talleres/solicitudes` · `/api/talleres/[id]/revision` ·
`/api/talleres/[id]/sucursales` · `/api/sucursales/[id]` · migración compartida con issue-1 ·
enlace en el pie de la landing.

## Verificación

Cubierto por las 37 pruebas e2e y las 16 contra la base: alta anónima, anti-duplicado por teléfono,
Turnstile obligatorio, quién ve la cola, quién aprueba, rechazo sin motivo, promoción de matriz.
