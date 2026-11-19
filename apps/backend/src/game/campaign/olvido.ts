import { type Scene } from "./scene";

export const OLVIDO = {
  "3.01": {
    opening:
      "ECO-7 envía una copia parcial de OLVIDO. El acta menciona rutas públicas y termina justo donde debería estar el índice de huéspedes.",
    task: "Lee la orden y entrega el nombre del componente fuera del alcance de esa copia.",
    files: {
      "olvido-parcial.txt":
        "Orden OLVIDO · Bruma · Componente autorizado: rutas públicas\nPendiente de comprobación: índice de huéspedes",
    },
    commands: ["cat olvido-parcial.txt"],
    answer: "índice de huéspedes",
    hint: "El documento enumera lo que autorizó Bruma y lo que quedó sin comprobar.",
    ending:
      "El equipo abre una réplica del portal para recuperar el catálogo y proteger los informes de los huéspedes.",
  },
  "3.02": {
    opening:
      "La réplica del portal reproduce la última versión publicada. En las capturas aparece una cookie de sesión que viaja por el canal de pruebas.",
    task: "Revisa la transacción de Burp Suite y los hallazgos archivados de OWASP ZAP, Gobuster y Nikto. Guarda la ruta de informes y las marcas de cookie recomendadas.",
    files: {
      "burp.txt":
        "Vista archivada · GET /informes · sesión de prueba · cookie sin marcas de transporte",
      "zap.txt":
        "Control recomendado: Secure y HttpOnly en la cookie de sesión.",
      "gobuster.txt":
        "Inventario autorizado: /catalogo público · /informes reservado",
      "nikto.txt":
        "Revisión del portal de prueba: exigir HTTPS y aplicar autorización al recurso reservado.",
    },
    commands: [
      "cat burp.txt",
      "cat zap.txt",
      "cat gobuster.txt",
      "cat nikto.txt",
    ],
    note: ["/informes", "Secure", "HttpOnly", "HTTPS"],
    hint: "La transacción describe el síntoma. ZAP y Nikto enumeran los controles a documentar.",
    ending:
      "La sesión queda mejor protegida en tránsito. El siguiente diagnóstico prueba quién puede consultar el informe.",
  },
  "3.03": {
    opening:
      "En la réplica, un perfil de visita recibe el resumen reservado. Operaciones concede permiso para ajustar la regla de acceso y probar ambos perfiles.",
    task: "Ejecuta test visitante, aplica la regla para archivistas y comprueba los dos perfiles. Usa set para ver las opciones.",
    files: {
      "acceso.txt":
        "Política: /informes se sirve solo a archivistas autorizados.",
    },
    control: {
      name: "informes",
      initial: "abierto",
      final: "archivistas",
      outcomes: {
        abierto: {
          visitante: "200 · Resumen entregado a visitante",
          archivista: "200 · Resumen disponible",
        },
        archivistas: {
          visitante: "403 · Acceso denegado",
          archivista: "200 · Resumen disponible",
        },
      },
      checks: [
        ["abierto", "visitante"],
        ["archivistas", "visitante"],
        ["archivistas", "archivista"],
      ],
    },
    hint: "Usa set informes archivistas después de observar el estado inicial. Ejecuta test visitante y test archivista.",
    ending:
      "La réplica deniega la visita y conserva la consulta autorizada. ECO-7 detecta una segunda observación en el formulario del catálogo.",
  },
  "3.04": {
    opening:
      "El informe de revisión del catálogo muestra que el formulario mezclaba un dato de búsqueda con la consulta. La réplica permite cambiar cómo se envía el valor.",
    task: "Lee el informe y usa set para elegir el control indicado. Comprueba el tratamiento de valores y una búsqueda legítima.",
    files: {
      "sqlmap-informe.txt":
        "Resumen de caso sintético · construcción de consulta por concatenación · corrección aprobada: separar la consulta fija de sus parámetros.",
    },
    commands: ["cat sqlmap-informe.txt"],
    control: {
      name: "consulta",
      initial: "concatenada",
      final: "parametrizada",
      outcomes: {
        concatenada: {
          valores: "Revisión: valor mezclado con la consulta",
          catalogo: "Fichas de prueba disponibles",
        },
        bloqueada: {
          valores: "Formulario cerrado",
          catalogo: "Búsqueda legítima interrumpida",
        },
        parametrizada: {
          valores: "Valor tratado como dato",
          catalogo: "Fichas de prueba disponibles",
        },
      },
      checks: [
        ["parametrizada", "valores"],
        ["parametrizada", "catalogo"],
      ],
    },
    hint: "El control debe separar datos y consulta y mantener la búsqueda. Prueba set consulta parametrizada.",
    ending:
      "Las fichas siguen disponibles. El registro del servicio revela una cuenta con permiso para publicar y borrar cuando solo necesita leer.",
  },
  "3.05": {
    opening:
      "La cuenta de servicio del catálogo hereda el rol de administración. El turno de atención necesita que las fichas públicas sigan respondiendo.",
    task: "Deja la cuenta con permisos de lectura. Prueba la consulta legítima y la escritura desde la cuenta del servicio.",
    files: {
      "roles.txt":
        "svc-catalogo · función: leer fichas aprobadas · publicación a cargo de la guardia",
    },
    control: {
      name: "svc-catalogo",
      initial: "administrador",
      final: "lectura",
      outcomes: {
        administrador: { lectura: "Permitida", escritura: "Permitida" },
        lectura: { lectura: "Permitida", escritura: "Denegada" },
        revocado: { lectura: "Denegada", escritura: "Denegada" },
      },
      checks: [
        ["lectura", "lectura"],
        ["lectura", "escritura"],
      ],
    },
    hint: "Si revocas todo, el catálogo deja de funcionar. Usa set svc-catalogo lectura.",
    ending:
      "El catálogo funciona con una cuenta limitada. El portal queda listo para recuperar el canal de mantenimiento.",
  },
  "3.06": {
    opening:
      "Varela pide cerrar todos los enlaces. La guardia necesita un canal interno para devolver las fichas a sus titulares.",
    task: "Consulta la política, aplica el filtro a la réplica y verifica los flujos interno y externo.",
    files: {
      "enlaces.txt":
        "Mantenimiento: permitir guardia interna · denegar flujo externo · registrar decisiones",
    },
    commands: ["cat enlaces.txt"],
    control: {
      name: "filtro",
      initial: "todos",
      final: "interno",
      outcomes: {
        todos: { interno: "Permitido", externo: "Permitido" },
        ninguno: { interno: "Denegado", externo: "Denegado" },
        interno: { interno: "Permitido", externo: "Denegado" },
      },
      checks: [
        ["interno", "interno"],
        ["interno", "externo"],
      ],
    },
    hint: "Prueba el efecto del valor interno con test interno y test externo.",
    ending:
      "La guardia conserva el canal. Llega una alerta sobre la cuenta que aprobó las últimas conexiones.",
  },
  "3.07": {
    opening:
      "La cuenta de relevo registra accesos inusuales. La universidad aporta un resumen de revisión de credenciales con datos del ejercicio.",
    task: "Cruza los tres informes. Registra un control para el almacenamiento, uno para el inicio de sesión y uno para intentos repetidos.",
    files: {
      "hashcat.txt":
        "Revisión offline sintética · almacenamiento heredado rápido. Migración recomendada: Argon2id con sal.",
      "john.txt":
        "El informe de política detecta credenciales reutilizadas. La guardia exige MFA para la cuenta privilegiada.",
      "hydra.txt":
        "Resumen de auditoría sintética · el servicio no limita los intentos consecutivos. Control: límites de intentos.",
    },
    commands: ["cat hashcat.txt", "cat john.txt", "cat hydra.txt"],
    note: ["Argon2id", "MFA", "límites de intentos"],
    hint: "Los tres controles responden a problemas distintos. Guarda una línea para cada uno.",
    ending:
      "La cuenta de guardia se prepara para el relevo. Antes de publicar el cambio, necesitas una prueba de reversión.",
  },
  "3.08": {
    opening:
      "Un ajuste general bloquea la consulta pública junto con los informes. Operaciones te presta una ventana para ensayar el cambio y su reversión.",
    task: "Mide el catálogo en el estado inicial, con el cierre temporal y después de volver al modo inicial. Guarda qué se comprobó y cómo se revierte.",
    files: {
      "ventana.txt":
        "Comprobación: catálogo disponible → cierre → restauración del modo catálogo. Registra la reversión.",
    },
    control: {
      name: "portal",
      initial: "catalogo",
      final: "catalogo",
      outcomes: {
        catalogo: { consulta: "200 · Catálogo disponible" },
        cerrado: { consulta: "503 · Catálogo en mantenimiento" },
      },
      checks: [
        ["catalogo", "consulta"],
        ["cerrado", "consulta"],
        ["catalogo", "consulta"],
      ],
      ordered: true,
    },
    note: ["catálogo", "reversión", "disponible"],
    hint: "Ejecuta test consulta en cada etapa. Primero catalogo, luego cerrado y por último catalogo.",
    ending:
      "La prueba de reversión deja el portal disponible. ECO-7 entrega el manifiesto que autorizó retirar la ruta de Vanta.",
  },
  "3.09": {
    opening:
      "El acta de mantenimiento contiene una cláusula numerada. Bruma recibió el encargo desde un canal reservado de UNO.",
    task: "Lee el manifiesto y el encargo. Entrega el identificador de la cláusula que comparten.",
    files: {
      "manifiesto.txt": "OLVIDO · firmante Consorcio Bruma · cláusula CONT-35",
      "encargo.txt":
        "UNO · canal de emergencia · orden de ruta · referencia CONT-35 · acuse local pendiente",
    },
    commands: ["cat manifiesto.txt", "cat encargo.txt"],
    answer: "CONT-35",
    hint: "La referencia compartida también aparece en la sesión ajena del Mercado Cero.",
    ending:
      "CONT-35 vincula la orden de Bruma con UNO. Solo queda verificar la raíz antes de devolver la señal a Vanta.",
  },
  "3.10": {
    opening:
      "ECO-7 encontró el manifiesto de guardia. Si la copia se valida, puede devolver la ruta pública sin perder el rastro del encargo.",
    task: "Busca a Bruma en el registro, verifica la raíz desde ~ y lee el acta liberada. Guarda qué volvió y qué continúa afectado.",
    files: {
      "olvido/impacto.txt":
        "Vanta · ruta pública recuperada · huéspedes sin acceso al índice de la ciudad.",
      "olvido/sello.txt":
        "SELLO DEL ARCHIVO · Guarda los tres caracteres finales de la cabecera, incluido el guion bajo.",
    },
    commands: [
      "grep -n Bruma olvido/autorizaciones.log",
      "sha256sum -c olvido/raiz.sha256",
      "cat olvido/restauracion.txt",
      "cat olvido/impacto.txt",
    ],
    note: ["ruta pública", "huéspedes", "sin acceso"],
    hint: "La ruta pública y el acceso de los huéspedes son comprobaciones distintas. El registro de impacto te permite escribir ambas.",
    ending:
      "Vanta vuelve a emitir. La prensa celebra. Alma intenta abrir la puerta y el sistema responde que su casa ya tiene calle, pero todavía no la reconoce. La junta abre los archivos de UNO.",
  },
} satisfies Record<string, Scene>;
