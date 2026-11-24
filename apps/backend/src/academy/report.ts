import {
  ACADEMY_LESSONS,
  ACADEMY_TOOLS,
  type AcademyLessonId,
  type Locale,
} from "@null-protocol/shared";
import { backendTranslator } from "../locales";
import { CASES } from "./cases";

export function academyReport(
  id: AcademyLessonId,
  completedAt: Date,
  attempts: number,
  locale: Locale,
  detailed: boolean,
): string {
  const t = backendTranslator(locale);
  const lesson = ACADEMY_LESSONS.find((item) => item.id === id)!;
  const heading = [
    t("Expediente Vanta"),
    t(lesson.title),
    t(lesson.goal),
    t("Aprobado el {date} (UTC)", {
      date: completedAt.toISOString().replace("T", " ").slice(0, 19),
    }),
    t("Intentos registrados: {count}", { count: attempts }),
  ];
  if (!detailed)
    return [
      ...heading,
      "",
      t(
        "Esta partida conserva la aprobación original. Los criterios de ese intento no se archivaron.",
      ),
      "",
    ].join("\n");

  const exercise = CASES[id];
  const tools = ACADEMY_TOOLS.filter((tool) => tool.lessonId === id);
  const criteria = exercise.checks.map((check, index) =>
    [
      String(index + 1) + ". " + t(check.prompt),
      "   " + t(check.options[check.answer]!),
    ].join("\n"),
  );
  const tables = exercise.evidence.map((item) => {
    const product = tools.find((tool) => tool.id === item.toolId)!;
    return [
      product.name + " · " + t(item.title),
      item.columns.map((cell) => t(cell)).join(" | "),
      ...item.rows.map((row) => row.map((cell) => t(cell)).join(" | ")),
    ].join("\n");
  });
  return [
    ...heading,
    t("Versión del escenario: {version}", { version: 1 }),
    "",
    t("Criterios verificados: {done}/{total}", {
      done: criteria.length,
      total: criteria.length,
    }),
    ...criteria,
    "",
    t("Evidencias consultables del caso"),
    ...tables,
    "",
    t("Conclusión de la guardia"),
    t(exercise.review),
    "",
  ].join("\n");
}
