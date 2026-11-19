import { signed, type Scene } from "./scene";

export const HIELO = {
  "5.01": {
    opening:
      "Vértice · 03:08. El Core conserva millones de asociaciones entre huéspedes y ciudades. La cohorte recibe una réplica y una autorización con un límite preciso.",
    task: "Lee la autorización. Documenta el alcance, quién revisa el trabajo y cuándo debe detenerse la prueba.",
    files: {
      "replica.txt":
        "VERT-05 · Alcance: réplica de auditoría · Revisa: junta de guardia · Interrupción: canal de coordinación indisponible.",
    },
    commands: ["cat replica.txt"],
    note: [
      "VERT-05",
      "réplica de auditoría",
      "junta de guardia",
      "canal de coordinación",
    ],
    hint: "Incluye la condición de interrupción. El permiso cubre la réplica.",
    ending:
      "La guardia abre la copia. Bogotá y Tokio conservan segmentos distintos de la última noche.",
  },
  "5.02": {
    opening:
      "En el mapa de Vértice, Bogotá confirma un acuse que Tokio registró seis minutos después. Alma pregunta cuándo podrá volver a usar su voz.",
    task: "Compara los registros. Convierte sus horas a UTC y registra cuál copia conserva el acuse más cercano al corte.",
    files: {
      "bogota.log": "19:16 UTC-05:00 · acuse VANTA-016 · copia completa",
      "tokio.log":
        "09:22 UTC+09:00 · acuse VANTA-016 · réplica recibida con demora",
    },
    commands: ["cat bogota.log", "cat tokio.log"],
    note: ["Bogotá", "00:16", "Tokio", "00:22"],
    hint: "Suma cinco horas a Bogotá y resta nueve a Tokio. El acuse original se registró a las 00:16 UTC.",
    ending:
      "El retraso queda documentado. La secundaria espejos se abre con la decisión de qué copia usar. El índice principal ya muestra perfiles huérfanos.",
  },
  "5.03": {
    opening:
      "Las voces de Vanta siguen en las copias. El directorio perdió la relación entre ciudad y huésped. A Alma le quedó una ficha válida sin dirección.",
    task: "Lee la muestra aprobada. Guarda los dos identificadores autorizados y qué debe validarse al recuperar sus asociaciones.",
    files: {
      "muestra.txt":
        "Muestra aprobada: AL-017 y VE-021 · comprobar asociación, identidad y acceso. VE-023 fuera de alcance.",
    },
    commands: ["cat muestra.txt"],
    note: ["AL-017", "VE-021", "asociación", "identidad", "acceso"],
    hint: "Trabaja con las dos fichas que autorizó la guardia. El tercer identificador queda fuera del informe de prueba.",
    ending:
      "El equipo ya sabe qué debe volver. Una imagen de memoria conserva el último proceso asociado con la orden.",
  },
  "5.04": {
    opening:
      "A las 00:17, la captura de memoria registra un proceso que no figura en el inventario de Vértice. La vista de Volatility conserva su nombre y padre.",
    task: "Consulta el inventario y la vista de procesos. Entrega el identificador del proceso ausente del inventario.",
    files: {
      "inventario.txt":
        "Procesos aprobados: core-watch, replica-sync, audit-log",
      "volatility.txt":
        "Vista sintética · 041 core-watch · 090 audit-log · 311 index-relevo (padre core-watch)",
    },
    commands: ["cat inventario.txt", "cat volatility.txt"],
    answer: "311",
    hint: "El número que precede a index-relevo corresponde al proceso que requiere revisión.",
    ending:
      "El proceso queda en la cronología como hipótesis. Falta comprobar qué orden recibió.",
  },
  "5.05": {
    opening:
      "Dos exportaciones dicen contener la misma orden. La de la junta está sellada. La que llegó por correo lleva el mismo nombre y otro contenido.",
    task: "Verifica el sello de la copia de trabajo y guarda original, copia, custodio y estado de integridad.",
    files: {
      ...signed(
        "orden-copia.txt",
        "COPIA-V17 · Original VERT-017 · Custodio junta de guardia\n",
        "orden.sha256",
      ),
      "registro.txt":
        "VERT-017 · original sellado · junta de guardia · COPIA-V17 para análisis",
    },
    commands: ["sha256sum -c orden.sha256", "cat registro.txt"],
    note: ["VERT-017", "COPIA-V17", "junta de guardia", "OK"],
    hint: "El registro identifica el original. La verificación corresponde a la copia que analizas.",
    ending:
      "La copia validada revela una segunda orden en cola. La réplica que conserva a los huéspedes aún puede recibirla.",
  },
  "5.06": {
    opening:
      "El Core anuncia una nueva ejecución en la réplica. La junta necesita cortar el flujo afectado manteniendo abierto el canal de guardia.",
    task: "Elige la contención de la réplica. Comprueba la orden pendiente y el canal de coordinación después del cambio.",
    files: {
      "segmentos.txt":
        "Segmentos: réplica y coordinación. Contención autorizada: separar la réplica.",
    },
    control: {
      name: "segmento",
      initial: "abierto",
      final: "aislado",
      outcomes: {
        abierto: { orden: "En cola", guardia: "Canal disponible" },
        apagado: { orden: "Interrumpida", guardia: "Canal indisponible" },
        aislado: { orden: "Contenida", guardia: "Canal disponible" },
      },
      checks: [
        ["aislado", "orden"],
        ["aislado", "guardia"],
      ],
    },
    hint: "Aísla la réplica con set segmento aislado. Un apagado general también interrumpe el canal.",
    ending:
      "La orden queda contenida. Operaciones libera una copia para verificar la corrección del servicio.",
  },
  "5.07": {
    opening:
      "La guardia tiene un aviso de la revisión de parches y un informe de verificación de la réplica. El cambio debe preservar la consulta autorizada.",
    task: "Lee los dos informes y aplica el parche del caso. Comprueba la validación y la consulta de aceptación.",
    files: {
      "searchsploit-aviso.txt":
        "Aviso ficticio UNO-P17 · la validación de la orden requiere el parche aprobado de Vértice.",
      "metasploit-informe.txt":
        "Informe de verificación archivado · versión aprobada P17 · comprobar validación de orden y consulta de fichas.",
    },
    commands: ["cat searchsploit-aviso.txt", "cat metasploit-informe.txt"],
    control: {
      name: "parche",
      initial: "previo",
      final: "p17",
      outcomes: {
        previo: { validacion: "Pendiente", consulta: "Disponible" },
        p17: {
          validacion: "Orden de prueba rechazada",
          consulta: "Consulta autorizada disponible",
        },
        cierre: { validacion: "Servicio cerrado", consulta: "Indisponible" },
      },
      checks: [
        ["p17", "validacion"],
        ["p17", "consulta"],
      ],
    },
    hint: "P17 conserva la consulta y valida la orden. Prueba ambas cosas antes de entregar.",
    ending:
      "La réplica pasa las dos verificaciones. Ahora toca elegir qué respaldo puede recuperar más huéspedes dentro de la ventana.",
  },
  "5.08": {
    opening:
      "Operaciones calcula que puedes perder como máximo cuatro minutos de cambios y que tienes doce minutos para recuperar la muestra. Hay dos respaldos utilizables.",
    task: "Lee las métricas de los respaldos. Selecciona el que cumple ambos objetivos y verifica la muestra y el tiempo.",
    files: {
      "respaldos.txt":
        "Objetivos · RPO ≤4 min · RTO ≤12 min\nbase · pérdida 9 min · restauración 7 min\nincremental · pérdida 3 min · restauración 10 min",
    },
    commands: ["cat respaldos.txt"],
    control: {
      name: "respaldo",
      initial: "pendiente",
      final: "incremental",
      outcomes: {
        pendiente: { muestra: "Pendiente", tiempo: "Pendiente" },
        base: { muestra: "Faltan cambios de 9 minutos", tiempo: "7 minutos" },
        incremental: {
          muestra: "AL-017 y VE-021 recuperados",
          tiempo: "10 minutos · pérdida 3 minutos",
        },
      },
      checks: [
        ["incremental", "muestra"],
        ["incremental", "tiempo"],
      ],
    },
    hint: "RPO mide cuántos cambios se pueden perder. RTO limita cuánto puede tardar la recuperación.",
    ending:
      "Los huéspedes de la muestra vuelven a aparecer. La guardia necesita una cronología que explique cómo quedaron fuera.",
  },
  "5.09": {
    opening:
      "La imagen, la memoria y la captura apuntan al mismo intervalo. La junta pide un informe compartible con horas UTC y referencias a las copias de trabajo.",
    task: "Lee las vistas de Autopsy, Volatility y ExifTool. Registra el orden temporal, la copia y el custodio.",
    files: {
      "autopsy.txt": "00:15Z · DISCO-15 · orden en cola · copia COPIA-V17",
      "volatility.txt": "00:17Z · RAM-17 · proceso 311 en ejecución",
      "exiftool.txt":
        "00:18Z · CAP-18 · exportación por junta de guardia · titular omitida de la copia pública",
    },
    commands: ["cat autopsy.txt", "cat volatility.txt", "cat exiftool.txt"],
    note: ["00:15", "00:17", "00:18", "COPIA-V17", "junta de guardia"],
    chronology: ["00:15", "00:17", "00:18"],
    hint: "Usa tres líneas en orden temporal. Conserva la referencia y el custodio en la última.",
    ending:
      "La cronología ya une la orden con el cambio. El archivo de Vértice conserva además la regla que faltaba para leer el alias.",
  },
  "5.10": {
    opening:
      "La auditoría conserva dos acuses independientes para la misma autorización. Varela pide que la cohorte envíe el borrador de continuidad antes de abrir el último expediente.",
    task: "Corrobora la autorización en los dos registros y conserva el mapa de caracteres. Entrega la referencia común.",
    files: {
      "guardia.log":
        "00:15Z CONT-35 · orden preparada · procedencia estación de dirección",
      "core.log": "00:17Z CONT-35 · index-relevo · asociaciones retiradas",
      "caracteres.txt":
        "Tabla de Vértice · glifo CRT con forma de ele del sello · letra del registro: i minúscula",
    },
    commands: [
      "grep -n CONT-35 guardia.log",
      "grep -n CONT-35 core.log",
      "cat caracteres.txt",
    ],
    answer: "CONT-35",
    hint: "La misma referencia aparece antes de la ejecución y en el registro del Core.",
    ending:
      "La orden sale de dirección y llega al Core. La junta pide una demostración de recuperación y el acuse local para atribuir la decisión a una persona.",
  },
} satisfies Record<string, Scene>;
