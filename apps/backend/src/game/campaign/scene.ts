import { type Translator } from "@null-protocol/shared";
import { sha256 } from "../scenarios";

export interface Control {
  name: string;
  initial: string;
  final: string;
  outcomes: Readonly<Record<string, Readonly<Record<string, string>>>>;
  checks: readonly (readonly [setting: string, probe: string])[];
  ordered?: boolean;
}

interface Bonus {
  points: number;
  terms: readonly string[];
}

export interface Scene {
  opening: string;
  task: string;
  files: Readonly<Record<string, string>>;
  commands?: readonly (string | { raw: string; exitCode: number })[];
  answer?: string;
  caseSensitive?: boolean;
  delegated?: string;
  alias?: boolean;
  note?: readonly string[];
  chronology?: readonly string[];
  control?: Control;
  grade?: { base: number; bonus?: readonly Bonus[] };
  hint: string;
  ending: string;
}

export function signed(path: string, content: string, manifest: string) {
  return { [path]: content, [manifest]: sha256(content) + "  " + path + "\n" };
}

export function sceneBrief(scene: Scene, id: string, t: Translator): string {
  return [
    t(scene.opening),
    "",
    t(scene.task),
    ...(scene.note
      ? [
          "",
          t("Evidencia: ~/trabajo/uno/{id}.txt", { id }),
          t(
            "Usa echo <archivo> para abrir el editor. También puedes escribir con > y >>.",
          ),
        ]
      : []),
    "",
    scene.answer
      ? t("Entrega tu conclusión con check <respuesta>.")
      : t("Cuando tengas la evidencia, ejecuta check."),
    t("Usa hint si necesitas una pista."),
  ].join("\n");
}
