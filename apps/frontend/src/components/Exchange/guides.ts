import type { AcademyLessonId, Sku } from "@null-protocol/shared";

type Reference = { title: string; url: string };
const reference = (title: string, url: string): Reference => ({ title, url });
const cis = reference(
  "CIS Controls",
  "https://www.cisecurity.org/controls/cis-controls-list",
);
const logs = reference(
  "CIS Control 8 · Audit Log Management",
  "https://www.cisecurity.org/controls/audit-log-management",
);
const recovery = reference(
  "CIS Control 11 · Data Recovery",
  "https://cas.docs.cisecurity.org/en/latest/source/Controls11/",
);
const incident = reference(
  "NIST SP 800-61 Rev. 3",
  "https://csrc.nist.gov/pubs/sp/800/61/r3/final",
);
const forensics = reference(
  "NIST SP 800-86",
  "https://csrc.nist.gov/pubs/sp/800/86/final",
);
const permissions = reference(
  "OWASP · Authorization",
  "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html",
);
const queries = reference(
  "OWASP · SQL Injection Prevention",
  "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
);
const passwords = reference(
  "OWASP · Password Storage",
  "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
);
const patch = reference(
  "NIST SP 800-40 Rev. 4",
  "https://csrc.nist.gov/pubs/sp/800/40/r4/final",
);
const configuration = reference(
  "CIS Control 4 · Secure Configuration",
  "https://www.cisecurity.org/controls/secure-configuration-of-enterprise-assets-and-software",
);
const wireshark = reference(
  "Wireshark User’s Guide",
  "https://www.wireshark.org/docs/wsug_html_chunked/ChWorkDisplayFilterSection",
);
const checksum = reference(
  "GNU Coreutils · SHA-2",
  "https://www.gnu.org/software/coreutils/manual/coreutils.html#sha2-utilities",
);

type ProductGuide = {
  effect: string;
  summary?: string;
  lesson?: AcademyLessonId;
  steps: readonly string[];
  reference: Reference;
};
export const PRODUCT_GUIDES: Record<Sku, ProductGuide> = {
  cpu: {
    summary:
      "Organiza los registros de texto del expediente por archivo y número de línea.",
    effect: "Abre una cronología de evidencia en el expediente activo.",
    steps: [
      "Equipa la CPU desde Inventario.",
      "En un expediente de Historia, usa dossier para ver los archivos y sus líneas de tiempo.",
    ],
    reference: configuration,
  },
  ssd: {
    summary: "Amplía la cuota de archivos de Historia de 160 a 240 entradas.",
    effect: "Abre la misión 5.05 y amplía la capacidad para tus notas.",
    lesson: "incidente",
    steps: [
      "Conserva el SSD en tu inventario para abrir la misión 5.05.",
      "Puedes guardar hasta 240 documentos y carpetas en Historia mientras lo tengas.",
    ],
    reference: logs,
  },
  scanner: {
    summary: "Compara tu avance con las comprobaciones del expediente activo.",
    effect: "Amplía las pistas del expediente al equiparlo.",
    lesson: "inventario",
    steps: [
      "Equipa el escáner desde Inventario.",
      "Usa hint en un expediente para ver las comprobaciones pendientes.",
    ],
    reference: cis,
  },
  recovery: {
    effect: "Hasta +40 de integridad por unidad.",
    steps: [
      "Abre Inventario cuando tu equipo tenga daño.",
      "Usa una carga y comprueba la integridad en Dispositivo.",
    ],
    reference: recovery,
  },
  workshop: {
    effect: "Manual de integridad y acceso a la misión 1.08.",
    lesson: "binario",
    steps: [
      "Abre el manual desde Inventario.",
      "En Historia, verifica el manifiesto de la misión 1.08 y registra el resultado.",
    ],
    reference: checksum,
  },
  case: {
    effect: "Distintivo visual Chasis Prisma.",
    summary:
      "Personaliza el indicador del equipo del personaje en su terminal.",
    steps: [
      "Equipa el chasis desde Inventario.",
      "Escribe status en la terminal de Historia para ver el distintivo.",
    ],
    reference: configuration,
  },
};

export const PRACTICE_GUIDES: Record<
  AcademyLessonId,
  { art: string; reference: Reference; takeaway: string }
> = {
  inventario: {
    art: "network",
    reference: cis,
    takeaway:
      "Compara servicios observados con el inventario autorizado y justifica una corrección.",
  },
  trafico: {
    art: "traffic",
    reference: wireshark,
    takeaway:
      "Separa metadatos visibles de contenido cifrado en la captura del caso.",
  },
  huella: {
    art: "network",
    reference: cis,
    takeaway:
      "Relaciona activos con sus responsables y limita la información publicada.",
  },
  web: {
    art: "web",
    reference: permissions,
    takeaway:
      "Verifica los controles del portal a partir de las respuestas guardadas.",
  },
  consultas: {
    art: "web",
    reference: queries,
    takeaway:
      "Justifica la separación entre consultas y datos en el informe sintético.",
  },
  autenticacion: {
    art: "identity",
    reference: passwords,
    takeaway:
      "Recomienda medidas de almacenamiento y autenticación usando registros del ejercicio.",
  },
  inalambrica: {
    art: "wireless",
    reference: configuration,
    takeaway:
      "Contrasta los puntos de acceso observados con la política del inventario.",
  },
  directorio: {
    art: "identity",
    reference: permissions,
    takeaway:
      "Identifica permisos heredados y conserva la tarea legítima del equipo.",
  },
  binario: {
    art: "forensics",
    reference: checksum,
    takeaway:
      "Compara la integridad y la procedencia con el manifiesto de referencia.",
  },
  parches: {
    art: "web",
    reference: patch,
    takeaway:
      "Verifica el control corregido y comprueba que el servicio autorizado sigue funcionando.",
  },
  incidente: {
    art: "forensics",
    reference: forensics,
    takeaway:
      "Reconstruye la cronología y documenta cómo conservar la evidencia del caso.",
  },
};
export const incidentReference = incident;
