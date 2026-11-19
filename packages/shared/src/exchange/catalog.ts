import type { PvpServiceId } from "../pvp/catalog";

export const SATS_PER_BTC = 100_000_000n;
export const MARKET_FEE_PERCENT = 2;
export const SERVICE_FEE_PERCENT = 8;
export const SERVICE_REVIEW_HOURS = 48;
export const SERVICE_RECOVERY_INTEGRITY = 80;
export const SERVICE_RECOVERY_COOLDOWN_MINUTES = 30;
export const MAX_INVENTORY = 80;
export const MAX_PURCHASE_QUANTITY = 10;
export const DUTY_PAYOUTS = [8, 5, 3] as const;
export const DAILY_DUTY_MAX = 16;
export const DUTY_RESERVE_BTC = 144;
export const PVP_REWARD_PAYOUTS = [6, 3] as const;
export const MAX_DAILY_PVP_REWARD = 9;

export const CATALOG = {
  cpu: {
    name: "CPU de operaciones",
    category: "Hardware",
    price: 85,
    use: "equip",
    stock: 1,
    description: "Reduce un 10% el enfriamiento de tus sondas.",
  },
  ssd: {
    name: "SSD de evidencia",
    category: "Hardware",
    price: 72,
    use: "equip",
    stock: 1,
    description:
      "Amplía el registro de operaciones y capturas de 60 a 150 eventos.",
  },
  scanner: {
    name: "Escáner avanzado",
    category: "Programa",
    price: 75,
    use: "equip",
    stock: 1,
    description:
      "Reduce el costo de reconocimiento de 3 a 2 puntos de energía.",
  },
  recovery: {
    name: "Carga de recuperación",
    category: "Consumibles",
    price: 20,
    use: "consume",
    stock: 20,
    description:
      "Restaura hasta 40 de integridad sin gastar energía. Comparte el enfriamiento de reparación.",
  },
  workshop: {
    name: "Taller de huellas digitales",
    category: "Taller",
    price: 35,
    use: "read",
    stock: 1,
    description:
      "Abre un manual de análisis con ejercicios reproducibles en la terminal.",
  },
  case: {
    name: "Chasis Prisma",
    category: "Cosmético",
    price: 15,
    use: "equip",
    stock: 1,
    description: "Personaliza el distintivo de tu equipo en Dispositivo.",
  },
} as const;
export type Sku = keyof typeof CATALOG;
export function isSku(value: unknown): value is Sku {
  return typeof value === "string" && Object.hasOwn(CATALOG, value);
}

export const STORY_EQUIPMENT: Readonly<Record<string, Sku>> = {
  "1.08": "workshop",
  "5.05": "ssd",
};

export const REWARDS = {
  training: {
    name: "Graduación de VNET",
    description: "Completa los seis retos del tutorial.",
    btc: 12,
  },
  vanta: {
    name: "Primera señal de Vanta",
    description: "Cierra el capítulo 1 de Historia.",
    btc: 20,
  },
  market: {
    name: "Recibo recuperado",
    description: "Cierra el capítulo 2 de Historia.",
    btc: 16,
  },
  olvido: {
    name: "Ruta restablecida",
    description: "Cierra el capítulo 3 de Historia.",
    btc: 18,
  },
  archivo: {
    name: "Autorización de auditoría",
    description: "Cierra el capítulo 4 de Historia.",
    btc: 22,
  },
  hielo: {
    name: "Réplica recuperada",
    description: "Cierra el capítulo 5 de Historia.",
    btc: 24,
  },
  final: {
    name: "El caso UNO",
    description: "Cierra el capítulo 6 de Historia.",
    btc: 28,
  },
  academy: {
    name: "Prácticas verificadas",
    description:
      "Cada práctica aprobada acredita una sola vez según su dificultad.",
    btc: 0,
  },
  rival: {
    name: "Reconocimiento de arena",
    description:
      "Hasta dos resultados confirmados por día UTC. El primero paga 6 BTC y el segundo 3 BTC. Cada rival vinculado cuenta una vez por semana UTC.",
    btc: 6,
  },
} as const;
export type RewardId = keyof typeof REWARDS;
export const ACADEMY_PAYOUTS = {
  Básico: 6,
  Intermedio: 8,
  Avanzado: 10,
} as const;

export const SERVICE_KINDS = {
  audit: {
    name: "Auditoría de exposición",
    proof:
      "Revisa los servicios del cliente y entrega un diagnóstico de su configuración.",
    min: 12,
    max: 65,
  },
  analysis: {
    name: "Análisis forense",
    proof:
      "Revisa la evidencia del incidente elegido por el cliente y documenta el hallazgo.",
    min: 16,
    max: 85,
  },
  recovery: {
    name: "Recuperación de emergencia",
    proof:
      "Al liquidar, restaura hasta 80 puntos de integridad sin gastar energía. Cada equipo puede contratar otra recuperación 30 minutos después de recibirla.",
    min: 12,
    max: 45,
  },
  maintenance: {
    name: "Mantenimiento de red",
    proof:
      "Verifica la configuración del servicio autorizado y aplica su parche al liquidar.",
    min: 18,
    max: 95,
  },
} as const;
export type ServiceKind = keyof typeof SERVICE_KINDS;

export const SERVICE_FINDINGS = {
  listening: "Hay servicios configurados para escuchar.",
  quiet: "Todos los servicios están configurados como cerrados.",
  info: "Informativo",
  notice: "Aviso",
  warning: "Advertencia",
  critical: "Crítico",
  repair: "Recuperar integridad",
  web: "Portal web",
  admin: "Administración",
  dns: "Resolución DNS",
} as const;
export type ServiceFinding = keyof typeof SERVICE_FINDINGS;
export type ServiceSeverity = Extract<
  ServiceFinding,
  "info" | "notice" | "warning" | "critical"
>;

export type ServiceScope =
  | {
      kind: "audit";
      services: { id: PvpServiceId; open: boolean; patched: boolean }[];
      tls: boolean;
      isolated: boolean;
    }
  | {
      kind: "analysis";
      incident: {
        id: string;
        at: string;
        summary: string;
        severity: ServiceSeverity;
        sha256: string | null;
      };
    }
  | { kind: "recovery"; integrity: number }
  | { kind: "maintenance"; service: PvpServiceId; open: boolean };

export function findingOptions(kind: ServiceKind): readonly ServiceFinding[] {
  switch (kind) {
    case "audit":
      return ["listening", "quiet"];
    case "analysis":
      return ["info", "notice", "warning", "critical"];
    case "recovery":
      return ["repair"];
    case "maintenance":
      return ["web", "admin", "dns"];
  }
}

export function btcToSats(value: string): bigint | null {
  if (!/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,8})?$/.test(value)) return null;
  const [whole, part = ""] = value.split(".");
  const sats = BigInt(whole!) * SATS_PER_BTC + BigInt(part.padEnd(8, "0"));
  return sats >= SATS_PER_BTC && sats <= 100_000n * SATS_PER_BTC ? sats : null;
}
