import { backendTranslator } from "../../locales";
import type { PrismaClient } from "@prisma/client";
import {
  CAMPAIGN_BRANCHES,
  CAMPAIGN_CHAPTERS,
  CATALOG,
  STORY_EQUIPMENT,
  MISSIONS,
  VIRTUAL_HOME,
  WORKSPACE_ROOT,
  campaignMission,
  prerequisiteSlugs,
  resolveVirtualPath,
  tokenizeCommand,
  type CmdResponsePayload,
  type ParsedCommand,
  type Locale,
  type Sku,
} from "@null-protocol/shared";
import { equipped } from "../../exchange/equipment";
import { HttpError } from "../../lib/http";
import { executeWorkspaceCommand } from "../../workspace/shell";
import type { WorkspaceService } from "../../workspace/service";
import { completedSlugs } from "../progression";
import type { VirtualShell } from "../shell";
import { ARCHIVO } from "./archivo";
import { BRANCH_ENDINGS, BRANCH_SCENES } from "./branches";
import { DIRECTOR_ALIAS, DIRECTOR_FILES, finalScenes } from "./final";
import { HIELO } from "./hielo";
import { MERCADO } from "./mercado";
import { OLVIDO } from "./olvido";
import {
  beginRetake,
  campaignReport,
  certificateView,
  completeScene,
  gradeSummary,
  variantFor,
  type SceneTarget,
} from "./progress";
import { sceneBrief, type Scene } from "./scene";
import { VANTA } from "./vanta";

const MAIN_SCENES: Readonly<Record<string, Scene>> = {
  ...VANTA,
  ...MERCADO,
  ...OLVIDO,
  ...ARCHIVO,
  ...HIELO,
};

const FINAL = campaignMission("6.10")!;
const FILE_ARGS: Readonly<Record<string, number>> = {
  cat: 0,
  grep: 1,
  stat: 0,
  base64: 0,
  sha256sum: 0,
  sudo: 1,
};

function observationKey(parsed: ParsedCommand, cwd: string, exitCode: number) {
  const { command, args, flags } = parsed;
  const offset = FILE_ARGS[command];
  const argumentsWithPaths = args.map((value, index) =>
    offset !== undefined && index >= offset
      ? resolveVirtualPath(value, cwd)
      : value,
  );
  return JSON.stringify([
    command,
    argumentsWithPaths,
    Object.keys(flags).sort(),
    command === "sha256sum" && flags.c ? cwd : null,
    exitCode,
  ]);
}

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
const noteText = (value: string) =>
  normalized(value).replace(/([:;,=]) (?=[a-z])/g, " ");
const english = backendTranslator("en");
const termForms = (term: string) => [noteText(term), noteText(english(term))];
const includesTerms = (value: string, terms: readonly string[]) =>
  terms.every((term) => termForms(term).some((form) => value.includes(form)));

function inSequence(value: string, terms: readonly string[]): boolean {
  let offset = 0;
  for (const term of terms) {
    const matches = termForms(term)
      .map((form) => ({
        start: value.indexOf(form, offset),
        size: form.length,
      }))
      .filter(({ start }) => start >= 0)
      .sort((a, b) => a.start - b.start);
    const first = matches[0];
    if (!first) return false;
    offset = first.start + first.size;
  }
  return true;
}

interface ActiveScene {
  target: SceneTarget;
  scene: Scene;
  title: string;
  attempt: number;
  expected: Map<string, string>;
  observed: Set<string>;
  setting: string | undefined;
  tests: Set<string>;
  orderedTests: number;
  aliasOpened: boolean;
}

export class CampaignSession {
  private active: ActiveScene | null = null;
  private t = backendTranslator("es");

  constructor(
    private readonly db: PrismaClient,
    private readonly userId: string,
    private readonly shell: VirtualShell,
    private readonly workspace: WorkspaceService,
  ) {}

  private reply(
    output: string,
    exitCode = 0,
    progressChanged = false,
  ): CmdResponsePayload {
    return {
      output: this.t(output),
      exitCode,
      cwd: this.shell.directory,
      ...(progressChanged ? { progressChanged } : {}),
    };
  }

  async execute(
    raw: string,
    locale: Locale = "es",
  ): Promise<CmdResponsePayload> {
    this.t = backendTranslator(locale);
    this.shell.setLocale(locale);
    const parsed = tokenizeCommand(raw);
    if (parsed.error) return this.reply(parsed.error, 2);
    const { command, args } = parsed;
    try {
      switch (command) {
        case "mission":
          if (args.length > 1)
            return this.reply("Uso: mission [continuar|código|slug]", 2);
          if (!args[0]) {
            return this.active
              ? this.reply(
                  this.active.title +
                    "\n\n" +
                    sceneBrief(
                      this.active.scene,
                      this.active.target.code,
                      this.t,
                    ),
                )
              : this.reply(
                  "Abre el encargo con cat README.txt o usa mission continuar.",
                );
          }
          return await this.loadMission(args[0]);
        case "branch":
          if (args.length > 1) return this.reply("Uso: branch [id]", 2);
          return await this.branch(args[0]);
        case "hint": {
          if (args.length) return this.reply("Uso: hint", 2);
          const active = this.active;
          const hint =
            active?.scene.hint ??
            "Lee cat README.txt para conocer la pista del tutorial.";
          if (!active || !(await equipped(this.db, this.userId, "scanner")))
            return this.reply(hint);
          const checks = [...active.expected]
            .filter(([key]) => !active.observed.has(key))
            .map(([, raw]) => raw);
          return this.reply(
            this.t(hint) +
              (checks.length
                ? "\n" +
                  this.t("Comprobaciones pendientes") +
                  "\n" +
                  checks.join("\n")
                : ""),
          );
        }
        case "dossier": {
          if (args.length) return this.reply("Uso: dossier", 2);
          if (!this.active)
            return this.reply("Abre un expediente de Historia primero.", 1);
          if (!(await equipped(this.db, this.userId, "cpu")))
            return this.reply(
              "Equipa la CPU de operaciones en Exchange para abrir el dossier.",
              1,
            );
          const files = Object.entries(this.active.scene.files).filter(
            ([name]) => name.endsWith(".log"),
          );
          return this.reply(
            files.length
              ? files
                  .map(
                    ([name, body]) =>
                      name +
                      "\n" +
                      body
                        .trim()
                        .split("\n")
                        .map(
                          (line, index) =>
                            String(index + 1) + "  " + this.t(line),
                        )
                        .join("\n"),
                  )
                  .join("\n\n")
              : this.t("Este expediente no tiene registros .log.") +
                  "\n" +
                  Object.keys(this.active.scene.files).join("\n"),
          );
        }
        case "set":
        case "test":
          return this.control(command, args);
        case "submit":
          return this.openDirector(args);
        case "check":
          return await this.check(args);
        case "certificado":
        case "certificate":
          return await this.certificate(args);
        case "epilogo":
        case "epilogue":
          if (args.length) return this.reply("Uso: epilogo", 2);
          return await this.epilogue();
        default: {
          const cwd = this.shell.directory;
          const result = await executeWorkspaceCommand(
            this.workspace,
            this.userId,
            this.shell,
            raw,
          );
          if (this.active) {
            const key = observationKey(parsed, cwd, result.exitCode);
            if (this.active.expected.has(key)) this.active.observed.add(key);
          }
          return result.exitCode
            ? { ...result, output: this.t(result.output) }
            : result;
        }
      }
    } catch (error: unknown) {
      if (error instanceof HttpError) return this.reply(error.message, 1);
      throw error;
    }
  }

  private start(
    scene: Scene,
    target: SceneTarget,
    title: string,
    attempt: number,
  ) {
    const expected = new Map<string, string>();
    for (const item of scene.commands ?? []) {
      const raw = typeof item === "string" ? item : item.raw;
      const exitCode = typeof item === "string" ? 0 : item.exitCode;
      expected.set(
        observationKey(tokenizeCommand(raw), VIRTUAL_HOME, exitCode),
        raw,
      );
    }
    this.active = {
      target,
      scene,
      title,
      attempt,
      expected,
      observed: new Set(),
      setting: scene.control?.initial,
      tests: new Set(),
      orderedTests: 0,
      aliasOpened: false,
    };
    this.shell.openMission(
      target.kind === "mission" ? target.slug : target.code,
      null,
      Object.entries({
        "README.txt": sceneBrief(scene, target.code, this.t),
        ...scene.files,
      }).map(([name, content]) => ({
        path: VIRTUAL_HOME + "/" + name,
        content,
        owner: "root" as const,
        mode: scene.delegated === name ? 0o600 : 0o644,
      })),
      scene.delegated ? VIRTUAL_HOME + "/" + scene.delegated : null,
    );
    return this.reply(title + "\n\n" + sceneBrief(scene, target.code, this.t));
  }

  private async loadMission(requested: string) {
    const done = await completedSlugs(this.db, this.userId);
    let id = requested;
    if (id === "continuar" || id === "continue") {
      const next = MISSIONS.find(({ slug }) => !done.has(slug));
      if (next) id = next.slug;
      else {
        const run = await this.db.campaignRun.findUnique({
          where: { userId: this.userId },
        });
        const report = campaignReport(run);
        if (report.pending[0]) id = report.pending[0];
        else if (!run?.reviewed) id = FINAL.code;
        else
          return this.reply("Historia completada. Usa epilogo o certificado.");
      }
    }
    const mission = campaignMission(id);
    const slug = mission?.slug ?? id;
    if (!MISSIONS.some((item) => item.slug === slug))
      return this.reply("Escenario no disponible. Usa levels.", 1);
    if (
      !done.has(slug) &&
      !prerequisiteSlugs(slug).every((item) => done.has(item))
    )
      return this.reply(
        "Misión bloqueada. Completa las anteriores o usa mission continuar.",
        1,
      );
    const equipment =
      mission && !done.has(slug) ? STORY_EQUIPMENT[mission.code] : undefined;
    if (equipment && !(await this.ownsEquipment(equipment)))
      return this.blockedByEquipment(mission!.code, equipment);
    const level = await this.db.level.findFirst({
      where: { slug, isActive: true },
      select: { id: true, name: true, description: true, flag: true },
    });
    if (!level)
      return this.reply(
        "Escenario no disponible. Carga los niveles con pnpm prisma:seed.",
        1,
      );
    if (!mission) {
      this.active = null;
      this.shell.openMission(slug, level.flag);
      return this.reply(
        this.t(level.name) +
          "\n" +
          this.t(level.description) +
          this.t("\nAbre el encargo con cat README.txt."),
      );
    }
    let attempt = 0;
    let scene = MAIN_SCENES[mission.code];
    if (mission.chapter === 6) {
      const run = await this.db.campaignRun.findUnique({
        where: { userId: this.userId },
        select: { attempt: true },
      });
      attempt = run?.attempt ?? 0;
      scene = finalScenes(variantFor(this.userId, attempt))[mission.code];
    }
    if (!scene) return this.reply("El caso todavía no está disponible.", 1);
    const chapter = CAMPAIGN_CHAPTERS[mission.chapter - 1]!;
    return this.start(
      scene,
      { kind: "mission", code: mission.code, slug, levelId: level.id },
      this.t("Capítulo {number} · {name}", {
        number: chapter.number,
        name: this.t(chapter.name),
      }) +
        "\n" +
        this.t(level.name),
      attempt,
    );
  }

  private async branch(id?: string) {
    const [done, run] = await Promise.all([
      completedSlugs(this.db, this.userId),
      this.db.campaignRun.findUnique({
        where: { userId: this.userId },
        select: { branches: true },
      }),
    ]);
    if (!id)
      return this.reply(
        CAMPAIGN_BRANCHES.map(
          (branch) =>
            `${branch.id} · ${this.t(branch.name)} · ${run?.branches.includes(branch.id) ? this.t("completada") : done.has(campaignMission(branch.after)!.slug) ? this.t("disponible") : this.t("se abre tras ") + branch.after}`,
        ).join("\n") +
          this.t("\n\nAbre una historia secundaria con branch <id>."),
      );
    const branch = CAMPAIGN_BRANCHES.find((item) => item.id === id);
    if (!branch)
      return this.reply("Historia secundaria desconocida. Usa branch.", 1);
    if (!done.has(campaignMission(branch.after)!.slug))
      return this.reply(
        this.t("Historia secundaria bloqueada hasta ") + branch.after + ".",
        1,
      );
    return this.start(
      BRANCH_SCENES[branch.id],
      { kind: "branch", code: branch.id },
      this.t(branch.name),
      0,
    );
  }

  private control(command: "set" | "test", args: string[]) {
    const active = this.active;
    const control = active?.scene.control;
    if (!active || !control || active.setting === undefined)
      return this.reply(
        "El escenario actual no tiene controles para ajustar.",
        1,
      );
    const [first, second] = args;
    if (command === "set") {
      if (!first) {
        return this.reply(
          [
            `${control.name} = ${active.setting}`,
            this.t("Valores: {values}", {
              values: Object.keys(control.outcomes).join(", "),
            }),
            this.t("Uso: set {name} <valor>", { name: control.name }),
          ].join("\n"),
        );
      }
      if (
        args.length !== 2 ||
        first !== control.name ||
        !second ||
        !Object.hasOwn(control.outcomes, second)
      )
        return this.reply(
          "Ajuste inválido. Usa set para ver los valores disponibles.",
          2,
        );
      const previous = active.setting;
      active.setting = second;
      return this.reply(
        this.t(
          "{name}: {previous} → {next}. Usa test para ver las comprobaciones.",
          { name: control.name, previous, next: second },
        ),
      );
    }
    const probes = control.outcomes[active.setting]!;
    if (!first)
      return this.reply(
        this.t("Pruebas disponibles: ") + Object.keys(probes).join(", "),
      );
    if (args.length !== 1 || !Object.hasOwn(probes, first))
      return this.reply(
        "Prueba desconocida. Usa test para listar opciones.",
        2,
      );
    const current = control.checks[active.orderedTests];
    if (current?.[0] === active.setting && current[1] === first)
      active.orderedTests++;
    active.tests.add(active.setting + ":" + first);
    return this.reply(
      `[${active.setting}] ${first}: ${this.t(probes[first]!)}`,
    );
  }

  private openDirector(args: string[]) {
    const active = this.active;
    if (!active?.scene.alias)
      return this.reply(
        "Entrega una flag del tutorial con submit <slug> <flag>. En la campaña usa check.",
        1,
      );
    const candidate =
      args.length === 1
        ? args[0]
        : args.length === 2 &&
            campaignMission(args[0] ?? "")?.code === FINAL.code
          ? args[1]
          : undefined;
    if (!candidate) return this.reply("Uso: submit <alias>", 2);
    if (candidate !== DIRECTOR_ALIAS)
      return this.reply(
        "El alias no coincide con el registro. Consulta hint.",
        1,
      );
    this.shell.addSceneFiles(
      Object.entries(DIRECTOR_FILES).map(([name, content]) => ({
        path: VIRTUAL_HOME + "/" + name,
        content,
        owner: "root",
      })),
    );
    active.aliasOpened = true;
    return this.reply(
      "Alias confirmado. Copia virtual del PC montada en ~/director. Revisa el acuse y la actividad antes de cerrar el expediente.",
    );
  }

  private ownsEquipment(sku: Sku) {
    return this.db.inventoryItem.findFirst({
      where: { userId: this.userId, sku, state: { in: ["READY", "EQUIPPED"] } },
      select: { id: true },
    });
  }

  private blockedByEquipment(code: string, sku: Sku): CmdResponsePayload {
    return {
      ...this.reply(
        this.t(
          "La misión {code} requiere {item} ({price} BTC). Abre Exchange para comprarlo o completa una guardia defensiva si te faltan fondos.",
          { code, item: this.t(CATALOG[sku].name), price: CATALOG[sku].price },
        ),
        1,
      ),
      requiredItem: sku,
    };
  }

  private async check(args: string[]) {
    const active = this.active;
    if (!active)
      return this.reply(
        "Entrega la flag del tutorial con submit <slug> <flag>.",
        1,
      );
    const { scene, target } = active;
    const equipment =
      target.kind === "mission" ? STORY_EQUIPMENT[target.code] : undefined;
    if (
      equipment &&
      !(await this.ownsEquipment(equipment)) &&
      !(await completedSlugs(this.db, this.userId)).has(
        target.kind === "mission" ? target.slug : "",
      )
    )
      return this.blockedByEquipment(target.code, equipment);
    if (scene.alias && !active.aliasOpened)
      return this.reply("Primero abre la copia con submit <alias>.", 1);
    if (scene.answer) {
      if (!args.length)
        return this.reply(
          "Uso: check <respuesta>. Consulta el encargo con mission.",
          2,
        );
      const actual = args.join(" ");
      const correct = scene.caseSensitive
        ? actual === scene.answer
        : [scene.answer, english(scene.answer)].some(
            (answer) => normalized(actual) === normalized(answer),
          );
      if (!correct)
        return this.reply(
          "La conclusión no coincide con las evidencias. Usa hint para revisar la pista.",
          1,
        );
    } else if (args.length) {
      return this.reply("Uso: check", 2);
    }
    const missing = [...active.expected]
      .filter(([key]) => !active.observed.has(key))
      .map(([, raw]) => raw);
    if (missing.length)
      return this.reply(
        this.t("Falta comprobar evidencia en este escenario:\n") +
          missing.map((raw) => "  " + raw).join("\n"),
        1,
      );
    const control = scene.control;
    if (control) {
      const testsComplete = control.ordered
        ? active.orderedTests === control.checks.length
        : control.checks.every(([value, probe]) =>
            active.tests.has(value + ":" + probe),
          );
      if (active.setting !== control.final || !testsComplete)
        return this.reply(
          "Aún faltan el ajuste final o las pruebas requeridas. Consulta mission, set y test.",
          1,
        );
    }
    let note = "";
    if (scene.note) {
      try {
        const evidence = await this.workspace.text(
          this.userId,
          WORKSPACE_ROOT + "/uno/" + target.code + ".txt",
        );
        note = noteText(evidence.text);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        return this.reply(
          this.t("Abre o crea ~/trabajo/uno/{v1}.txt con echo. {v2}", {
            v1: target.code,
            v2: this.t(error.message),
          }),
          1,
        );
      }
      if (!includesTerms(note, scene.note))
        return this.reply(
          "La nota todavía requiere datos de la consigna. Revísala con cat y consulta hint.",
          1,
        );
      if (scene.chronology && !inSequence(note, scene.chronology))
        return this.reply(
          "Ordena los eventos de la cronología antes de entregar.",
          1,
        );
    }
    const points = scene.grade
      ? scene.grade.base +
        (scene.grade.bonus ?? []).reduce(
          (sum, bonus) =>
            sum + (includesTerms(note, bonus.terms) ? bonus.points : 0),
          0,
        )
      : undefined;
    const run = await completeScene(
      this.db,
      this.userId,
      target,
      active.attempt,
      points,
    );
    const lines = [
      target.kind === "branch"
        ? this.t("Secundaria completada.")
        : this.t("Nivel {v1} completado.", { v1: target.code }),
      this.t(scene.ending),
    ];
    if (points !== undefined)
      lines.push(
        this.t(
          "Evaluación de esta entrega: {points} puntos. Consulta certificado.",
          { points },
        ),
      );
    if (target.kind === "branch") {
      lines.push(this.t("Vuelve a la ruta principal con mission continuar."));
    } else if (target.code === FINAL.code) {
      const certificate = certificateView(run);
      lines.push(
        certificate
          ? this.t(
              "Certificación interna disponible. Consulta certificado para ver el código.",
            )
          : this.t(
              "Historia completada. Consulta certificado para revisar la evaluación.",
            ),
        this.t("Usa epilogo para leer el cierre de tu partida."),
      );
    } else {
      const index = MISSIONS.findIndex(({ slug }) => slug === target.slug);
      const next = campaignMission(MISSIONS[index + 1]?.slug ?? "");
      lines.push(
        next
          ? this.t("Siguiente nivel: mission ") + next.code
          : this.t("Usa mission continuar."),
      );
    }
    return this.reply(lines.join("\n\n"), 0, true);
  }

  private async certificate(args: string[]) {
    const retake = args[0] === "repetir" || args[0] === "retry";
    if (args.length > 1 || (args.length && !retake))
      return this.reply("Uso: certificado [repetir]", 2);
    const done = await completedSlugs(this.db, this.userId);
    const complete = done.has(FINAL.slug);
    if (retake) {
      if (!complete)
        return this.reply(
          "Termina Historia antes de iniciar otra variante.",
          1,
        );
      await beginRetake(this.db, this.userId);
      return this.loadMission("6.01");
    }
    if (
      !prerequisiteSlugs(campaignMission("6.01")!.slug).every((slug) =>
        done.has(slug),
      )
    )
      return this.reply("La evaluación se abre en el capítulo 6.");
    const run = await this.db.campaignRun.findUnique({
      where: { userId: this.userId },
    });
    return this.reply(
      gradeSummary(run, this.userId, this.t) +
        (complete
          ? this.t("\nUsa certificado repetir para iniciar otra variante.")
          : ""),
    );
  }

  private async epilogue() {
    const done = await completedSlugs(this.db, this.userId);
    if (!done.has(FINAL.slug))
      return this.reply("El epílogo se abre al completar la Historia.", 1);
    const run = await this.db.campaignRun.findUnique({
      where: { userId: this.userId },
      select: { branches: true },
    });
    return this.reply(
      [
        "EPÍLOGO · La primera luz",
        "06:17 en Vanta. La casa de Alma aparece con su dirección y sus recuerdos. Varela entrega su credencial a la junta. La próxima guardia del Core queda a cargo de un equipo con revisión independiente.",
        ...CAMPAIGN_BRANCHES.filter(({ id }) => run?.branches.includes(id)).map(
          ({ id }) => BRANCH_ENDINGS[id],
        ),
        "ECO-7: El mapa ya tiene memoria. Alguien tendrá que escucharla.",
      ]
        .map((line) => this.t(line))
        .join("\n\n"),
    );
  }
}
