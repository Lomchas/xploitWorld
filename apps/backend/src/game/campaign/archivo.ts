import { signed, type Scene } from "./scene";

export const ARCHIVO = {
  "4.01": {
    opening:
      "La junta responde al informe de la cohorte y habilita una lectura de auditoría. El acceso caduca al cerrar el expediente. ECO-7: Lee la autorización antes de entrar.",
    task: "Comprueba tu identidad y el alcance con sudo -l. Lee la resolución delegada y registra número, rol y restricción.",
    files: {
      "auditoria/resolucion.txt":
        "AUD-35 · Rol: archivista · Lectura de auditoría · Copia local de solo lectura.",
    },
    delegated: "auditoria/resolucion.txt",
    commands: ["id", "sudo -l", "sudo cat auditoria/resolucion.txt"],
    note: ["AUD-35", "archivista", "solo lectura"],
    hint: "Ejecuta sudo -l. La única lectura delegada es sudo cat auditoria/resolucion.txt.",
    ending:
      "La resolución muestra la primera guardia del Core. El mismo nombre ha firmado turnos durante 35 años.",
  },
  "4.02": {
    opening:
      "En la foto de la primera guardia, el director sostiene una cinta de respaldo. Treinta y cinco años después, la misma firma aparece junto al número CONT-35.",
    task: "Busca CONT-35 en el registro de facultades y lee el acta de ejecución. Entrega el cargo que podía activar la cláusula.",
    files: {
      "facultades.log":
        "Año 01 · Primera guardia · Elías Varela · archivista\nCONT-35 · director de seguridad · facultad de activación\nAUD-35 · junta de revisión · lectura",
      "ejecucion.txt":
        "Bruma · operador del encargo de ruta. La autorización de activación se conserva en Vértice.",
    },
    commands: ["grep -n CONT-35 facultades.log", "cat ejecucion.txt"],
    answer: "director de seguridad",
    hint: "El registro diferencia a quien podía activar el proceso del contratista que ejecutó el encargo.",
    ending:
      "El puesto de Varela tenía la facultad. Para llegar al registro de la orden hay que revisar las dependencias del equipo de guardia.",
  },
  "4.03": {
    opening:
      "Una sede temporal comparte el acceso de invitados con la radio de guardia. Durante el corte se registró un equipo fuera del inventario aprobado.",
    task: "Cruza los tres resúmenes de auditoría WiFi. Identifica el activo discrepante y guarda qué red debe quedar segmentada.",
    files: {
      "kismet.txt":
        "Inventario radio · RADIO-01 aprobado · INV-EXT detectado fuera de inventario",
      "aircrack-informe.txt":
        "Resumen de captura sintética · INV-EXT pertenece al segmento invitados de la sede temporal.",
      "bettercap-informe.txt":
        "Resumen de aislamiento · el segmento invitados comparte la zona de guardia · control: segmentar invitados.",
    },
    commands: [
      "cat kismet.txt",
      "cat aircrack-informe.txt",
      "cat bettercap-informe.txt",
    ],
    note: ["INV-EXT", "segmentar", "invitados"],
    hint: "El nombre discrepante se repite en la captura. Registra la separación del segmento de invitados.",
    ending:
      "La radio queda registrada como dependencia crítica. El directorio revela otra conexión inesperada, esta vez entre grupos.",
  },
  "4.04": {
    opening:
      "Soporte puede leer el manual de Vértice. En el mapa de identidad aparece una ruta indirecta que también le concede administración.",
    task: "Lee el grafo y los dos inventarios. Entrega el nombre del grupo heredado que concede a soporte facultades de administración.",
    files: {
      "bloodhound.txt":
        "Grafo sintético · soporte → turno-infra → admin-archivo",
      "impacket-inventario.txt":
        "Recursos del ejercicio: manuales · lectura por soporte\nAdministración: cambios de directorio",
      "cme-informe.txt":
        "Permiso efectivo · soporte puede administrar por pertenencia heredada a turno-infra",
    },
    commands: [
      "cat bloodhound.txt",
      "cat impacket-inventario.txt",
      "cat cme-informe.txt",
    ],
    answer: "turno-infra",
    hint: "El grupo intermedio conecta soporte con admin-archivo.",
    ending:
      "El equipo puede eliminar la herencia y conservar la tarea para la cual existe el grupo de soporte.",
  },
  "4.05": {
    opening:
      "La estación necesita que soporte consulte manuales durante el turno. Retirar el grupo completo dejaría a la guardia sin procedimientos de recuperación.",
    task: "Ajusta soporte y prueba lectura de manuales y administración. Conserva disponible la tarea autorizada.",
    files: {
      "soporte.txt":
        "Soporte: leer manuales · los cambios de administración corresponden a la junta.",
    },
    control: {
      name: "soporte",
      initial: "heredado",
      final: "manuales",
      outcomes: {
        heredado: { manuales: "Permitido", administracion: "Permitida" },
        revocado: { manuales: "Denegado", administracion: "Denegada" },
        manuales: { manuales: "Permitido", administracion: "Denegada" },
      },
      checks: [
        ["manuales", "manuales"],
        ["manuales", "administracion"],
      ],
    },
    hint: "Con set soporte manuales conservas solo la lectura de procedimientos.",
    ending:
      "Soporte conserva su trabajo. Uno de sus tickets describe un cambio programado para la misma noche que el borrado.",
  },
  "4.06": {
    opening:
      "La agenda registra un reinicio programado. Varela lo cita para explicar el corte. Los tickets conservan componentes y horarios.",
    task: "Compara el cambio aprobado y la orden. Registra la referencia de cada uno y qué diferencia su alcance.",
    files: {
      "cambios.txt":
        "CHG-208 · 03:00Z · catálogo · reinicio de mantenimiento · aprobado por guardia",
      "orden.txt":
        "CONT-35 · 00:17Z · índice de ciudades · orden de continuidad · aprobación local pendiente",
    },
    commands: ["cat cambios.txt", "cat orden.txt"],
    note: ["CHG-208", "CONT-35", "catálogo", "índice de ciudades"],
    hint: "Comprueba también las ventanas. El reinicio del catálogo y el cambio del índice son eventos distintos.",
    ending:
      "El cambio aprobado no cubría el índice. Un agente que nunca pasó por el repositorio aparece en el inventario de esa ventana.",
  },
  "4.07": {
    opening:
      "El laboratorio te entrega una ficha de análisis estático de un agente de inventario. El nombre coincide con un paquete oficial, pero su origen no.",
    task: "Lee la ficha de Ghidra y verifica el paquete archivado. Entrega el repositorio de origen registrado en la ficha.",
    files: {
      "ghidra.txt":
        "Vista de metadatos · agente-v3 · módulo asociación de índice · origen: spool-emergencia",
      ...signed(
        "agente.txt",
        "AGENTE-V3 · manifestación de auditoría · spool-emergencia\n",
        "agente.sha256",
      ),
    },
    commands: ["cat ghidra.txt", "sha256sum -c agente.sha256"],
    answer: "spool-emergencia",
    hint: "El informe estático registra el origen. El manifiesto verifica que trabajas sobre la copia sellada.",
    ending:
      "El paquete salió del canal de emergencia. La cohorte encuentra un informe de continuidad prellenado con sus nombres.",
  },
  "4.08": {
    opening:
      "El borrador está fechado antes de tu llegada a UNO. Varela ya dejó una línea para que tu cohorte firme que la recuperación exige un único operador.",
    task: "Lee el acta y el expediente de Vanta. Guarda una objeción sustentada con la cláusula, la alternativa de revisión y la prueba disponible.",
    files: {
      "continuidad.txt":
        "CONT-35 · La junta concede control exclusivo si el diagnóstico independiente declara un operador único.",
      "vanta.txt":
        "La ruta se recuperó desde NORTE-02 con revisión independiente de guardia. Hay un proceso de recuperación que puede verificarse por separado.",
    },
    commands: ["cat continuidad.txt", "cat vanta.txt"],
    note: ["CONT-35", "revisión independiente", "NORTE-02"],
    hint: "La restauración del Norte aporta una razón concreta para pedir revisión independiente.",
    ending:
      "La junta suspende la firma del borrador. El anexo remite a la identidad de operador del director.",
  },
  "4.09": {
    opening:
      "La ficha de Varela contiene solo el formato de su alias de guardia. El valor completo se conserva fuera de la red de la sede.",
    task: "Lee el formato del registro. Entrega el sufijo tal como se escribe en una cuenta.",
    files: {
      "formato.txt":
        "Registro de identidades\nConservar la letra inicial mayúscula.\nLa marca D_ de cabecera se registra como d_.\nLa equivalencia del carácter intermedio está archivada en Vértice.",
    },
    commands: ["cat formato.txt"],
    answer: "d_",
    hint: "El sufijo se escribe en minúscula y conserva el guion bajo.",
    ending:
      "Ya conoces la primera letra y el sufijo. Para el carácter intermedio necesitas llegar al archivo de Vértice.",
  },
  "4.10": {
    opening:
      "El mapa de auditoría sitúa la estación detrás del muro de hielo de la Antártida. En la fotografía del traslado, la consola de guardia todavía muestra la marca de la cabecera.",
    task: "Comprueba la huella del anexo y léelo. Entrega el nombre de la estación autorizada para la investigación.",
    files: {
      ...signed(
        "anexo.txt",
        "Estación Vértice · Antártida · Core cuántico · acceso concedido solo a réplica de auditoría\n",
        "anexo.sha256",
      ),
    },
    commands: ["sha256sum -c anexo.sha256", "cat anexo.txt"],
    answer: "Vértice",
    hint: "Verifica anexo.sha256 desde ~. El anexo indica tanto el lugar como el alcance del acceso.",
    ending:
      "La cohorte llega a Vértice. Antes de bajar a la réplica, una voz en el ascensor repite el mensaje que Alma dejó en el lote 017.",
  },
} satisfies Record<string, Scene>;
