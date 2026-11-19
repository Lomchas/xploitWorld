import type { Difficulty } from "../types/types";

export const TUTORIAL_MISSIONS = [
  {
    slug: "level-1-basic-commands",
    name: "Tutorial 01 · La señal oculta",
    description:
      "Encuentra una señal dentro de tu directorio personal con ls y cat.",
    difficulty: "EASY",
  },
  {
    slug: "level-2-file-permissions",
    name: "Tutorial 02 · Archivo bajo llave",
    description:
      "Inspecciona permisos y recupera el acceso a un archivo de tu propiedad.",
    difficulty: "EASY",
  },
  {
    slug: "level-3-process-management",
    name: "Tutorial 03 · El proceso intruso",
    description:
      "Identifica el proceso relevo y detén su actividad para liberar el volcado.",
    difficulty: "MEDIUM",
  },
  {
    slug: "level-4-network-basics",
    name: "Tutorial 04 · El relé aislado",
    description:
      "Inspecciona tu interfaz y consulta el relé interno del escenario.",
    difficulty: "MEDIUM",
  },
  {
    slug: "level-5-privilege-escalation",
    name: "Tutorial 05 · Permiso delegado",
    description:
      "Revisa qué lectura privilegiada autorizó el administrador del laboratorio.",
    difficulty: "HARD",
  },
  {
    slug: "level-6-final-challenge",
    name: "Tutorial 06 · El último paquete",
    description: "Sigue el canal en el registro y decodifica el paquete final.",
    difficulty: "HARD",
  },
] as const;

export const CAMPAIGN_CHAPTERS = [
  { number: 1, name: "La ciudad borrada" },
  { number: 2, name: "El Mercado Cero" },
  { number: 3, name: "Protocolo de Olvido" },
  { number: 4, name: "El archivo de UNO" },
  { number: 5, name: "Detrás del hielo" },
  { number: 6, name: "La última línea" },
] as const;

const chapterLevels = [
  [
    [
      "El contrato",
      "Varela entrega acceso de archivista y un plazo de una noche.",
    ],
    [
      "La consola prestada",
      "La credencial permite ver archivos del incidente.",
    ],
    [
      "El mapa de Vanta",
      "El catálogo aparece separado de la consola operativa.",
    ],
    ["Las 00:17", "Dos bitácoras sitúan el corte en momentos distintos."],
    [
      "La sesión en claro",
      "Una sesión archivada conserva datos visibles del portal.",
    ],
    [
      "El estado de la red",
      "La ciudad desaparece del mapa y un servicio del espejo sigue respondiendo.",
    ],
    ["La voz de Alma", "Una huésped reclama su archivo de voz."],
    [
      "El espejo Sur",
      "Un comunicado pide cerrar la investigación por mantenimiento.",
    ],
    [
      "El parte de guardia",
      "Operaciones pide decidir a qué responder primero.",
    ],
    ["El espejo Norte", "La copia auténtica lleva al Mercado Cero."],
  ],
  [
    ["La subasta", "El comerciante ofrece un recuerdo de Alma."],
    [
      "La huella del Archivo",
      "Aparece un dominio público ligado al equipo de turnos.",
    ],
    ["Dos recibos", "Dos documentos atribuyen la venta al mismo archivista."],
    ["El sello de origen", "Un recibo conserva la huella esperada."],
    [
      "El nombre prestado",
      "La cuenta del jugador figura en un registro de sesión ajeno.",
    ],
    [
      "El libro de ofertas",
      "Un contacto de ECO-7 quedó codificado en un archivo del caso.",
    ],
    [
      "La copia de trabajo",
      "El comerciante quiere conservar el documento original.",
    ],
    [
      "La captura pública",
      "Un documento adjunto incluye datos reservados de Alma.",
    ],
    [
      "El comprador de Bruma",
      "El pago conecta al comerciante con un contratista de UNO.",
    ],
    ["La firma en disputa", "El expediente ya permite cuestionar el recibo."],
  ],
  [
    [
      "La orden de borrado",
      "ECO-7 entrega una copia que solo cubre rutas públicas.",
    ],
    [
      "Las puertas del portal",
      "El portal mantiene una sesión y una ruta con controles pendientes.",
    ],
    ["El visitante", "Un visitante obtiene un resumen de reportes internos."],
    [
      "El formulario de las fichas",
      "El informe de SQLMap del caso identifica un problema al construir consultas.",
    ],
    [
      "La cuenta del catálogo",
      "La cuenta del servicio tiene más acceso del necesario.",
    ],
    [
      "El enlace de mantenimiento",
      "Operaciones necesita conservar el canal interno.",
    ],
    [
      "El relevo de credenciales",
      "Una cuenta de guardia aparece en accesos inusuales.",
    ],
    [
      "La función del servicio",
      "Un ajuste mejora el control y afecta la consulta del catálogo.",
    ],
    [
      "El manifiesto de Bruma",
      "La copia de la orden cita una cláusula de continuidad.",
    ],
    ["Vanta vuelve a emitir", "ECO-7 restablece la primera ruta pública."],
  ],
  [
    [
      "El permiso de lectura",
      "La junta concede acceso a un expediente interno de auditoría.",
    ],
    [
      "Treinta y cinco años",
      "La firma histórica de Varela aparece en las guardias del Core.",
    ],
    [
      "El puesto de radio",
      "Un inventario de la sede temporal tiene un activo discrepante.",
    ],
    [
      "El permiso heredado",
      "Un grupo de soporte aparece dentro de administración.",
    ],
    [
      "La tarea de soporte",
      "Retirar acceso excesivo afecta un recurso legítimo si se aplica mal.",
    ],
    [
      "El cambio pendiente",
      "Una solicitud legítima coincide con el horario de la orden de Vanta.",
    ],
    [
      "El manifiesto del agente",
      "Un binario aparece fuera del repositorio aprobado.",
    ],
    [
      "El acta de continuidad",
      "El equipo encuentra el informe que Varela esperaba que firmara la cohorte.",
    ],
    [
      "La ficha del operador",
      "La cabecera y el registro usan formatos de alias distintos.",
    ],
    ["La estación Vértice", "Un anexo ubica el Core detrás del muro de hielo."],
  ],
  [
    [
      "La réplica de auditoría",
      "Se habilita una copia para la investigación del incidente.",
    ],
    [
      "Los dos espejos",
      "Bogotá y Tokio muestran registros con horas y estados distintos.",
    ],
    [
      "Los huéspedes dispersos",
      "Los perfiles siguen en las copias y sus ciudades faltan del índice.",
    ],
    [
      "El proceso de guardia",
      "Una instantánea registra un proceso fuera del inventario.",
    ],
    ["La imagen sellada", "Aparecen dos exportaciones de la orden."],
    [
      "El cerco de la réplica",
      "La orden pendiente amenaza el espejo que aún responde.",
    ],
    [
      "La verificación del cambio",
      "El equipo aplica un parche en una copia de prueba.",
    ],
    [
      "La recuperación ensayada",
      "Dos respaldos recuperan cantidades diferentes de asociaciones.",
    ],
    ["El informe de las 00:17", "El expediente une imagen, memoria y captura."],
    [
      "La segunda autorización",
      "El mismo acceso de emergencia coincide con la orden y el cambio del Core.",
    ],
  ],
  [
    [
      "El relevo de la cohorte",
      "Llega un caso final con horas y activos distintos a los de entrenamiento.",
    ],
    ["Acceso temporal", "La réplica requiere una cuenta para la recuperación."],
    [
      "Dos relojes",
      "Los registros mezclan dos zonas horarias y una copia retrasada.",
    ],
    [
      "La contención",
      "Un control interrumpe el flujo afectado y puede impactar un servicio legítimo.",
    ],
    [
      "Restaurar las asociaciones",
      "La copia preparada reúne huéspedes y ciudad.",
    ],
    [
      "La prueba independiente",
      "Otro estudiante revisa la recuperación desde un perfil distinto.",
    ],
    [
      "El sello de la cabecera",
      "El título del juego aparece en un manifiesto preservado.",
    ],
    [
      "La i perdida",
      "Dos registros explican cómo se escribía el alias fuera de la cabecera.",
    ],
    [
      "Acta de recuperación",
      "La junta espera una decisión antes de restituir Vanta.",
    ],
    [
      "La estación del director",
      "El acta está lista. Queda por recuperar un acuse del caso.",
    ],
  ],
] as const;

const milestones: Readonly<Record<string, string>> = {
  "1.10": "chapter-1-ciudad-borrada",
  "2.10": "chapter-2-mercado-cero",
  "3.10": "chapter-3-protocolo-olvido",
};

export interface CampaignMission {
  chapter: number;
  number: number;
  code: string;
  slug: string;
  name: string;
  description: string;
  difficulty: Difficulty;
}

export const CAMPAIGN_MISSIONS: readonly CampaignMission[] =
  /* @__PURE__ */ chapterLevels.flatMap((levels, index) =>
    levels.map(([name, description], offset): CampaignMission => {
      const chapter = index + 1;
      const number = offset + 1;
      const code = `${chapter}.${String(number).padStart(2, "0")}`;
      return {
        chapter,
        number,
        code,
        slug: milestones[code] ?? `uno-${code.replace(".", "-")}`,
        name: `${code} · ${name}`,
        description,
        difficulty:
          chapter === 1
            ? "EASY"
            : chapter <= 3
              ? "MEDIUM"
              : chapter <= 5
                ? "HARD"
                : "EXPERT",
      };
    }),
  );

export const MISSIONS = [...TUTORIAL_MISSIONS, ...CAMPAIGN_MISSIONS] as const;

export function campaignMission(id: string): CampaignMission | undefined {
  return CAMPAIGN_MISSIONS.find(({ slug, code }) => id === slug || id === code);
}

export function prerequisiteSlugs(slug: string): string[] {
  const index = MISSIONS.findIndex((mission) => mission.slug === slug);
  return index <= 0
    ? []
    : MISSIONS.slice(0, index).map((mission) => mission.slug);
}

export const CAMPAIGN_BRANCHES = [
  { id: "eco-7", name: "ECO-7 y los huéspedes sin ciudad", after: "1.07" },
  { id: "bruma", name: "La segunda firma de Bruma", after: "2.09" },
  { id: "espejos", name: "Los espejos de Bogotá y Tokio", after: "5.02" },
] as const;
export type CampaignBranchId = (typeof CAMPAIGN_BRANCHES)[number]["id"];
