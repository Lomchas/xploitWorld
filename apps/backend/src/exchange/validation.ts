import {
  btcToSats,
  isRecord,
  isSku,
  isPvpServiceId,
  MAX_PURCHASE_QUANTITY,
  SERVICE_FINDINGS,
  type ServiceFinding,
  REWARDS,
  SERVICE_KINDS,
  type ExchangeAction,
  type RewardId,
  type ServiceKind,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isEntityId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9]{20,36}$/.test(value);
const text = (value: unknown, max: number): string | null =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max
    ? value.trim()
    : null;
const price = (value: unknown): value is string =>
  typeof value === "string" && btcToSats(value) !== null;

export function parseExchangeAction(body: unknown): {
  requestId: string;
  action: ExchangeAction;
} {
  if (
    !isRecord(body) ||
    typeof body.requestId !== "string" ||
    !UUID.test(body.requestId) ||
    !isRecord(body.action)
  )
    throw new HttpError(
      400,
      "Se requiere un identificador de operación y una acción válida.",
    );
  const { action: input } = body;
  const { type, id, sku, reward, kind, evidenceId, hours, rating, revision } =
    input;
  let action: ExchangeAction | undefined;
  switch (type) {
    case "shop.buy":
      if (
        isSku(sku) &&
        (input.quantity === undefined ||
          (typeof input.quantity === "number" &&
            Number.isSafeInteger(input.quantity) &&
            input.quantity >= 1 &&
            input.quantity <= MAX_PURCHASE_QUANTITY))
      )
        action = {
          type,
          sku,
          ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
        };
      break;
    case "duty.submit":
      if (
        typeof id === "string" &&
        /^\d{4}-\d{2}-\d{2}:[1-3]$/.test(id) &&
        Array.isArray(input.answers) &&
        input.answers.length === 2 &&
        input.answers.every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 2,
        )
      )
        action = { type, id, answers: [input.answers[0], input.answers[1]] };
      break;
    case "reward.claim":
      if (typeof reward === "string" && Object.hasOwn(REWARDS, reward))
        action = { type, reward: reward as RewardId };
      break;
    case "inventory.equip":
    case "inventory.unequip":
    case "inventory.use":
    case "inventory.read":
    case "market.buy":
    case "market.cancel":
    case "service.pause":
    case "service.refund":
      if (isEntityId(id)) action = { type, id };
      break;
    case "service.hire":
      if (
        isEntityId(id) &&
        typeof revision === "number" &&
        Number.isSafeInteger(revision) &&
        revision >= 0 &&
        (input.service === undefined || isPvpServiceId(input.service)) &&
        (input.incidentId === undefined || isEntityId(input.incidentId))
      )
        action = {
          type,
          id,
          revision,
          ...(input.service === undefined ? {} : { service: input.service }),
          ...(input.incidentId === undefined
            ? {}
            : { incidentId: input.incidentId }),
        };
      break;
    case "market.list":
      if (isEntityId(id) && price(input.price))
        action = { type, id, price: input.price };
      break;
    case "merchant.save": {
      const description = text(input.description, 240);
      if (description) action = { type, description };
      break;
    }
    case "service.offer": {
      const title = text(input.title, 64);
      const description = text(input.description, 280);
      if (
        title &&
        description &&
        typeof kind === "string" &&
        Object.hasOwn(SERVICE_KINDS, kind) &&
        price(input.price) &&
        typeof hours === "number" &&
        Number.isInteger(hours) &&
        hours >= 1 &&
        hours <= 168
      )
        action = {
          type,
          kind: kind as ServiceKind,
          title,
          description,
          price: input.price,
          hours,
        };
      break;
    }
    case "service.report": {
      const report = text(input.report, 800);
      if (
        isEntityId(id) &&
        report &&
        report.length >= 30 &&
        typeof input.finding === "string" &&
        Object.hasOwn(SERVICE_FINDINGS, input.finding)
      )
        action = { type, id, report, finding: input.finding as ServiceFinding };
      break;
    }
    case "service.deliver":
      if (isEntityId(id) && isEntityId(evidenceId))
        action = { type, id, evidenceId };
      break;
    case "service.accept":
      if (
        isEntityId(id) &&
        typeof rating === "number" &&
        Number.isInteger(rating) &&
        rating >= 1 &&
        rating <= 5
      )
        action = { type, id, rating };
      break;
    case "service.dispute": {
      const reason = text(input.reason, 280);
      if (isEntityId(id) && reason) action = { type, id, reason };
      break;
    }
  }
  if (!action || Object.keys(action).length !== Object.keys(input).length)
    throw new HttpError(400, "Parámetros de Exchange inválidos.");
  return { requestId: body.requestId.toLowerCase(), action };
}
