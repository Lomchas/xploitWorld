import { signed, type Scene } from "./scene";

export const MERCADO = {
  "2.01": {
    opening:
      "Mercado Cero · 00:39. Un vendedor llamado Nácar ofrece el lote 017. El avance contiene la misma voz que acabas de escuchar en el Norte.",
    task: "Lee la ficha y entrega el identificador del caso al que pertenece el activo. Usa la referencia de la ficha para mantener a la titular bajo custodia.",
    files: {
      "lote-017.txt":
        "LOTE 017 · Voz de huésped · Referencia AL-017 · Registro 00:17Z · Publicación 00:21Z",
      "lote-071.txt":
        "LOTE 071 · Prueba de audio del catálogo · Referencia TC-071 · Publicación 00:32Z",
    },
    commands: ["cat lote-017.txt"],
    answer: "AL-017",
    hint: "El identificador de la reclamación de Alma empieza por AL. El número de lote es otra referencia.",
    ending:
      "El lote confirma la procedencia. Nácar dice que recibió el archivo de tu cuenta y te ofrece mostrar la ficha de publicación.",
  },
  "2.02": {
    opening:
      "La ficha cita un dominio del Archivo. El inventario de fuentes públicas de la universidad recoge tres dominios con nombres parecidos.",
    task: "Lee las vistas de Amass, TheHarvester y Maltego. Registra el dominio aprobado para avisos, su titular y la regla de publicación.",
    files: {
      "amass.txt":
        "archivo.uno.example · publicado\nturno.uno.example · interno\narchivo-bruma.example · tercero",
      "theharvester.txt":
        "archivo.uno.example · Guardia UNO · página de avisos\narchivo-bruma.example · Consorcio Bruma",
      "maltego.txt":
        "archivo.uno.example → Guardia UNO → avisos sin datos personales\nturno.uno.example → auditoría interna",
    },
    commands: ["cat amass.txt", "cat theharvester.txt", "cat maltego.txt"],
    note: ["archivo.uno.example", "Guardia UNO", "sin datos personales"],
    hint: "Cruza el nombre del dominio con titular y política. Cada dato aparece en una vista distinta.",
    ending:
      "El mercado citó un dominio válido para vestir un recibo privado como si fuera un aviso de guardia.",
  },
  "2.03": {
    opening:
      "Nácar te entrega dos recibos. Ambos muestran tu identificador. Uno registra una sesión abierta cuando tu cohorte aún seguía en el tutorial.",
    task: "Lee 017-a.rec y busca UTC en 017-b.rec. Entrega la referencia del recibo que precede al incidente de las 00:17 UTC.",
    files: {
      "017-a.rec":
        "Emisor: caja pública · Ref: MC-017-A\nUTC: 00:21 · Vendedor: archivista",
      "017-b.rec":
        "Emisor: pasarela local · Ref: MC-017-B\nUTC: 00:15 · Vendedor: archivista",
    },
    commands: ["cat 017-a.rec", "grep -n UTC 017-b.rec"],
    answer: "MC-017-B",
    hint: "El registro previo al corte dice UTC 00:15. Entrega su Ref, no el número de lote.",
    ending:
      "Tu supuesto recibo se creó antes de la pérdida de Vanta. Guarda ambos hasta verificar su origen.",
  },
  "2.04": {
    opening:
      "La huella de la pasarela llegó por el canal del Norte. ECO-7 pidió conservar la copia auténtica y el recibo que se publicó después.",
    task: "Verifica los dos manifiestos desde ~. Entrega el identificador del único recibo cuyo contenido coincide con la huella original.",
    files: {
      ...signed(
        "017-b.rec",
        "MC-017-B · emisor pasarela local · UTC 00:15\n",
        "pasarela.sha256",
      ),
      ...signed("017-a.rec", "MC-017-A · original de la caja\n", "caja.sha256"),
      "017-a.rec": "MC-017-A · contenido de la caja editado a las 00:21\n",
    },
    commands: [
      "sha256sum -c pasarela.sha256",
      { raw: "sha256sum -c caja.sha256", exitCode: 1 },
    ],
    answer: "MC-017-B",
    hint: "Usa sha256sum -c en ambos archivos .sha256. La salida OK corresponde a la copia preservada.",
    ending:
      "La sesión de las 00:15 existió. Queda por descubrir quién usó el identificador del archivista.",
  },
  "2.05": {
    opening:
      "Tu credencial se emitió a las 00:26. La sesión de la pasarela lleva el mismo nombre, pero un origen y una autorización distintos.",
    task: "Contrasta la ficha del encargo y el evento de sesión. Entrega el identificador de la autorización registrada para la sesión ajena.",
    files: {
      "cohorte.txt":
        "00:26Z · ARCHIVISTA · sesión COH-26 · autorización INC-026",
      "sesiones.log":
        "00:15Z ARCHIVISTA · sesión PAS-15 · origen pasarela · autorización CONT-35",
    },
    commands: ["cat cohorte.txt", "grep -n ARCHIVISTA sesiones.log"],
    answer: "CONT-35",
    hint: "La autorización va al final del evento. Tu propia sesión usa INC-026.",
    ending:
      "CONT-35 no pertenece a tu equipo. ECO-7 guardó el canal de contacto junto al libro de ofertas.",
  },
  "2.06": {
    opening:
      "Nácar bloquea el chat público. Alguien dejó un código breve en el libro, en la misma columna que el lote 017.",
    task: "Localiza el archivo del contacto y decodifícalo. Entrega el identificador de la línea CANAL.",
    files: {
      "ofertas.log":
        "LOTE-014 · descartado\nLOTE-017 · contacto enlace.b64\nLOTE-071 · señuelo",
      "enlace.b64": "Q0FOQUw6IEVDTy03LTAxNwo=\n",
    },
    commands: ["grep -n LOTE-017 ofertas.log", "base64 -d enlace.b64"],
    answer: "ECO-7-017",
    hint: "Base64 transforma la representación del archivo. Usa base64 -d sobre el adjunto indicado.",
    ending:
      "ECO-7 confirma el canal y pide conservar el recibo original. Un comerciante intenta quedarse con la única copia.",
  },
  "2.07": {
    opening:
      "Nácar exige el original para devolver el depósito. ECO-7 te ofrece un buzón de custodia y una copia de trabajo de la pasarela.",
    task: "Comprueba la huella de la copia de trabajo. Guarda un registro con la referencia original, la referencia de la copia, el custodio y el resultado de la verificación.",
    files: {
      ...signed(
        "copia-017.rec",
        "COPIA-017 · Original MC-017-B · Custodio ECO-7\n",
        "copia.sha256",
      ),
      "custodia.txt":
        "Original MC-017-B · retenido en el buzón ECO-7\nCopia de trabajo: COPIA-017",
    },
    commands: ["cat custodia.txt", "sha256sum -c copia.sha256"],
    note: ["MC-017-B", "COPIA-017", "ECO-7", "OK"],
    hint: "El original se conserva en el buzón. Usa el manifiesto para identificar qué copia analizaste.",
    ending:
      "El recibo queda sellado en custodia. La junta solicita una versión que pueda circular sin exponer a Alma.",
  },
  "2.08": {
    opening:
      "La copia de prensa incluye la ficha privada de Alma. Tu informe puede probar la procedencia del lote sin reproducir esa ficha.",
    task: "Lee la pauta y entrega los dos campos permitidos, separados por un espacio y en el orden indicado.",
    files: {
      "pauta.txt":
        "PUBLICABLE: referencia, hora\nRESERVADO: identidad, dirección, contenido\nFormato de salida: referencia hora",
    },
    commands: ["cat pauta.txt"],
    answer: "referencia hora",
    hint: "La pauta distingue los campos que sustentan el hallazgo de los que pertenecen a la huésped.",
    ending:
      "La copia circula con la referencia del lote. Operaciones puede seguir el pago sin consultar la identidad de Alma.",
  },
  "2.09": {
    opening:
      "En la caja del mercado hay un pago que se archivó como mantenimiento. El vendedor dice que trabajaba para un contratista de infraestructura.",
    task: "Busca 017 en los pagos y cruza la referencia con el contrato. Guarda lote, orden, contratista y referencia del pago.",
    files: {
      "pagos.log":
        "MC-014 · P-411 · SERVICIO\nMC-017 · P-412 · OLVIDO\nMC-071 · P-413 · DEVUELTO",
      "contratos.txt":
        "P-412 · Consorcio Bruma · mantenimiento · Orden OLVIDO\nP-413 · sin orden asociada",
    },
    commands: ["grep -n 017 pagos.log", "cat contratos.txt"],
    note: ["017", "P-412", "Consorcio Bruma", "OLVIDO"],
    hint: "P-412 conecta el libro del mercado con el contrato de Bruma.",
    ending:
      "El pago abre la secundaria bruma. ECO-7 avisa que acaba de aparecer una contraorden sobre el lote.",
  },
  "2.10": {
    opening:
      "La subasta se detiene por unos segundos. Tu recibo y la sesión anterior al corte bastan para pedir que se preserve el lote 017.",
    task: "Lee el contacto, verifica el libro y abre la contraorden. Registra dos referencias comprobadas y qué documento falta para atribuir la orden al responsable final.",
    files: {
      "mercado/entrega.txt":
        "Pruebas independientes: recibo 017 y sesión PAS-15. Pendiente: orden original con responsable de aprobación.",
    },
    commands: [
      "base64 -d mercado/canal.b64",
      "sha256sum -c mercado/libro.sha256",
      "cat mercado/contraorden.txt",
    ],
    note: ["017", "PAS-15", "orden original"],
    hint: "Verifica mercado/libro.sha256 desde ~. La nota debe identificar lo que ya se comprobó y lo que queda por atribuir.",
    ending:
      "Nácar retira el lote. En la contraorden aparece una palabra que viste en el contrato de Bruma: OLVIDO.",
  },
} satisfies Record<string, Scene>;
