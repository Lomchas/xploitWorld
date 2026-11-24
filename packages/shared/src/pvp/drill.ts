export const PORTAL_DRILL = {
  portal: {
    label: "El portal responde por HTTPS y cierra HTTP.",
    hint: "Abre el servicio web, activa TLS y permite TCP/443 en tu equipo virtual.",
  },
  patch: {
    label: "El portal funciona con el parche aplicado.",
    hint: "Aplica el parche del portal en Dispositivo y espera a que termine el reinicio.",
  },
  admin: {
    label: "Un visitante sin confianza no puede abrir la administración.",
    hint: "Cierra el servicio de administración o restringe su acceso con VPN o firewall.",
  },
  dns: {
    label: "La resolución DNS sigue disponible para visitantes.",
    hint: "Habilita DNS y permite UDP/53. El equipo debe seguir en línea.",
  },
} as const;
export type DrillCriterion = keyof typeof PORTAL_DRILL;
export interface ArenaDrillResult {
  checks: { id: DrillCriterion; passed: boolean }[];
  completedAt: string | null;
}
