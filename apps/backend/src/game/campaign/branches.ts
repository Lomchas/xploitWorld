import type { CampaignBranchId } from "@null-protocol/shared";
import { signed, type Scene } from "./scene";

export const BRANCH_SCENES = {
  "eco-7": {
    opening:
      "ECO-7 ofrece devolver la voz de Alma sin reproducirla fuera del canal autorizado. Un segundo reclamante intenta usar el mismo número de lote.",
    task: "Lee la política, verifica la referencia de devolución y registra la referencia, el canal y la verificación de titularidad.",
    files: {
      "devolucion.txt":
        "Entregar por canal ECO-7 después de verificar titularidad. La referencia de entrega es AL-017.",
      ...signed(
        "referencia.txt",
        "AL-017 · titular verificada · canal ECO-7\n",
        "referencia.sha256",
      ),
    },
    commands: ["cat devolucion.txt", "sha256sum -c referencia.sha256"],
    note: ["AL-017", "ECO-7", "titularidad"],
    hint: "Usa el identificador del caso. El número de lote por sí solo no acredita titularidad.",
    ending:
      "ECO-7 registra la devolución autorizada y conserva el acuse para el cierre de Vanta.",
  },
  bruma: {
    opening:
      "Nácar presenta un segundo acuse. Bruma autorizó la retirada de ruta con un encargo de UNO. El recibo de compra solo acredita el movimiento del lote.",
    task: "Verifica el acuse y cruza orden y recibo. Guarda quién encarga, quién firma y qué evidencia acredita el pago.",
    files: {
      ...signed(
        "acuse.txt",
        "OLVIDO · encarga UNO · firma Consorcio Bruma · ruta pública\n",
        "acuse.sha256",
      ),
      "pago.txt":
        "P-412 · lote 017 · movimiento del Mercado Cero · custodio caja de guardia",
    },
    commands: ["sha256sum -c acuse.sha256", "cat acuse.txt", "cat pago.txt"],
    note: ["UNO", "Consorcio Bruma", "OLVIDO", "P-412"],
    hint: "El acuse vincula a UNO y Bruma. El registro de pago confirma P-412.",
    ending:
      "El expediente conserva por separado el encargo, la firma y el pago para que la junta pueda atribuir responsabilidades.",
  },
  espejos: {
    opening:
      "Bogotá y Tokio ofrecen su copia para recuperar la muestra. La guardia necesita una prueba de que la copia elegida conserva el acuse y afecta menos fichas.",
    task: "Lee las ventanas, elige el espejo y verifica el acuse y la pérdida. Documenta tu decisión en el expediente.",
    files: {
      "ventanas.txt":
        "Bogotá · 00:16Z · acuse original · pérdida 1 min\nTokio · 00:22Z · recepción demorada · pérdida 7 min",
    },
    commands: ["cat ventanas.txt"],
    control: {
      name: "espejo",
      initial: "pendiente",
      final: "bogota",
      outcomes: {
        pendiente: { acuse: "Sin verificar", perdida: "Sin medir" },
        bogota: { acuse: "VANTA-016 original", perdida: "1 minuto" },
        tokio: { acuse: "Copia demorada", perdida: "7 minutos" },
      },
      checks: [
        ["bogota", "acuse"],
        ["bogota", "perdida"],
      ],
    },
    note: ["Bogotá", "VANTA-016", "1 minuto"],
    hint: "El acuse original y la menor pérdida corresponden a la misma copia.",
    ending:
      "Bogotá toma la guardia de recuperación. Tokio conserva una copia de revisión y el acta de tiempos.",
  },
} satisfies Record<CampaignBranchId, Scene>;

export const BRANCH_ENDINGS: Record<CampaignBranchId, string> = {
  "eco-7":
    "Alma reconoce su voz en el buzón y confirma a ECO-7 que la devolución llegó.",
  bruma:
    "La auditoría de la junta incorpora la firma de Bruma y el encargo de UNO como pruebas separadas.",
  espejos:
    "Bogotá asume la primera guardia de Vanta y Tokio conserva la copia de revisión.",
};
