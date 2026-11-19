import { createHash } from "node:crypto";
import {
  DUTY_RESERVE_BTC,
  DUTY_PAYOUTS,
  SATS_PER_BTC,
  type DutyBoard,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import { moveBalance, type Tx } from "./ledger";
import { utcDay, utcStart } from "./rewards";

const RETRY_MS = 30_000;
const cases = [
  {
    title: "La copia del catálogo",
    briefing:
      "El informe indica que el respaldo A pierde 9 minutos y restaura en 6. El B pierde 2 y restaura en 8. El objetivo admite perder 3 minutos y recuperar en 10.",
    questions: [
      {
        prompt: "¿Qué respaldo cumple ambos objetivos?",
        options: ["Respaldo B", "Respaldo A", "Ambos respaldos"],
      },
      {
        prompt: "¿Qué verifica la recuperación?",
        options: [
          "Comparar los datos restaurados con la muestra autorizada.",
          "Cerrar el ticket cuando la copia termine.",
          "Conservar únicamente el tiempo de restauración.",
        ],
      },
    ],
  },
  {
    title: "El acceso del proveedor",
    briefing:
      "Soporte necesita consultar un manual. Su cuenta heredó permiso para modificar producción y puede leer la copia de trabajo.",
    questions: [
      {
        prompt: "¿Qué permisos deben quedar?",
        options: [
          "Lectura del manual durante la intervención.",
          "Administración de producción sin vencimiento.",
          "Acceso de escritura a todos los archivos.",
        ],
      },
      {
        prompt: "¿Qué resultado confirma el ajuste?",
        options: [
          "La lectura funciona y un cambio de producción se deniega.",
          "La cuenta conserva el permiso heredado.",
          "El manual deja de estar disponible.",
        ],
      },
    ],
  },
  {
    title: "El turno de medianoche",
    briefing:
      "La bitácora A registra una orden a las 19:12 UTC−05:00. La bitácora B registra la caída a las 00:16 UTC del día siguiente.",
    questions: [
      {
        prompt: "¿A qué hora UTC se emitió la orden?",
        options: ["00:12 UTC", "19:12 UTC", "00:16 UTC"],
      },
      {
        prompt: "¿Qué puedes afirmar con esas dos entradas?",
        options: [
          "La orden precede a la caída por cuatro minutos.",
          "La orden causó la caída por sí sola.",
          "Ambas entradas ocurrieron al mismo tiempo.",
        ],
      },
    ],
  },
  {
    title: "El registro bajo custodia",
    briefing:
      "La guardia entregó un registro firmado y una copia de trabajo. El archivo original contiene datos personales de usuarios.",
    questions: [
      {
        prompt: "¿Sobre qué archivo debes trabajar?",
        options: [
          "La copia de trabajo verificada.",
          "El único original firmado.",
          "Una captura sin referencias.",
        ],
      },
      {
        prompt: "¿Qué debe conservar el informe que se va a compartir?",
        options: [
          "Referencias y horas verificables, con los datos personales retirados.",
          "El registro original completo.",
          "Solo los nombres de los usuarios afectados.",
        ],
      },
    ],
  },
  {
    title: "El parche de mantenimiento",
    briefing:
      "Una réplica con el parche actualizado rechaza entradas no válidas, pero el catálogo de lectura devuelve un error.",
    questions: [
      {
        prompt: "¿Qué falta antes de aceptar el cambio?",
        options: [
          "Restaurar la consulta legítima y repetir ambas comprobaciones.",
          "Aprobar el cambio por la versión instalada.",
          "Cerrar el catálogo de forma permanente.",
        ],
      },
      {
        prompt: "¿Qué debes registrar?",
        options: [
          "Versión aplicada, control verificado y resultado del servicio.",
          "Solo el nombre del proveedor.",
          "La fecha de publicación del aviso sin resultados.",
        ],
      },
    ],
  },
  {
    title: "El canal de coordinación",
    briefing:
      "La réplica está recibiendo órdenes repetidas. El equipo tiene un canal separado que usa para coordinar la respuesta.",
    questions: [
      {
        prompt: "¿Qué acción protege el canal de coordinación?",
        options: [
          "Aislar el flujo afectado y verificar el canal por separado.",
          "Apagar todos los canales del equipo.",
          "Reiniciar la réplica sin conservar la bitácora.",
        ],
      },
      {
        prompt: "¿Qué pruebas permiten cerrar la contención?",
        options: [
          "El flujo afectado se detiene y el canal autorizado sigue disponible.",
          "La alarma desaparece sin más comprobaciones.",
          "El canal autorizado deja de responder.",
        ],
      },
    ],
  },
] as const;

function assignment(userId: string, day: string, stage: number) {
  const key = createHash("sha256")
    .update(userId + ":" + day)
    .digest();
  const source = cases[(key[0]! + stage) % cases.length]!;
  const questions = source.questions.map(({ prompt, options }, index) => {
    const offset = key[1 + stage * 2 + index]! % options.length;
    return {
      prompt,
      options: [...options.slice(offset), ...options.slice(0, offset)],
      correct: (options.length - offset) % options.length,
    };
  });
  return {
    id: day + ":" + (stage + 1),
    title: source.title,
    briefing: source.briefing,
    questions,
  };
}

async function dutyStatus(
  tx: Tx,
  userId: string,
  day: string,
  includeDeposits: boolean,
) {
  const [wallet, held, paid] = await Promise.all([
    tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { balanceSats: true },
    }),
    includeDeposits
      ? tx.serviceContract.aggregate({
          where: {
            client: { userId },
            state: { in: ["HIRED", "DELIVERED", "DISPUTED"] },
          },
          _sum: { priceSats: true },
        })
      : null,
    tx.walletEntry.aggregate({
      where: {
        userId,
        kind: "reward-duty",
        reference: { startsWith: "duty:" + day + ":" },
      },
      _count: true,
      _sum: { deltaSats: true },
    }),
  ]);
  const headroom =
    BigInt(DUTY_RESERVE_BTC) * SATS_PER_BTC -
    wallet.balanceSats -
    (held?._sum.priceSats ?? 0n);
  const stage = paid._count;
  const max = DUTY_PAYOUTS[stage] ?? 0;
  const available =
    headroom < SATS_PER_BTC ? 0 : Number(headroom / SATS_PER_BTC);
  return {
    stage,
    earned: Number((paid._sum.deltaSats ?? 0n) / SATS_PER_BTC),
    reward: Math.min(max, available),
    reserveReached: max > 0 && available === 0,
  };
}

export async function readDuty(
  tx: Tx,
  userId: string,
  now: Date,
  includeDeposits = true,
): Promise<DutyBoard> {
  const day = utcDay(now);
  const [status, attempt] = await Promise.all([
    dutyStatus(tx, userId, day, includeDeposits),
    tx.dutyAttempt.findUnique({ where: { userId } }),
  ]);
  const { stage, reward, earned, reserveReached } = status;
  const work = reward > 0 ? assignment(userId, day, stage) : null;
  return {
    day,
    earned,
    reserveReached,
    next: work
      ? {
          id: work.id,
          title: work.title,
          briefing: work.briefing,
          reward,
          questions: work.questions.map(({ prompt, options }) => ({
            prompt,
            options,
          })),
        }
      : null,
    retryAt:
      attempt?.day === day && attempt.stage === stage && attempt.retryAt > now
        ? attempt.retryAt.toISOString()
        : null,
  };
}

export async function submitDuty(
  tx: Tx,
  userId: string,
  id: string,
  answers: [number, number],
  now: Date,
  includeDeposits = true,
) {
  const day = utcDay(now);
  const { stage, reward, reserveReached } = await dutyStatus(
    tx,
    userId,
    day,
    includeDeposits,
  );
  if (reserveReached)
    throw new HttpError(
      409,
      "Ya alcanzaste la reserva de las guardias defensivas.",
    );
  if (!reward) throw new HttpError(409, "Ya completaste las guardias de hoy.");
  const work = assignment(userId, day, stage);
  if (work.id !== id)
    throw new HttpError(409, "La guardia cambió. Actualiza la mesa.");
  const attempt = await tx.dutyAttempt.findUnique({ where: { userId } });
  if (attempt?.day === day && attempt.stage === stage && attempt.retryAt > now)
    throw new HttpError(429, "Espera antes de enviar otra respuesta.");
  if (
    !work.questions.every(
      (question, index) => question.correct === answers[index],
    )
  ) {
    const retryAt = new Date(
      Math.min(now.getTime() + RETRY_MS, utcStart(day).getTime() + 86_400_000),
    );
    const data = { day, stage, retryAt };
    await tx.dutyAttempt.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return {
      accepted: false,
      message:
        "Revisa las dos respuestas. Puedes volver a intentarlo en 30 segundos.",
    };
  }
  await moveBalance(
    tx,
    userId,
    BigInt(reward) * SATS_PER_BTC,
    "reward-duty",
    "duty:" + id,
    now,
  );
  return { accepted: true, message: `Guardia aprobada · ${reward} BTC.` };
}
