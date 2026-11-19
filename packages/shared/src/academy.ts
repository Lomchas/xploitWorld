export const ACADEMY_LESSONS = [
  {
    id: "inventario",
    title: "El mapa de Vanta",
    tier: "Básico",
    goal: "Relacionar servicios, segmentos y exposición.",
  },
  {
    id: "trafico",
    title: "La sesión en claro",
    tier: "Básico",
    goal: "Interpretar una captura de red y distinguir qué datos quedaron visibles.",
  },
  {
    id: "huella",
    title: "La huella del Archivo",
    tier: "Básico",
    goal: "Relacionar nombres, servicios y contactos en un inventario autorizado.",
  },
  {
    id: "web",
    title: "Las puertas del portal",
    tier: "Intermedio",
    goal: "Revisar cookies y controles de acceso a partir de respuestas archivadas.",
  },
  {
    id: "consultas",
    title: "El formulario de las fichas",
    tier: "Intermedio",
    goal: "Separar los datos del usuario de la estructura de una consulta.",
  },
  {
    id: "autenticacion",
    title: "El relevo de credenciales",
    tier: "Intermedio",
    goal: "Revisar el almacenamiento de contraseñas y las señales de inicio de sesión.",
  },
  {
    id: "inalambrica",
    title: "El puesto de radio",
    tier: "Intermedio",
    goal: "Contrastar un inventario inalámbrico con las políticas de una sede.",
  },
  {
    id: "directorio",
    title: "El permiso heredado",
    tier: "Avanzado",
    goal: "Rastrear permisos efectivos y reducir privilegios sin interrumpir el soporte.",
  },
  {
    id: "binario",
    title: "El manifiesto del agente",
    tier: "Avanzado",
    goal: "Contrastar metadatos de un binario con una distribución autorizada.",
  },
  {
    id: "parches",
    title: "La verificación del cambio",
    tier: "Avanzado",
    goal: "Validar un parche y comprobar que el servicio sigue cumpliendo su función.",
  },
  {
    id: "incidente",
    title: "El informe de las 00:17",
    tier: "Avanzado",
    goal: "Correlacionar registros, preservar evidencia y justificar la contención.",
  },
] as const;

export type AcademyLessonId = (typeof ACADEMY_LESSONS)[number]["id"];
export type AcademyTier = (typeof ACADEMY_LESSONS)[number]["tier"];

export const ACADEMY_TOOLS = [
  {
    id: "nmap",
    name: "Nmap",
    lessonId: "inventario",
    description: "Lee un inventario de servicios de la red virtual.",
  },
  {
    id: "whatweb",
    name: "WhatWeb",
    lessonId: "inventario",
    description: "Interpreta metadatos de servicios web del inventario.",
  },
  {
    id: "wireshark",
    name: "Wireshark",
    lessonId: "trafico",
    description: "Clasifica paquetes de una captura de práctica.",
  },
  {
    id: "tcpdump",
    name: "Tcpdump",
    lessonId: "trafico",
    description: "Lee un resumen de flujos y consulta su alcance.",
  },
  {
    id: "amass",
    name: "Amass",
    lessonId: "huella",
    description: "Relaciona dominios y registros DNS ficticios.",
  },
  {
    id: "theharvester",
    name: "TheHarvester",
    lessonId: "huella",
    description: "Revisa qué datos de contacto publica el Archivo.",
  },
  {
    id: "maltego",
    name: "Maltego",
    lessonId: "huella",
    description: "Cruza entidades, relaciones y propietarios del caso.",
  },
  {
    id: "burp-suite",
    name: "Burp Suite",
    lessonId: "web",
    description: "Lee transacciones HTTP archivadas para revisar una sesión.",
  },
  {
    id: "owasp-zap",
    name: "OWASP ZAP",
    lessonId: "web",
    description: "Contrasta hallazgos web con sus evidencias.",
  },
  {
    id: "gobuster",
    name: "Gobuster",
    lessonId: "web",
    description: "Revisa el inventario autorizado de rutas del portal.",
  },
  {
    id: "nikto",
    name: "Nikto",
    lessonId: "web",
    description: "Interpreta un informe de configuración del servidor web.",
  },
  {
    id: "sqlmap",
    name: "SQLMap",
    lessonId: "consultas",
    description: "Analiza un informe de revisión de consultas y su corrección.",
  },
  {
    id: "hashcat",
    name: "Hashcat",
    lessonId: "autenticacion",
    description: "Revisa un informe de algoritmos de almacenamiento.",
  },
  {
    id: "john",
    name: "John the Ripper",
    lessonId: "autenticacion",
    description: "Interpreta un resumen de la política de contraseñas.",
  },
  {
    id: "hydra",
    name: "Hydra",
    lessonId: "autenticacion",
    description:
      "Analiza intentos sintéticos y evalúa medidas de autenticación.",
  },
  {
    id: "kismet",
    name: "Kismet",
    lessonId: "inalambrica",
    description:
      "Compara el inventario de puntos de acceso con una observación archivada.",
  },
  {
    id: "aircrack-ng",
    name: "Aircrack-ng",
    lessonId: "inalambrica",
    description: "Revisa la postura de cifrado de redes ficticias.",
  },
  {
    id: "bettercap",
    name: "Bettercap",
    lessonId: "inalambrica",
    description:
      "Contrasta observaciones de puerta de enlace con el inventario.",
  },
  {
    id: "bloodhound",
    name: "BloodHound",
    lessonId: "directorio",
    description: "Interpreta relaciones de pertenencia y permisos efectivos.",
  },
  {
    id: "impacket",
    name: "Impacket",
    lessonId: "directorio",
    description: "Revisa un inventario de acceso a recursos compartidos.",
  },
  {
    id: "crackmapexec",
    name: "CrackMapExec",
    lessonId: "directorio",
    description:
      "Lee el informe de roles administrativos de la arena ficticia.",
  },
  {
    id: "ghidra",
    name: "Ghidra",
    lessonId: "binario",
    description:
      "Interpreta metadatos e importaciones preextraídos de muestras inertes.",
  },
  {
    id: "metasploit",
    name: "Metasploit",
    lessonId: "parches",
    description: "Compara registros de verificación de un parche en el juego.",
  },
  {
    id: "searchsploit",
    name: "Searchsploit",
    lessonId: "parches",
    description: "Relaciona versiones con avisos ficticios del Archivo.",
  },
  {
    id: "volatility",
    name: "Volatility",
    lessonId: "incidente",
    description: "Lee un resumen de procesos de una instantánea ficticia.",
  },
  {
    id: "autopsy",
    name: "Autopsy",
    lessonId: "incidente",
    description: "Ordena los eventos de la imagen forense del caso.",
  },
  {
    id: "exiftool",
    name: "ExifTool",
    lessonId: "incidente",
    description:
      "Revisa qué metadatos deben retirarse de una copia para compartir.",
  },
] as const satisfies readonly {
  id: string;
  name: string;
  lessonId: AcademyLessonId;
  description: string;
}[];

export type AcademyToolId = (typeof ACADEMY_TOOLS)[number]["id"];

export interface AcademyProgress {
  id: AcademyLessonId;
  unlocked: boolean;
  attempts: number;
  completedAt: string | null;
}
export interface AcademyState {
  installed: AcademyToolId[];
  progress: AcademyProgress[];
}
export interface AcademyEvidence {
  toolId: AcademyToolId;
  title: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}
export interface AcademyQuestion {
  id: string;
  prompt: string;
  options: readonly string[];
}
export interface AcademyCase {
  briefing: string;
  evidence: AcademyEvidence[];
  questions: AcademyQuestion[];
  review: string | null;
}
export type AcademyAnswers = Record<string, number>;
export interface AcademyResult {
  accepted: boolean;
  feedback: { id: string; correct: boolean; text: string }[];
  review: string | null;
  state: AcademyState;
}

export const isAcademyToolId = (id: unknown): id is AcademyToolId =>
  ACADEMY_TOOLS.some((tool) => tool.id === id);

export const isAcademyLessonId = (id: unknown): id is AcademyLessonId =>
  ACADEMY_LESSONS.some((lesson) => lesson.id === id);
