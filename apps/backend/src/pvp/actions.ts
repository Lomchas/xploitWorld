import { randomUUID } from "node:crypto";
import type { Prisma, PvpEvent, PvpProfile } from "@prisma/client";
import {
  PVP_ATTACK_COOLDOWN_MS,
  PVP_ENERGY_COST,
  PVP_EVIDENCE_TTL_MS,
  PVP_MAX_RULES,
  PVP_REPAIR_COOLDOWN_MS,
  PVP_SERVICE_RESTART_MS,
  PVP_SERVICES,
  PVP_TOOLS,
  SERVICE_RECOVERY_INTEGRITY,
  type PvpAction,
  type PvpActionResult,
  type PvpDeviceConfig,
  type PvpEventData,
  type PvpEventKind,
  type PvpFlow,
  type PvpProtocol,
  type PvpRuleInput,
  type PvpToolId,
} from "@null-protocol/shared";
import { equipped } from "../exchange/equipment";
import { HttpError } from "../lib/http";
import { openLink, reconcileLinks } from "./links";
import { energyNow, probeHost, scanHost } from "./network";
import { analyzeSpecimen, makeSpecimen } from "./specimens";
import { eventData, toJson, virtualHost } from "./records";
import { readConfig } from "./validation";

interface Turn {
  db: Prisma.TransactionClient;
  actor: PvpProfile;
  config: PvpDeviceConfig;
  changes: Prisma.PvpProfileUpdateInput;
  now: Date;
  storyEquipment: boolean;
}
type ActionSource = "device" | "charge" | "contract";
function requireTool(turn: Turn, tool: PvpToolId): void {
  if (!turn.config.tools.includes(tool))
    throw new HttpError(
      409,
      `Instala ${PVP_TOOLS[tool].name} para usar esta acción.`,
    );
}
function spend(turn: Turn, cost: number): void {
  const energy = energyNow(turn.actor.energy, turn.actor.energyAt, turn.now);
  if (energy < cost)
    throw new HttpError(
      409,
      `Necesitas ${cost} de energía. Se recupera con el tiempo.`,
    );
  turn.changes.energy = energy - cost;
  turn.changes.energyAt = turn.now;
}
function requireNetwork(turn: Turn): void {
  if (turn.config.isolated)
    throw new HttpError(409, "Retira el aislamiento para usar la red.");
  if (turn.actor.integrity === 0)
    throw new HttpError(
      409,
      "Repara tu dispositivo para volver a usar la red.",
    );
}
async function peer(turn: Turn, id: string): Promise<PvpProfile> {
  if (id === turn.actor.id) throw new HttpError(400, "Elige otro dispositivo.");
  const target = await turn.db.pvpProfile.findFirst({
    where: { id, regionId: turn.actor.regionId },
  });
  if (!target)
    throw new HttpError(404, "Dispositivo no encontrado en tu región.");
  return target;
}
async function ownEvent(turn: Turn, id: string): Promise<PvpEvent> {
  const row = await turn.db.pvpEvent.findFirst({
    where: {
      id,
      profileId: turn.actor.id,
      regionId: turn.actor.regionId,
      arenaVisit: turn.actor.arenaVisit,
    },
  });
  if (!row) throw new HttpError(404, "Evidencia no encontrada.");
  return row;
}
function evidenceStart(turn: Turn): Date {
  return new Date(turn.now.getTime() - PVP_EVIDENCE_TTL_MS);
}
async function evidenceSource(
  turn: Turn,
  id: string,
  requireProbe: boolean,
): Promise<PvpProfile> {
  const row = await ownEvent(turn, id);
  const incident = eventData(row).incident;
  if (
    row.kind !== "alert" ||
    !row.peerId ||
    !incident ||
    (requireProbe && incident !== "probe") ||
    row.createdAt < evidenceStart(turn)
  ) {
    throw new HttpError(
      409,
      "Se necesita una alerta IDS reciente con un origen identificado.",
    );
  }
  return peer(turn, row.peerId);
}
async function logEvent(
  turn: Turn,
  profileId: string,
  kind: PvpEventKind,
  data: PvpEventData,
  peerId: string | null = null,
): Promise<void> {
  const { arenaVisit } =
    profileId === turn.actor.id
      ? turn.actor
      : await turn.db.pvpProfile.update({
          where: { id: profileId },
          data: { revision: { increment: 1 } },
          select: { arenaVisit: true },
        });
  await turn.db.pvpEvent.create({
    data: {
      profileId,
      regionId: turn.actor.regionId,
      arenaVisit,
      kind,
      data: toJson(data),
      peerId,
      createdAt: turn.now,
    },
  });
}
async function saveConfig(
  turn: Turn,
  message: string,
): Promise<PvpActionResult> {
  turn.changes.config = toJson(turn.config);
  await logEvent(turn, turn.actor.id, "configuration", {
    message,
    severity: "info",
  });
  return { outcome: "ok", message };
}
function attachedCapture(
  config: PvpDeviceConfig,
  flows: PvpFlow[],
): Pick<PvpEventData, "flows"> {
  return config.tools.includes("capture") ? { flows } : {};
}

async function recordSignal(
  turn: Turn,
  target: PvpProfile,
  kind: "SCAN" | "PROBE" | "COMPROMISE",
): Promise<void> {
  await turn.db.worldSignal.create({
    data: {
      regionId: turn.actor.regionId,
      actorId: turn.actor.id,
      rivalId: target.id,
      actorNode: turn.actor.addressNumber,
      rivalNode: target.addressNumber,
      kind,
      createdAt: turn.now,
    },
  });
}

async function scan(turn: Turn, targetId: string): Promise<PvpActionResult> {
  requireNetwork(turn);
  const target = await peer(turn, targetId);
  spend(
    turn,
    turn.storyEquipment &&
      (await equipped(turn.db, turn.actor.userId, "scanner"))
      ? 2
      : PVP_ENERGY_COST.scan,
  );
  const sourceHost = virtualHost(turn.actor, turn.config);
  const targetHost = virtualHost(target);
  const { ports, flows } = scanHost(sourceHost, targetHost, turn.now);
  await recordSignal(turn, target, "SCAN");
  const message = `Reconocimiento completado sobre ${target.alias}. Las observaciones caducan en 5 minutos.`;
  await logEvent(
    turn,
    turn.actor.id,
    "scan",
    {
      message,
      severity: "info",
      ports,
      ...attachedCapture(turn.config, flows),
    },
    target.id,
  );
  const targetConfig = targetHost.config;
  if (targetConfig.tools.includes("ids")) {
    await logEvent(
      turn,
      target.id,
      "alert",
      {
        message: `IDS: reconocimiento de puertos desde ${turn.actor.alias}.`,
        severity: "notice",
        incident: "recon",
        ...attachedCapture(targetConfig, flows),
      },
      turn.actor.id,
    );
  } else if (targetConfig.tools.includes("capture")) {
    await logEvent(
      turn,
      target.id,
      "probe",
      {
        message: "Tráfico entrante de reconocimiento capturado.",
        severity: "info",
        flows,
      },
      turn.actor.id,
    );
  }
  return { outcome: "ok", message, ports };
}

async function requireScan(
  turn: Turn,
  targetId: string,
  protocol: PvpProtocol,
  port: number,
): Promise<void> {
  const report = await turn.db.pvpEvent.findFirst({
    where: {
      profileId: turn.actor.id,
      regionId: turn.actor.regionId,
      arenaVisit: turn.actor.arenaVisit,
      peerId: targetId,
      kind: "scan",
      createdAt: { gte: evidenceStart(turn) },
    },
    orderBy: { ordinal: "desc" },
  });
  if (
    !report ||
    !eventData(report).ports?.some(
      (p) => p.protocol === protocol && p.port === port && p.state === "open",
    )
  ) {
    throw new HttpError(
      409,
      "Escanea el objetivo y elige un puerto abierto observado recientemente.",
    );
  }
}

async function runProbe(
  turn: Turn,
  target: PvpProfile,
  protocol: PvpProtocol,
  port: number,
  counter: boolean,
): Promise<PvpActionResult> {
  requireNetwork(turn);
  if (turn.actor.attackReadyAt && turn.actor.attackReadyAt > turn.now) {
    throw new HttpError(409, "La sonda todavía está en enfriamiento.");
  }
  if (!counter) await requireScan(turn, target.id, protocol, port);
  spend(turn, counter ? PVP_ENERGY_COST.counter : PVP_ENERGY_COST.exploit);
  turn.changes.attackReadyAt = new Date(
    turn.now.getTime() +
      (turn.storyEquipment &&
      (await equipped(turn.db, turn.actor.userId, "cpu"))
        ? Math.round(PVP_ATTACK_COOLDOWN_MS * 0.9)
        : PVP_ATTACK_COOLDOWN_MS),
  );
  const targetHost = virtualHost(target);
  const { flow, service, damage, patched } = probeHost(
    virtualHost(turn.actor, turn.config),
    targetHost,
    protocol,
    port,
    turn.now,
  );
  const compromised = damage > 0 && damage === target.integrity;
  await recordSignal(turn, target, compromised ? "COMPROMISE" : "PROBE");
  if (damage > 0) {
    await turn.db.pvpProfile.update({
      where: { id: target.id },
      data: { integrity: { decrement: damage } },
    });
    if (compromised) {
      await reconcileLinks(turn.db, target, turn.now);
      turn.changes.score = { increment: 10 };
      turn.changes.compromises = { increment: 1 };
    }
  }
  let message: string;
  if (compromised)
    message = `${target.alias} comprometido. +10 puntos de clasificación.`;
  else if (damage > 0)
    message = `Sonda efectiva contra ${target.alias}. Impacto: ${damage} de integridad.`;
  else if (patched)
    message = "El servicio rechazó la sonda: versión parcheada.";
  else if (flow.state === "filtered")
    message =
      "Tráfico filtrado o equipo aislado. La sonda no llegó al servicio.";
  else if (flow.state === "closed") message = "El puerto virtual está cerrado.";
  else message = "El servicio no tiene una vulnerabilidad en este ejercicio.";
  if (counter) message = "Contraataque: " + message;
  await logEvent(
    turn,
    turn.actor.id,
    "probe",
    {
      message,
      severity: damage > 0 ? "notice" : "info",
      ...attachedCapture(turn.config, [flow]),
    },
    target.id,
  );
  await recordIncomingProbe(
    turn,
    target,
    targetHost.config,
    flow,
    service,
    damage,
    compromised,
  );
  return {
    outcome: compromised ? "compromised" : damage > 0 ? "hit" : "blocked",
    message,
  };
}

async function recordIncomingProbe(
  turn: Turn,
  target: PvpProfile,
  config: PvpDeviceConfig,
  flow: PvpFlow,
  service: ReturnType<typeof probeHost>["service"],
  damage: number,
  compromised: boolean,
): Promise<void> {
  const sensor = config.tools.includes("ids");
  const capture = config.tools.includes("capture");
  if (!sensor && !capture && damage === 0) return;
  const sample =
    service && (damage > 0 || sensor) ? makeSpecimen(service) : undefined;
  const severity = compromised ? "critical" : damage > 0 ? "warning" : "notice";
  const detail =
    damage > 0 ? `Pérdida de integridad: ${damage}.` : "Sonda sin impacto.";
  const message = sensor
    ? `IDS: sonda de ${turn.actor.alias} en ${flow.protocol.toUpperCase()}/${flow.port}. ${detail}`
    : damage > 0
      ? `Verificación del dispositivo. ${detail}`
      : "Sonda entrante capturada sin impacto.";
  await logEvent(
    turn,
    target.id,
    sensor ? "alert" : damage > 0 ? "integrity" : "probe",
    {
      message,
      severity,
      ...(sensor ? { incident: "probe" } : {}),
      ...(sample ? { specimen: sample } : {}),
      ...attachedCapture(config, [flow]),
    },
    sensor || capture ? turn.actor.id : null,
  );
}

function sameRule(left: PvpRuleInput, right: PvpRuleInput): boolean {
  return (
    left.action === right.action &&
    left.protocol === right.protocol &&
    left.port === right.port &&
    left.sourceId === right.sourceId
  );
}
async function addRule(
  turn: Turn,
  rule: PvpRuleInput,
): Promise<PvpActionResult> {
  requireTool(turn, "firewall");
  if (rule.sourceId) await peer(turn, rule.sourceId);
  if (turn.config.rules.some((item) => sameRule(item, rule)))
    throw new HttpError(409, "La regla ya existe.");
  if (turn.config.rules.length >= PVP_MAX_RULES)
    throw new HttpError(409, "El firewall alcanzó su límite de reglas.");
  turn.config.rules.push({ id: randomUUID(), ...rule });
  return saveConfig(turn, "Regla añadida al final de la cadena de entrada.");
}
function ruleIndex(turn: Turn, ruleId: string): number {
  requireTool(turn, "firewall");
  const index = turn.config.rules.findIndex((rule) => rule.id === ruleId);
  if (index === -1) throw new HttpError(404, "Regla no encontrada.");
  return index;
}
async function blockSource(
  turn: Turn,
  eventId: string,
): Promise<PvpActionResult> {
  requireTool(turn, "firewall");
  const source = await evidenceSource(turn, eventId, false);
  const rule: PvpRuleInput = {
    action: "drop",
    protocol: "any",
    port: null,
    sourceId: source.id,
  };
  const index = turn.config.rules.findIndex((item) => sameRule(item, rule));
  if (index < 0 && turn.config.rules.length >= PVP_MAX_RULES)
    throw new HttpError(409, "Libera una regla antes de bloquear el origen.");
  const existing =
    index >= 0 ? turn.config.rules.splice(index, 1)[0] : undefined;
  turn.config.rules.unshift(existing ?? { id: randomUUID(), ...rule });
  return saveConfig(
    turn,
    `Origen ${source.alias} bloqueado con prioridad máxima.`,
  );
}
async function analyze(turn: Turn, eventId: string): Promise<PvpActionResult> {
  requireTool(turn, "analyzer");
  const { specimen } = eventData(await ownEvent(turn, eventId));
  if (!specimen)
    throw new HttpError(409, "Este evento no contiene una muestra NPX.");
  spend(turn, PVP_ENERGY_COST.analyze);
  const analysis = analyzeSpecimen(specimen);
  const message = `Muestra verificada. Firma ${analysis.signature}.`;
  await logEvent(turn, turn.actor.id, "analysis", {
    message,
    severity: "info",
    analysis,
  });
  return { outcome: "ok", message, analysis };
}
async function repair(
  turn: Turn,
  source: ActionSource = "device",
): Promise<PvpActionResult> {
  if (turn.actor.integrity >= 100)
    throw new HttpError(409, "El dispositivo ya tiene toda su integridad.");
  if (
    source !== "contract" &&
    turn.actor.repairReadyAt &&
    turn.actor.repairReadyAt > turn.now
  ) {
    throw new HttpError(409, "La reparación está en enfriamiento.");
  }
  if (source === "device") spend(turn, PVP_ENERGY_COST.repair);
  const gain = source === "contract" ? SERVICE_RECOVERY_INTEGRITY : 40;
  const integrity = Math.min(100, turn.actor.integrity + gain);
  turn.changes.integrity = integrity;
  turn.changes.repairReadyAt = new Date(
    turn.now.getTime() + PVP_REPAIR_COOLDOWN_MS,
  );
  const message =
    source === "contract"
      ? `Recuperación de emergencia aplicada. Integridad del equipo: ${integrity}%.`
      : `Integridad restaurada a ${integrity}%. Las defensas y el saldo se conservan.`;
  await logEvent(turn, turn.actor.id, "repair", {
    message,
    severity: "notice",
  });
  return { outcome: "ok", message };
}

async function dispatch(
  turn: Turn,
  action: PvpAction,
  source: ActionSource,
): Promise<PvpActionResult> {
  switch (action.type) {
    case "scan":
      return scan(turn, action.targetId);
    case "link.open":
      return openLink(
        turn.db,
        turn.actor,
        await peer(turn, action.targetId),
        action.protocol,
        action.port,
        turn.now,
      );
    case "exploit":
      return runProbe(
        turn,
        await peer(turn, action.targetId),
        action.protocol,
        action.port,
        false,
      );
    case "counter":
      requireTool(turn, "ids");
      return runProbe(
        turn,
        await evidenceSource(turn, action.eventId, true),
        action.protocol,
        action.port,
        true,
      );
    case "install":
      if (turn.config.tools.includes(action.tool))
        throw new HttpError(409, "Ese paquete ya está instalado.");
      spend(turn, PVP_ENERGY_COST.install);
      turn.config.tools.push(action.tool);
      return saveConfig(
        turn,
        `Paquete instalado: ${PVP_TOOLS[action.tool].name}.`,
      );
    case "patch":
      if (turn.config.services[action.service].patched)
        throw new HttpError(409, "El servicio ya está parcheado.");
      if (source !== "contract") spend(turn, PVP_ENERGY_COST.patch);
      turn.config.services[action.service].patched = true;
      turn.config.services[action.service].restartUntil = new Date(
        turn.now.getTime() + PVP_SERVICE_RESTART_MS,
      ).toISOString();
      return saveConfig(
        turn,
        `${PVP_SERVICES[action.service].name} actualizado a NullOS 1.1. Reinicio en curso.`,
      );
    case "service":
      turn.config.services[action.service].open = action.open;
      return saveConfig(
        turn,
        `${PVP_SERVICES[action.service].name}: ${action.open ? "abierto" : "cerrado"}.`,
      );
    case "tls":
    case "vpn":
      requireTool(turn, action.type);
      turn.config[action.type] = action.enabled;
      return saveConfig(
        turn,
        `${PVP_TOOLS[action.type].name}: ${action.enabled ? "activo" : "desactivado"}.`,
      );
    case "isolate":
      requireTool(turn, "firewall");
      turn.config.isolated = action.enabled;
      return saveConfig(
        turn,
        action.enabled
          ? "Dispositivo aislado de la red."
          : "Dispositivo reconectado a la red.",
      );
    case "trust":
      requireTool(turn, "vpn");
      if (action.enabled) {
        await peer(turn, action.targetId);
        if (!turn.config.trustedPeers.includes(action.targetId)) {
          if (turn.config.trustedPeers.length >= 16)
            throw new HttpError(409, "Se alcanzó el límite de pares VPN.");
          turn.config.trustedPeers.push(action.targetId);
        }
      } else {
        turn.config.trustedPeers = turn.config.trustedPeers.filter(
          (id) => id !== action.targetId,
        );
      }
      return saveConfig(
        turn,
        action.enabled
          ? "Par agregado a la lista VPN."
          : "Confianza VPN revocada.",
      );
    case "policy":
      requireTool(turn, "firewall");
      turn.config.policy = action.policy;
      return saveConfig(
        turn,
        `Política de entrada: ${action.policy === "allow" ? "permitir" : "descartar"}.`,
      );
    case "rule.add":
      return addRule(turn, action.rule);
    case "rule.remove":
      turn.config.rules.splice(ruleIndex(turn, action.ruleId), 1);
      return saveConfig(turn, "Regla de firewall eliminada.");
    case "rule.move": {
      const index = ruleIndex(turn, action.ruleId);
      const next = index + (action.direction === "up" ? -1 : 1);
      if (next < 0 || next >= turn.config.rules.length)
        throw new HttpError(
          409,
          "La regla ya está en el extremo de la cadena.",
        );
      const [rule] = turn.config.rules.splice(index, 1);
      turn.config.rules.splice(next, 0, rule!);
      return saveConfig(turn, "Prioridad de la regla actualizada.");
    }
    case "analyze":
      return analyze(turn, action.eventId);
    case "block":
      return blockSource(turn, action.eventId);
    case "ack": {
      const event = await ownEvent(turn, action.eventId);
      if (!event.acknowledgedAt)
        await turn.db.pvpEvent.update({
          where: { id: event.id },
          data: { acknowledgedAt: turn.now },
        });
      return { outcome: "ok", message: "Evento marcado como leído." };
    }
    case "repair":
      return repair(turn, source);
  }
}

export async function executeTurn(
  db: Prisma.TransactionClient,
  actor: PvpProfile,
  action: PvpAction,
  now: Date,
  source: ActionSource = "device",
  storyEquipment = true,
): Promise<PvpActionResult> {
  const turn: Turn = {
    db,
    actor,
    config: readConfig(actor.config),
    changes: { revision: { increment: 1 } },
    now,
    storyEquipment,
  };
  const result = await dispatch(turn, action, source);
  await db.pvpProfile.update({
    where: { id: actor.id },
    data: turn.changes,
  });
  if (turn.changes.config) await reconcileLinks(db, actor, now);
  return result;
}
