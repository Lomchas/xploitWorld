import { createHash } from "node:crypto";
import {
  PVP_SERVICES,
  type PvpAnalysis,
  type PvpServiceId,
  type PvpSpecimen,
} from "@null-protocol/shared";

const SERVICES = ["web", "admin", "dns"] as const;
const HEADER = Buffer.from([0x4e, 0x50, 0x58, 0x01]);
const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

export function makeSpecimen(service: PvpServiceId): PvpSpecimen {
  const target = SERVICES.indexOf(service) + 1;
  const bytes = Buffer.concat([
    HEADER,
    Buffer.from([0x01, target, 0x02, 0x30 + target, 0x03, 0x01, 0xff, 0x00]),
  ]);
  return { format: "NPX1", hex: bytes.toString("hex"), sha256: sha256(bytes) };
}

/** Static decoder for the game's inert NPX1 instruction format. */
export function analyzeSpecimen(sample: PvpSpecimen): PvpAnalysis {
  if (sample.format !== "NPX1" || !/^(?:[a-f0-9]{2}){8,32}$/.test(sample.hex)) {
    throw new Error("Invalid NPX specimen format");
  }
  const bytes = Buffer.from(sample.hex, "hex");
  if (!bytes.subarray(0, 4).equals(HEADER) || sha256(bytes) !== sample.sha256) {
    throw new Error("Invalid NPX specimen integrity");
  }
  const service = SERVICES[(bytes[5] ?? 0) - 1];
  if (
    !service ||
    bytes[4] !== 0x01 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0
  ) {
    throw new Error("Invalid NPX specimen instructions");
  }
  const instructions: string[] = [];
  for (let index = 4; index < bytes.length; index += 2) {
    const op = bytes[index];
    const argument = bytes[index + 1]!;
    const hex = argument.toString(16).padStart(2, "0");
    const label =
      op === 0x01
        ? `SELECT_SERVICE ${argument}`
        : op === 0x02
          ? `MATCH_MARKER 0x${hex}`
          : op === 0x03
            ? `SIMULATE_PROBE 0x${hex}`
            : op === 0xff && index === bytes.length - 2
              ? "HALT"
              : null;
    if (!label) throw new Error("Unknown NPX opcode");
    instructions.push(
      `${index.toString(16).padStart(4, "0")}  ${op!.toString(16).padStart(2, "0")} ${hex}  ${label}`,
    );
  }
  return {
    signature: `NPX-${service.toUpperCase()}-01`,
    service,
    instructions,
    sha256: sample.sha256,
    remedy: `Aplica el parche de ${PVP_SERVICES[service].name} o cierra su puerto virtual.`,
  };
}
