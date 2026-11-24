import type {
  AcademyEvidence,
  AcademyLessonId,
  AcademyQuestion,
  AcademyToolId,
} from "@null-protocol/shared";

interface Check extends AcademyQuestion {
  answer: number;
  hint: string;
}
interface CaseFile {
  briefing: string;
  evidence: AcademyEvidence[];
  checks: Check[];
  review: string;
}

function table(
  toolId: AcademyToolId,
  title: string,
  columns: AcademyEvidence["columns"],
  rows: AcademyEvidence["rows"],
): AcademyEvidence {
  return { toolId, title, columns, rows };
}

function check(
  id: string,
  prompt: string,
  options: readonly string[],
  answer: number,
  hint: string,
): Check {
  return { id, prompt, options, answer, hint };
}

export const CASES: Record<AcademyLessonId, CaseFile> = {
  custodia: {
    briefing:
      "Alma entrega un manifiesto firmado por la guardia y dos copias del índice. La firma ya fue validada. Decide qué copia usar para investigar por qué desapareció una ciudad del catálogo.",
    evidence: [
      {
        toolId: "sha256sum",
        title: "Registro de custodia del índice",
        columns: ["Origen de la huella", "SHA-256"],
        rows: [
          [
            "Manifiesto firmado",
            "e420cd23aab875aa8e52271632fd70082490465d3c440ef044a4a77d31ba5b56",
          ],
          [
            "copia-A",
            "c733e2eede997443749580751db0ed883c070f60a8dfc8c383d72ebe75a1e91a",
          ],
          [
            "copia-B",
            "e420cd23aab875aa8e52271632fd70082490465d3c440ef044a4a77d31ba5b56",
          ],
        ],
      },
      {
        toolId: "diff",
        title: "Diferencias respecto al índice firmado",
        columns: ["Copia de trabajo", "Registro V-017"],
        rows: [
          ["copia-A", "Falta la fila de Vanta."],
          ["copia-B", "La fila coincide."],
        ],
      },
    ],
    checks: [
      {
        id: "integridad",
        prompt: "¿Qué copia respalda el manifiesto de la guardia?",
        options: [
          "copia-A",
          "copia-B",
          "Las dos, porque tienen el mismo nombre de índice.",
        ],
        answer: 1,
        hint: "Compara la huella completa de cada copia con la del manifiesto.",
      },
      {
        id: "limite",
        prompt: "¿Qué permite concluir la fila que falta?",
        options: [
          "Alma borró la ciudad a las 00:17.",
          "Es seguro reemplazar el original con la copia A.",
          "La copia A difiere del índice. Falta evidencia para atribuir el cambio.",
        ],
        answer: 2,
        hint: "El cotejo muestra un cambio en los datos. Busca qué evidencia identifica al autor.",
      },
    ],
    review:
      "Conserva ambas copias. Usa B como copia verificada y registra la fila ausente en A como hallazgo separado. Una diferencia por sí sola no identifica al responsable.",
  },
  restauracion: {
    briefing:
      "El índice dejó de responder a las 04:20 UTC. La guardia admite perder hasta cinco minutos de datos y dispone de diez minutos para restablecer la consulta. Los 120 identificadores del manifiesto deben quedar completos y sin duplicados.",
    evidence: [
      {
        toolId: "restic",
        title: "Ensayo de restauración de las instantáneas",
        columns: ["Instantánea", "Último dato UTC", "Tiempo hasta consulta"],
        rows: [
          ["A", "04:11", "6 min"],
          ["B", "04:17", "8 min"],
          ["C", "04:18", "12 min"],
        ],
      },
      {
        toolId: "jq",
        title: "Validación del catálogo restaurado desde B",
        columns: ["Medida", "Esperado", "Observado"],
        rows: [
          ["Número de filas", "120", "120"],
          ["Identificadores distintos", "120", "119"],
          ["Identificador faltante", "—", "V-044"],
          ["Identificador duplicado", "—", "V-043"],
        ],
      },
    ],
    checks: [
      {
        id: "ventana",
        prompt: "¿Qué instantánea cumple ambos límites de tiempo?",
        options: ["A", "B", "C"],
        answer: 1,
        hint: "Resta la hora del último dato de las 04:20 y comprueba también la duración del ensayo.",
      },
      {
        id: "aceptacion",
        prompt: "¿Qué debe hacer la guardia antes de reabrir el catálogo?",
        options: [
          "Aceptar B porque volvió a tener 120 filas.",
          "Eliminar una fila al azar para compensar el duplicado.",
          "Investigar V-043 y V-044 y repetir la comprobación contra el manifiesto.",
        ],
        answer: 2,
        hint: "Compara los identificadores distintos con el total exigido en el encargo.",
      },
    ],
    review:
      "B pierde tres minutos y recupera la consulta en ocho. El recuento de filas parece correcto, pero V-043 aparece dos veces y falta V-044. La aceptación requiere cotejar de nuevo los identificadores con el manifiesto.",
  },
  inventario: {
    briefing:
      "ECO-7 reabrió una copia del Archivo de Vanta. El catálogo debe estar disponible para visitantes. La consola de mantenimiento pertenece al segmento de operadores. Compara el inventario con el registro web.",
    evidence: [
      table(
        "nmap",
        "Inventario autorizado de la red virtual",
        ["Equipo", "Servicio", "Segmento visible", "Estado"],
        [
          ["Catálogo", "TCP/443", "Visitantes", "Disponible"],
          ["Mantenimiento", "TCP/22", "Visitantes y operadores", "Disponible"],
          ["Almacén", "TCP/5432", "Interno", "Disponible"],
        ],
      ),
      table(
        "whatweb",
        "Metadatos HTTP archivados",
        ["Servicio", "Cabecera", "Valor observado"],
        [
          ["Catálogo", "Content-Type", "text/html"],
          ["Catálogo", "Server", "Vanta-Portal / 2.1"],
          ["Catálogo", "Cache-Control", "public"],
        ],
      ),
    ],
    checks: [
      check(
        "alcance",
        "¿Qué servicio requiere corregir su alcance?",
        [
          "Catálogo, porque lo consultan visitantes.",
          "Mantenimiento, porque aparece en el segmento de visitantes.",
          "Almacén, porque se encuentra en el segmento interno.",
        ],
        1,
        "Cruza la columna Segmento visible con el acceso autorizado en el encargo.",
      ),
      check(
        "huella",
        "¿Qué dato sirve como indicio de la tecnología declarada por el portal?",
        [
          "La directiva public de caché.",
          "El tipo de contenido text/html.",
          "El producto y la versión declarados en Server.",
        ],
        2,
        "Busca la cabecera que declara un producto y una versión.",
      ),
    ],
    review:
      "Restringe mantenimiento al segmento de operadores y conserva el acceso de visitantes al catálogo. Usa Server como indicio y confirma la versión instalada con el inventario del equipo.",
  },
  trafico: {
    briefing:
      "El catálogo volvió a funcionar. El equipo de operaciones guardó una captura sintética de dos accesos para comprobar qué información viajó visible.",
    evidence: [
      table(
        "wireshark",
        "Paquetes de la sesión de prueba",
        ["Hora", "Protocolo", "Detalle observable"],
        [
          ["09:42:03", "DNS", "Consulta para catalogo.vanta.example"],
          [
            "09:42:04",
            "HTTP",
            "Cuerpo legible con identificador de sesión ficticio [omitido]",
          ],
          ["09:42:05", "TLS", "Datos de aplicación cifrados"],
        ],
      ),
      table(
        "tcpdump",
        "Resumen de flujos archivados",
        ["Hora", "Origen", "Destino", "Puerto"],
        [
          ["09:42:03", "192.0.2.24", "192.0.2.53", "UDP/53"],
          ["09:42:04", "192.0.2.24", "192.0.2.40", "TCP/80"],
          ["09:42:05", "192.0.2.24", "192.0.2.40", "TCP/443"],
        ],
      ),
    ],
    checks: [
      check(
        "sesion",
        "¿En qué flujo hay evidencia directa de exposición de datos de sesión?",
        [
          "El HTTP de las 09:42:04.",
          "La consulta DNS de las 09:42:03.",
          "El TLS de las 09:42:05.",
        ],
        0,
        "Combina el horario de Tcpdump con el detalle legible de Wireshark.",
      ),
      check(
        "tls",
        "¿Qué puedes documentar del flujo TLS con la evidencia que tienes?",
        [
          "El valor de la sesión y el texto completo del formulario.",
          "Los extremos, el horario y la presencia de datos de aplicación cifrados.",
          "Que el contenido fue recibido por el departamento de soporte.",
        ],
        1,
        "Revisa qué campos muestra el resumen del flujo y cómo está descrito su cuerpo.",
      ),
    ],
    review:
      "El flujo HTTP deja datos de sesión visibles en la captura. La comprobación TLS conserva metadatos de conexión. Repite la prueba de aceptación en el portal protegido y documenta ambos resultados.",
  },
  huella: {
    briefing:
      "El Archivo prepara su inventario público. Su política permite publicar el buzón de soporte y exige que el panel operativo y los datos de contacto personales queden en canales internos.",
    evidence: [
      table(
        "amass",
        "Inventario DNS ficticio",
        ["Nombre", "Zona", "Propósito"],
        [
          ["catalogo.vanta.example", "Pública", "Catálogo"],
          ["turnos.vanta.example", "Pública", "Panel operativo"],
          ["almacen.vanta.example", "Interna", "Base documental"],
        ],
      ),
      table(
        "theharvester",
        "Contactos del material autorizado",
        ["Referencia", "Tipo de contacto", "Visibilidad"],
        [
          ["soporte@vanta.example", "Buzón del equipo", "Pública"],
          ["contacto personal ficticio", "Ficha individual", "Pública"],
        ],
      ),
      table(
        "maltego",
        "Entidades y propietarios",
        ["Entidad", "Relación", "Responsable"],
        [
          ["Turnos", "Panel de la sede", "Operaciones"],
          ["Catálogo", "Servicio de publicación", "Comunicaciones"],
          ["Ficha individual", "Documento publicado", "Comunicaciones"],
        ],
      ),
    ],
    checks: [
      check(
        "dns",
        "¿Con quién revisarías la publicación de turnos.vanta.example?",
        [
          "Con Comunicaciones, porque publica el catálogo.",
          "Con el equipo de almacenamiento, porque gestiona la base documental.",
          "Con Operaciones, responsable del panel que aparece en DNS público.",
        ],
        2,
        "Sigue la relación entre el nombre DNS, el servicio y su propietario.",
      ),
      check(
        "contacto",
        "¿Qué cambio respeta la política de contactos del Archivo?",
        [
          "Retirar la ficha individual del material público y conservar el buzón de soporte.",
          "Publicar también el directorio interno de turnos.",
          "Reemplazar el buzón de soporte por fichas individuales.",
        ],
        0,
        "Distingue los dos tipos de contacto y sus fines.",
      ),
    ],
    review:
      "Entrega a Operaciones el hallazgo sobre el panel y solicita a Comunicaciones retirar la ficha individual. Conserva las referencias del catálogo y del buzón público.",
  },
  web: {
    briefing:
      "Un informe del portal menciona una cookie y una ruta de reportes. La política permite el catálogo público y reserva los reportes a operadores autenticados. Prioriza cambios a partir de las respuestas guardadas.",
    evidence: [
      table(
        "burp-suite",
        "Respuestas HTTP archivadas",
        ["Recurso", "Contexto", "Respuesta"],
        [
          [
            "/sesion",
            "HTTPS",
            "Set-Cookie: sesion=[omitida]; Path=/; HttpOnly; SameSite=Lax",
          ],
          ["/reportes", "Visitante sin sesión", "200 · resumen interno"],
        ],
      ),
      table(
        "owasp-zap",
        "Hallazgos para revisión",
        ["Hallazgo", "Evidencia", "Estado"],
        [
          ["Atributo Secure ausente", "Respuesta de /sesion", "Pendiente"],
          [
            "Autorización de reportes",
            "Visitante recibe contenido interno",
            "Pendiente",
          ],
        ],
      ),
      table(
        "gobuster",
        "Rutas del inventario de publicación",
        ["Ruta", "Dueño", "Audiencia permitida"],
        [
          ["/catalogo", "Comunicaciones", "Visitantes"],
          ["/reportes", "Operaciones", "Operadores autenticados"],
        ],
      ),
      table(
        "nikto",
        "Resumen de configuración del portal",
        ["Control", "Valor observado"],
        [
          ["Certificado del portal", "Válido en la evidencia"],
          ["Redirección del portal público", "Activa hacia HTTPS"],
        ],
      ),
    ],
    checks: [
      check(
        "cookie",
        "¿Qué atributo falta para que el navegador envíe esa cookie únicamente por HTTPS?",
        ["Path=/.", "Secure.", "HttpOnly."],
        1,
        "Observa los atributos ya presentes y el requisito específico del transporte.",
      ),
      check(
        "reporte",
        "¿Qué cambio debe comprobarse desde el perfil visitante?",
        [
          "Ocultar el vínculo de reportes del menú.",
          "Cambiar el nombre de la ruta en la interfaz.",
          "Aplicar autorización en el servidor y comprobar que el visitante ya recibe una respuesta de acceso denegado.",
        ],
        2,
        "La respuesta archivada muestra contenido interno. El criterio de aceptación se comprueba al solicitar el recurso.",
      ),
    ],
    review:
      "Añade Secure a la cookie servida por HTTPS y prueba la autorización de /reportes en el servidor. Conserva una prueba positiva con un operador autorizado y otra de acceso denegado con un visitante.",
  },
  consultas: {
    briefing:
      "La búsqueda de fichas falló en una revisión interna. La evidencia describe cómo se construye la consulta y qué permisos necesita la cuenta del servicio.",
    evidence: [
      table(
        "sqlmap",
        "Informe archivado de revisión de consultas",
        ["Componente", "Observación", "Necesidad de negocio"],
        [
          [
            "Búsqueda de fichas",
            "El texto del formulario se incorpora a la estructura de la consulta",
            "Buscar por código y nombre",
          ],
          [
            "Cuenta del catálogo",
            "Permisos de lectura y administración",
            "Leer fichas publicadas",
          ],
          [
            "Caso de aceptación",
            "Búsqueda de una ficha con caracteres especiales en su nombre",
            "Devolver su ficha exacta",
          ],
        ],
      ),
    ],
    checks: [
      check(
        "parametros",
        "¿Qué cambio separa los valores del formulario de la estructura de la consulta?",
        [
          "Preparar la consulta y enlazar los valores como parámetros.",
          "Cambiar el nombre del campo visible.",
          "Enviar el mismo dato mediante otro método HTTP.",
        ],
        0,
        "Busca el cambio que separa explícitamente la instrucción y los datos.",
      ),
      check(
        "permisos",
        "¿Qué permisos debe tener la cuenta del catálogo según el requisito?",
        [
          "Administración para que cualquier búsqueda termine.",
          "Lectura de las fichas publicadas.",
          "Escritura en todos los recursos del Archivo.",
        ],
        1,
        "Usa la columna Necesidad de negocio para definir el permiso mínimo.",
      ),
    ],
    review:
      "Usa consultas parametrizadas para los valores de búsqueda y limita la cuenta a la lectura autorizada. Prueba búsquedas válidas, incluidos nombres con caracteres especiales, y comprueba los permisos del servicio.",
  },
  autenticacion: {
    briefing:
      "Las cuentas de turno se migrarán a una política nueva. Revisa dos cohortes y los eventos de un inicio de sesión privilegiado.",
    evidence: [
      table(
        "hashcat",
        "Resumen de almacenamiento de contraseñas",
        ["Cohorte", "Algoritmo", "Salt individual"],
        [
          ["Turnos anteriores", "SHA-256 directo", "Ausente"],
          ["Turnos nuevos", "Argon2id", "Presente"],
        ],
      ),
      table(
        "john",
        "Informe de política del directorio",
        ["Grupo", "Segundo factor"],
        [
          ["Operadores de soporte", "Requerido"],
          ["Cuenta de guardia privilegiada", "Pendiente"],
        ],
      ),
      table(
        "hydra",
        "Registro sintético de autenticación",
        ["Cuenta", "Ventana", "Resultado observado"],
        [
          [
            "guardia-vanta",
            "15 min",
            "48 intentos fallidos, un acceso posterior",
          ],
          ["soporte-turno", "15 min", "Un acceso con segundo factor"],
        ],
      ),
    ],
    checks: [
      check(
        "almacenamiento",
        "¿Qué cohorte priorizarías para migrar a un algoritmo de contraseñas con salt individual?",
        [
          "Turnos nuevos, que ya usa Argon2id con salt individual.",
          "Ambas cohortes deben publicar una copia de las credenciales.",
          "Turnos anteriores, que usa SHA-256 directo sin salt individual.",
        ],
        2,
        "Compara el propósito de un algoritmo de contraseñas con el inventario de las dos cohortes.",
      ),
      check(
        "verificacion",
        "¿Qué combinación reduce el riesgo en el acceso privilegiado de guardia?",
        [
          "Habilitar MFA, limitar intentos y revisar el acceso posterior a los fallos.",
          "Mantener la cuenta fuera del registro de auditoría.",
          "Mantener los intentos ilimitados y revisar únicamente la cohorte nueva.",
        ],
        0,
        "Relaciona los fallos repetidos con la política pendiente en la cuenta privilegiada.",
      ),
    ],
    review:
      "Migra la cohorte anterior con un esquema de hashing para contraseñas y salt individual. Requiere MFA en guardia, limita los intentos y conserva los eventos para validar el acceso posterior.",
  },
  inalambrica: {
    briefing:
      "Vanta habilitó una sede temporal. El inventario exige aislamiento de invitados y que toda puerta de enlace observada coincida con su registro aprobado.",
    evidence: [
      table(
        "kismet",
        "Observación archivada de puntos de acceso",
        ["Red", "Activo observado", "Segmento"],
        [
          ["Vanta-Aula", "RADIO-01", "Aula"],
          ["Vanta-Visita", "RADIO-02", "Aula"],
        ],
      ),
      table(
        "aircrack-ng",
        "Ficha de postura de cifrado",
        ["Red", "Postura registrada", "Política"],
        [
          ["Vanta-Aula", "WPA3", "Aprobada"],
          [
            "Vanta-Visita",
            "Cifrado legado",
            "Actualizar e independizar segmento",
          ],
        ],
      ),
      table(
        "bettercap",
        "Comparación de puertas de enlace",
        ["Red", "ID autorizado", "ID observado"],
        [
          ["Vanta-Aula", "GW-A01", "GW-A01"],
          ["Vanta-Visita", "GW-V01", "GW-X09"],
        ],
      ),
    ],
    checks: [
      check(
        "sede",
        "¿Qué corrección corresponde a Vanta-Visita?",
        [
          "Mover también los operadores al segmento de invitados.",
          "Separar el segmento de invitados y aplicar el cifrado aprobado por la sede.",
          "Mantener la configuración porque RADIO-02 aparece en el inventario.",
        ],
        1,
        "Revisa el segmento y la ficha de postura de la misma red.",
      ),
      check(
        "registro",
        "¿Cómo tratarías la observación GW-X09?",
        [
          "Registrarla como anomalía y verificar el activo con el responsable de la sede.",
          "Declararla aprobada porque aparece en una captura.",
          "Usarla para sustituir automáticamente el inventario de todos los equipos.",
        ],
        0,
        "Un ID observado tiene una función distinta al registro de activos autorizados.",
      ),
    ],
    review:
      "Separa invitados, aplica la política de cifrado y verifica GW-X09 con operaciones. El registro conserva hora, sede, activo observado y decisión de seguimiento.",
  },
  directorio: {
    briefing:
      "El equipo de soporte necesita consultar los manuales. Su función excluye administrar producción y modificar los reportes. Contrasta el grafo con dos registros de permisos.",
    evidence: [
      table(
        "bloodhound",
        "Grafo de pertenencias del directorio ficticio",
        ["Origen", "Relación", "Destino"],
        [
          ["operador-luz", "Miembro de", "Mesa de ayuda"],
          ["Mesa de ayuda", "Miembro de", "Administración de producción"],
          ["Mesa de ayuda", "Lectura", "Manuales"],
        ],
      ),
      table(
        "impacket",
        "Permisos de recursos compartidos registrados",
        ["Grupo", "Recurso", "Permiso efectivo"],
        [
          ["Mesa de ayuda", "Manuales", "Lectura"],
          ["Mesa de ayuda", "Reportes", "Escritura"],
        ],
      ),
      table(
        "crackmapexec",
        "Revisión de roles por activo",
        ["Activo", "Rol efectivo", "Motivo"],
        [
          ["Producción", "Administrador", "Pertenencia heredada"],
          ["Manuales", "Lector", "Permiso asignado al grupo"],
        ],
      ),
    ],
    checks: [
      check(
        "herencia",
        "¿Qué relación explica el privilegio administrativo de operador-luz?",
        [
          "La lectura de Manuales.",
          "La escritura en el recurso Reportes por sí sola.",
          "La pertenencia de Mesa de ayuda a Administración de producción.",
        ],
        2,
        "Sigue las relaciones Miembro de entre la cuenta, el grupo y el rol.",
      ),
      check(
        "minimo",
        "¿Qué cambio mantiene la tarea legítima del equipo?",
        [
          "Quitar la pertenencia administrativa y la escritura de reportes, conservando lectura de manuales.",
          "Convertir a todos los miembros de soporte en administradores directos.",
          "Eliminar toda lectura de manuales y mantener el rol administrativo.",
        ],
        0,
        "Compara cada permiso con la función descrita en el encargo.",
      ),
    ],
    review:
      "Elimina la membresía administrativa heredada y la escritura de reportes. Comprueba el permiso efectivo de un operador y confirma que los manuales siguen disponibles.",
  },
  binario: {
    briefing:
      "Vanta recibió dos copias del agente de inventario. Las huellas de esta ficha están abreviadas para facilitar la lectura. El repositorio de la sede conserva un manifiesto autorizado.",
    evidence: [
      table(
        "ghidra",
        "Comparación estática preextraída",
        ["Elemento", "Versión declarada", "Huella abreviada", "Procedencia"],
        [
          ["Manifiesto aprobado", "2.4", "7b65c02e", "Repositorio de la sede"],
          ["Copia A", "2.4", "7b65c02e", "Repositorio de la sede"],
          ["Copia B", "2.4", "c3f19a10", "Entrega fuera del canal"],
          [
            "Importaciones observadas en B",
            "Lectura de archivo",
            "—",
            "Datos extraídos para el ejercicio",
          ],
        ],
      ),
    ],
    checks: [
      check(
        "diferencia",
        "¿Qué copia requiere revisar su procedencia antes de autorizarla?",
        [
          "Copia A, por coincidir con el manifiesto.",
          "Copia B, por la diferencia de huella y el canal de entrega.",
          "El manifiesto aprobado, por registrar una huella.",
        ],
        1,
        "La versión declarada coincide en ambas copias. Compara la evidencia independiente.",
      ),
      check(
        "decision",
        "¿Qué conclusión está respaldada por los datos de Copia B?",
        [
          "La importación de lectura prueba que realizó un incidente.",
          "La versión declarada certifica el binario completo.",
          "Es una muestra distinta a la del manifiesto y su origen requiere validación.",
        ],
        2,
        "Distingue evidencia de integridad de una conclusión sobre el comportamiento.",
      ),
    ],
    review:
      "Conserva la copia B como evidencia y confirma el canal de distribución. Usa la huella completa y la firma del proveedor en la revisión real de procedencia. Una diferencia justifica investigación.",
  },
  parches: {
    briefing:
      "El aviso interno VANTA-LAB-042 pide actualizar el módulo de catálogos. El criterio de aceptación incluye verificar el cambio y conservar la función de consulta.",
    evidence: [
      table(
        "searchsploit",
        "Índice de avisos ficticios del Archivo",
        ["Aviso", "Componente", "Versión de referencia"],
        [
          ["VANTA-LAB-042", "Catálogos", "Corregido en 2.4"],
          ["VANTA-LAB-063", "Reportes", "Corregido en 3.1"],
        ],
      ),
      table(
        "metasploit",
        "Informe archivado de verificación del cambio",
        [
          "Fase",
          "Versión instalada",
          "Revisión del control",
          "Consulta del catálogo",
        ],
        [
          ["Antes", "2.3", "Pendiente", "Disponible"],
          ["Después, revisión inicial", "2.4", "Conforme", "Fallida"],
          ["Después, revisión final", "2.4", "Conforme", "Disponible"],
        ],
      ),
    ],
    checks: [
      check(
        "criterio",
        "¿Qué fila cumple los dos criterios de aceptación del cambio?",
        ["Después, revisión final.", "Después, revisión inicial.", "Antes."],
        0,
        "Verifica a la vez el control y la función del servicio.",
      ),
      check(
        "evidencia",
        "¿Qué debe conservar el responsable en el informe de cierre?",
        [
          "Solo el nombre de la herramienta de revisión.",
          "El aviso aplicable, la versión instalada y las pruebas del control y de la consulta.",
          "Solo la fecha en que se anunció el cambio.",
        ],
        1,
        "El lector del informe debe poder comprobar las dos condiciones de aceptación.",
      ),
    ],
    review:
      "Cierra el cambio con la revisión final. Registra el aviso, la versión efectiva, el resultado del control y la consulta de aceptación. El primer intento corregía el control y requería recuperar el servicio.",
  },
  incidente: {
    briefing:
      "A las 00:17 dejó de responder el espejo de Vanta. ECO-7 requiere una cronología, una decisión de contención y una copia compartible del informe. Usa el reloj UTC del expediente.",
    evidence: [
      table(
        "volatility",
        "Resumen de procesos de la instantánea ficticia",
        ["Hora UTC", "Proceso", "Procedencia registrada"],
        [
          ["00:15:11", "catalogo-agent", "Manifiesto aprobado"],
          ["00:16:03", "exportador-temp", "Fuera del inventario"],
        ],
      ),
      table(
        "autopsy",
        "Cronología de la imagen forense sintética",
        ["Hora UTC", "Evento", "Referencia"],
        [
          ["00:15:58", "Creación del archivo exportador-temp", "E-17"],
          ["00:16:03", "Inicio del proceso exportador-temp", "E-18"],
          ["00:17:00", "Espejo sin respuesta", "E-19"],
        ],
      ),
      table(
        "exiftool",
        "Metadatos de la captura para compartir",
        ["Campo", "Valor ficticio", "Política"],
        [
          ["Autor", "Operador de guardia", "Identificador interno"],
          ["Ubicación", "Sala de custodia", "Reservada"],
          ["Fecha UTC", "00:17:00", "Incluir en el informe"],
        ],
      ),
    ],
    checks: [
      check(
        "orden",
        "¿Qué secuencia está corroborada por la imagen y la instantánea?",
        [
          "Caída del espejo, creación del archivo, inicio del proceso.",
          "Creación del archivo, inicio del proceso, caída del espejo.",
          "Inicio del proceso, caída del espejo, creación del archivo.",
        ],
        1,
        "Ordena los tres registros por el reloj UTC y coteja E-18 con la instantánea.",
      ),
      check(
        "custodia",
        "¿Qué acción preserva evidencia y contiene el incidente?",
        [
          "Borrar la imagen y conservar solo el resumen.",
          "Publicar la captura original junto con sus metadatos.",
          "Aislar el espejo según el procedimiento y conservar la imagen y la instantánea con sus huellas.",
        ],
        2,
        "El encargo requiere tanto contención como una copia verificable de los originales.",
      ),
      check(
        "copia",
        "¿Qué prepararías para compartir el informe fuera del equipo de guardia?",
        [
          "Una copia con autor y ubicación reservados retirados, y referencias UTC documentadas.",
          "El archivo original con todos sus metadatos.",
          "Una captura que suprima todas las referencias al horario.",
        ],
        0,
        "Aplica la política de cada campo en una copia del material.",
      ),
    ],
    review:
      "Presenta E-17, E-18 y E-19 en orden UTC. La secuencia justifica investigar el proceso fuera del inventario. Registra aislamiento y huellas de los originales, y prepara una copia de informe con los campos reservados retirados.",
  },
};
