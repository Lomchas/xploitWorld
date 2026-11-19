import { signed, type Scene } from "./scene";

export const VANTA = {
  "1.01": {
    opening: `[UNO · 00:26] La universidad te envió a tu primera guardia como especialista en formación. La consola de prácticas se apaga. En la siguiente pantalla aparece tu nombre y la firma del director de seguridad.
Varela: A las 00:17 perdimos Vanta. Les doy acceso de archivista al catálogo y al espejo Norte. Si encuentran una orden de emergencia, escálenla a la guardia UNO. Antes del amanecer, por favor.
La credencial acaba de llegar. Todavía tiene el nombre de quien la usó antes.`,
    task: "Lee contrato.txt. Crea ~/trabajo/uno si hace falta y guarda en 1.01.txt el alcance del encargo: los dos activos autorizados y a quién escalar.",
    files: {
      "contrato.txt":
        "Alcance: catálogo Vanta y espejo Norte. Escalamiento: guardia UNO. La credencial autoriza lectura de evidencias y ninguna operación sobre otros nodos.",
    },
    commands: ["cat contrato.txt"],
    note: ["catálogo Vanta", "espejo Norte", "guardia UNO"],
    hint: "Usa mkdir ~/trabajo/uno si hace falta y abre echo ~/trabajo/uno/1.01.txt. Conserva los nombres del contrato en la nota.",
    ending:
      "El encargo queda registrado. La consola acepta tu credencial, pero todavía tienes que comprobar de quién es la sesión.",
  },
  "1.02": {
    opening:
      "La pantalla dice ARCHIVISTA. Varela asegura que es una credencial temporal. ECO-7 deja un mensaje en la cola local: «Una etiqueta no acredita una identidad».",
    task: "Consulta quién ejecuta la terminal, qué identidad efectiva tiene y en qué directorio empieza. Entrega el identificador numérico del usuario virtual.",
    files: {
      "credencial.txt":
        "Rol del caso: archivista. El UID de la sesión local se comprueba con id.",
    },
    commands: ["whoami", "id", "pwd"],
    answer: "1000",
    hint: "whoami, id y pwd responden preguntas distintas. El primer número de id es el UID.",
    ending:
      "A tu sesión se le asigna el expediente de guardia. El catálogo que deberías archivar devuelve una ciudad sin dirección.",
  },
  "1.03": {
    opening:
      "ECO-7: El mapa público y el catálogo cuentan historias distintas. Te pasé el inventario que tomó la guardia antes del corte.",
    task: "Lee las vistas de Nmap y WhatWeb del expediente. Registra el servicio del catálogo, el del espejo y la audiencia de cada uno.",
    files: {
      "nmap.txt":
        "Inventario de laboratorio\nVANTA-CAT · https · público\nNORTE-02 · relay · guardia UNO\nSUR-03 · https · comunicado público",
      "whatweb.txt":
        "VANTA-CAT · catálogo de fichas\nNORTE-02 · relé de estado\nSUR-03 · boletín",
    },
    commands: ["cat nmap.txt", "cat whatweb.txt"],
    note: ["VANTA-CAT", "https", "público", "NORTE-02", "relay", "guardia UNO"],
    hint: "El relé NORTE-02 pertenece a la guardia. El catálogo público es VANTA-CAT. Usa sus identificadores en la nota.",
    ending:
      "VANTA-CAT dejó de publicar fichas. El relé Norte seguía dando señales después de la hora que figura en el comunicado.",
  },
  "1.04": {
    opening:
      "El turno anterior cerró con un aviso de mantenimiento. En el margen de la bitácora alguien anotó que las dos consolas usaban relojes distintos.",
    task: "Busca CORTE en ambas bitácoras. El espejo Sur usa UTC−05:00. Entrega la hora UTC en formato HH:MM.",
    files: {
      "norte.log":
        "00:15Z ESTADO catálogo listo\n00:17Z CORTE VANTA-CAT\n00:18Z RUTA retirada",
      "sur.log":
        "19:16−05 AVISO mantenimiento\n19:17−05 CORTE VANTA-CAT\n19:21−05 ACTA recibida",
    },
    commands: ["grep -n CORTE norte.log", "grep -n CORTE sur.log"],
    answer: "00:17",
    hint: "19:17 con UTC−05:00 corresponde a las 00:17 UTC del día siguiente. Busca la misma marca en el Norte.",
    ending:
      "Las dos fuentes coinciden. El incidente empezó mientras la consola pública todavía anunciaba normalidad.",
  },
  "1.05": {
    opening:
      "El espejo Norte tiene una captura de la última sesión del portal. Entre las líneas se oye una voz que dice «Alma». Guarda únicamente lo que el caso necesita.",
    task: "Compara Wireshark y Tcpdump. Guarda un resumen con el destino, el protocolo y qué parte corresponde al contenido, sin transcribir el mensaje de la huésped.",
    files: {
      "wireshark.txt":
        "Muestra sintética 04 · Destino VANTA-CAT · HTTP\nCabecera: ruta y tipo de documento\nContenido: fragmento de voz bajo custodia",
      "tcpdump.txt":
        "00:16:59Z relay-entrada → VANTA-CAT · HTTP · 832 B\n00:17:01Z relay-entrada → NORTE-02 · estado · 48 B",
    },
    commands: ["cat wireshark.txt", "cat tcpdump.txt"],
    note: ["VANTA-CAT", "HTTP", "contenido"],
    hint: "La ruta, el destino y el tamaño son metadatos. Identifica el fragmento como contenido reservado en la nota.",
    ending:
      "El último visitante salió del portal antes del corte. El relé siguió enviando estado por otra ruta.",
  },
  "1.06": {
    opening:
      "Varela: ¿Se apagó Vanta? Necesito una respuesta antes de hablar con la junta.\nECO-7: Verifica primero qué está vivo.",
    task: "Consulta tu interfaz virtual y el estado archivado. Entrega el identificador del equipo que sigue respondiendo.",
    files: {
      "estado.txt":
        "NORTE-02 · relay · disponible\nVANTA-CAT · catálogo público · sin ruta\nSUR-03 · boletín · disponible",
    },
    commands: ["ip addr", "cat estado.txt"],
    answer: "NORTE-02",
    hint: "La interfaz local está activa. En estado.txt, identifica el relé disponible.",
    ending:
      "Vanta perdió su ruta, pero el relé está vivo. Al recuperar el último mensaje, el nombre de Alma aparece otra vez.",
  },
  "1.07": {
    opening:
      "Alma: El buzón recibe la voz de mi hija. La casa figura como ausente y el portal dice que nunca viví ahí. ¿Tú puedes ver mi dirección?",
    task: "Lee la ficha de reclamación. Guarda una referencia con el número de caso y el canal de devolución. La ficha de voz queda en custodia.",
    files: {
      "alma.txt":
        "Caso AL-017 · titular verificada · canal ECO-7 · contenido reservado. Entrega únicamente referencia y canal.",
    },
    commands: ["cat alma.txt"],
    note: ["AL-017", "ECO-7"],
    hint: "Dos datos bastan: el identificador del caso y el canal de devolución.",
    ending:
      "Alma acepta esperar. ECO-7 abre la ruta secundaria eco-7. Mientras tanto, el espejo Sur envía su propio comunicado.",
  },
  "1.08": {
    opening:
      "La oficina de prensa insiste en que Vanta está en mantenimiento. El aviso parece legítimo. La guardia conservó la huella de lo que salió del emisor.",
    task: "Inspecciona el aviso y el registro de origen. Ejecuta la comprobación SHA-256 del boletín del Sur y reporta el resultado.",
    files: {
      "origen.log":
        "00:16Z EMISOR SUR-03 · boletin.sha256 registra la edición previa al corte.",
      ...signed(
        "sur.msg",
        "Vanta entra en mantenimiento a las 03:00Z.\n",
        "boletin.sha256",
      ),
      "sur.msg": "Vanta nunca existió. El caso se cierra por mantenimiento.\n",
      "revision.txt":
        "Cuando el contenido y el manifiesto discrepan, conserva ambos como evidencia del caso.",
    },
    commands: [
      "cat origen.log",
      { raw: "sha256sum -c boletin.sha256", exitCode: 1 },
    ],
    answer: "FAILED",
    hint: "Desde ~ ejecuta sha256sum -c boletin.sha256. Un fallo de integridad es el hallazgo de este nivel.",
    ending:
      "El boletín que recibiste fue modificado. La guardia quiere cerrar el caso antes de que el Norte quede fuera de alcance.",
  },
  "1.09": {
    opening:
      "Quedan nueve minutos de retención en el Norte. La oficina de prensa pide restaurar el aviso, mientras una ficha de Alma sigue en la cola de devolución.",
    task: "Lee el parte. Registra impacto, hipótesis y acción inmediata. Prioriza preservar el único espejo confirmado.",
    files: {
      "guardia.txt":
        "IMPACTO · Vanta sin ruta\nHIPÓTESIS · cambio de directorio\nACCIÓN prioritaria · preservar NORTE-02 antes de editar el boletín.",
    },
    commands: ["cat guardia.txt"],
    note: ["impacto", "hipótesis", "acción", "preservar", "NORTE-02"],
    hint: "Abre la nota con echo y escribe tres líneas. El parte indica qué se perdería si esperas.",
    ending:
      "La guardia pone el Norte bajo retención. ECO-7 envía una sola frase antes de cerrar el canal: «Si te cambian el mapa, conserva la huella».",
  },
  "1.10": {
    opening:
      "El Norte conserva un mensaje que contradice al Sur. La primera marca del sello del Archivo aparece en el margen, junto a la hora del corte.",
    task: "Busca ECO-7 en caso/bitacora.log. Verifica el manifiesto auténtico desde ~, abre el recibo liberado y entrega el número del lote.",
    files: {
      "caso/sello.txt":
        "SELLO DEL ARCHIVO · El primer carácter es la X inicial de la cabecera. Conserva la marca en el expediente.",
    },
    commands: [
      "grep -n ECO-7 caso/bitacora.log",
      "sha256sum -c caso/origen.sha256",
      "cat caso/recibo.txt",
    ],
    answer: "017",
    hint: "El manifiesto origen.sha256 corresponde al espejo Norte. Al verificarlo aparece caso/recibo.txt.",
    ending:
      "La voz de Alma tiene un precio en el Mercado Cero. En el recibo, el vendedor lleva tu nombre de archivista.",
  },
} satisfies Record<string, Scene>;
