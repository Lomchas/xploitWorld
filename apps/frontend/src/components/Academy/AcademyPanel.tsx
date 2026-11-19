import { useLocale } from "../../lib/locale";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ACADEMY_LESSONS,
  ACADEMY_TOOLS,
  WORKSPACE_ROOT,
  type AcademyAnswers,
  type AcademyCase,
  type AcademyLessonId,
  type AcademyProgress,
  type AcademyResult,
  type AcademyState,
  type AcademyToolId,
} from "@null-protocol/shared";
import {
  fetchAcademyLesson,
  prepareAcademyLesson,
  submitAcademyAnswers,
  updateWorkspace,
} from "../../lib/api";
import { useAcademy } from "./useAcademy";
import "./Academy.css";

type Lesson = (typeof ACADEMY_LESSONS)[number];
const tiers = ["Básico", "Intermedio", "Avanzado"] as const;

function CasePanel({
  lesson,
  progress,
  state,
  preferredTool,
  onState,
  onChoose,
}: {
  lesson: Lesson;
  progress: AcademyProgress;
  state: AcademyState;
  preferredTool?: string | null;
  onState: (value: AcademyState) => void;
  onChoose: (id: AcademyLessonId) => void;
}) {
  const { t } = useLocale();
  const tools = ACADEMY_TOOLS.filter((tool) => tool.lessonId === lesson.id);
  const prepared = tools.every((tool) => state.installed.includes(tool.id));
  const [details, setDetails] = useState<AcademyCase | null>(null);
  const [tab, setTab] = useState<AcademyToolId | undefined>(
    () => tools.find((tool) => tool.id === preferredTool)?.id ?? tools[0]?.id,
  );
  const [answers, setAnswers] = useState<AcademyAnswers>({});
  const [feedback, setFeedback] = useState<AcademyResult | null>(null);
  const [problem, setProblem] = useState("");
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const index = ACADEMY_LESSONS.findIndex((item) => item.id === lesson.id);
  const next = ACADEMY_LESSONS[index + 1];
  const previous = ACADEMY_LESSONS[index - 1];
  useEffect(() => {
    if (!prepared || !progress.unlocked) return;
    let current = true;
    void fetchAcademyLesson(lesson.id)
      .then((value) => {
        if (current) setDetails(value);
      })
      .catch((failure: unknown) => {
        if (current)
          setLoadError(
            failure instanceof Error
              ? failure.message
              : "La evidencia no está disponible.",
          );
      });
    return () => {
      current = false;
    };
  }, [lesson.id, prepared, progress.unlocked, reload]);

  const perform = async (task: () => Promise<void>): Promise<void> => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setProblem("");
    try {
      await task();
    } catch (failure) {
      setProblem(
        failure instanceof Error
          ? failure.message
          : "La operación requiere un reintento.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (
      !details ||
      details.questions.some((question) => answers[question.id] === undefined)
    )
      return;
    void perform(async () => {
      const result = await submitAcademyAnswers(lesson.id, answers);
      setFeedback(result);
      onState(result.state);
    });
  };
  const evidence = details?.evidence.find((item) => item.toolId === tab);
  const review = feedback?.review ?? details?.review;
  const saveReport = (): void => {
    if (!review || !progress.completedAt) return;
    void perform(async () => {
      await updateWorkspace({
        type: "write",
        path: `${WORKSPACE_ROOT}/vanta-${lesson.id}.txt`,
        version: null,
        text: [
          t("Expediente Vanta"),
          t(lesson.title),
          t("Completada {v1}", { v1: progress.completedAt ?? "" }),
          "",
          review,
        ].join("\n"),
      });
      setSaved(true);
    });
  };
  return (
    <section className="academy-case" aria-labelledby="academy-case-title">
      <header className="academy-header">
        <div>
          <p className="academy-tier">{t(lesson.tier)}</p>
          <h2 id="academy-case-title">
            {index + 1}. {t(lesson.title)}
          </h2>
          <p>{t(lesson.goal)}</p>
        </div>
        {progress.attempts > 0 && (
          <p className="station-muted">
            {t("Intentos ")}
            {progress.attempts}
          </p>
        )}
      </header>
      {problem && (
        <p role="alert" className="academy-alert">
          {t(problem)}
        </p>
      )}
      {!progress.unlocked && previous && (
        <p className="academy-brief">
          {t("Completa «")}
          {t(previous.title)}
          {t("» para desbloquear esta práctica.")}{" "}
          <button type="button" onClick={() => onChoose(previous.id)}>
            {t("Ver práctica anterior")}
          </button>
        </p>
      )}
      {progress.unlocked && !prepared && (
        <div className="academy-brief">
          <p>
            {t("La práctica usa ")}
            {tools.map((tool) => tool.name).join(", ")}.
          </p>
          <button
            type="button"
            className="academy-primary"
            disabled={busy}
            onClick={() =>
              void perform(async () =>
                onState(await prepareAcademyLesson(lesson.id)),
              )
            }
          >
            {busy ? t("Preparando…") : t("Preparar práctica · 0 BTC")}
          </button>
        </div>
      )}
      {progress.unlocked &&
        prepared &&
        !details &&
        (loadError ? (
          <p role="alert" className="academy-alert">
            {t(loadError)}{" "}
            <button
              type="button"
              onClick={() => {
                setLoadError("");
                setReload((value) => value + 1);
              }}
            >
              {t("Reintentar")}
            </button>
          </p>
        ) : (
          <p role="status">{t("Abriendo el expediente…")}</p>
        ))}
      {details && (
        <>
          <p className="academy-brief">{t(details.briefing)}</p>
          <div
            className="academy-evidence-tools"
            role="group"
            aria-label={t("Herramientas del caso")}
          >
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                aria-pressed={tab === tool.id}
                onClick={() => setTab(tool.id)}
              >
                {tool.name}
              </button>
            ))}
          </div>
          {evidence && (
            <div
              className="academy-evidence"
              tabIndex={0}
              role="region"
              aria-label={t(evidence.title)}
            >
              <table>
                <caption>{t(evidence.title)}</caption>
                <thead>
                  <tr>
                    {evidence.columns.map((column) => (
                      <th key={column} scope="col">
                        {t(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evidence.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{t(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {review ? (
            <div className="academy-review">
              <h3>{t("Práctica completada")}</h3>
              <p>{review}</p>
              <div className="academy-actions">
                <button
                  type="button"
                  disabled={busy || saved}
                  onClick={saveReport}
                >
                  {saved
                    ? t("Informe guardado")
                    : t("Guardar informe en Archivos")}
                </button>
                {next && (
                  <button
                    type="button"
                    className="academy-primary"
                    onClick={() => onChoose(next.id)}
                  >
                    {t("Siguiente práctica")}
                  </button>
                )}
              </div>
              {saved && (
                <p role="status" className="station-green">
                  {t("Guardado en ")}
                  <code>~/trabajo/vanta-{lesson.id}.txt</code>.
                </p>
              )}
            </div>
          ) : (
            <form className="academy-questions" onSubmit={submit}>
              {details.questions.map((question, n) => {
                const outcome = feedback?.feedback.find(
                  (item) => item.id === question.id,
                );
                return (
                  <fieldset key={question.id}>
                    <legend>
                      {n + 1}. {t(question.prompt)}
                    </legend>
                    {question.options.map((option, i) => (
                      <label className="academy-answer" key={option}>
                        <input
                          type="radio"
                          name={question.id}
                          checked={answers[question.id] === i}
                          onChange={() =>
                            setAnswers((value) => ({
                              ...value,
                              [question.id]: i,
                            }))
                          }
                          disabled={busy}
                        />
                        {t(option)}
                      </label>
                    ))}
                    {outcome && (
                      <p
                        className={
                          outcome.correct ? "station-green" : "academy-alert"
                        }
                      >
                        {t(outcome.text)}
                      </p>
                    )}
                  </fieldset>
                );
              })}
              {feedback && !feedback.accepted && (
                <p role="status" className="academy-alert">
                  {t("Revisa las pistas y vuelve a comprobar.")}
                </p>
              )}
              <button
                type="submit"
                className="academy-primary"
                disabled={
                  busy ||
                  details.questions.some(
                    (question) => answers[question.id] === undefined,
                  )
                }
              >
                {busy ? t("Comprobando…") : t("Comprobar respuestas")}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

export function AcademyPanel({
  selected,
  preferredTool,
  onChoose,
}: {
  selected: AcademyLessonId | null;
  preferredTool?: string | null;
  onChoose: (id: AcademyLessonId) => void;
}) {
  const { t } = useLocale();
  const { state, setState, error, reload } = useAcademy();
  const [resume, setResume] = useState<AcademyLessonId | null>(null);
  const selector = useRef<HTMLSelectElement>(null);
  const resolved =
    state?.progress.filter((entry) => entry.completedAt).length ?? 0;
  const nextAvailable = state?.progress.find(
    (entry) => entry.unlocked && !entry.completedAt,
  )?.id;
  const id = selected ?? resume ?? nextAvailable ?? ACADEMY_LESSONS.at(-1)!.id;
  useEffect(() => {
    if (state && !selected && !resume)
      setResume(nextAvailable ?? ACADEMY_LESSONS.at(-1)!.id);
  }, [state, selected, resume, nextAvailable]);
  const lesson = ACADEMY_LESSONS.find((item) => item.id === id)!;
  const progress = state?.progress.find((entry) => entry.id === id);
  return (
    <section
      className="station-pad academy"
      aria-label={t("Prácticas de Historia")}
    >
      <header className="academy-header">
        <div>
          <h2>{t("Expediente Vanta")}</h2>
          <p className="station-muted">
            {t("Evidencias sintéticas para practicar análisis y defensa.")}
          </p>
        </div>
        <Link className="academy-link" to="/exchange?tienda=academia">
          {t("Herramientas en la tienda")}
        </Link>
      </header>
      {error && (
        <p role="alert" className="academy-alert">
          {t(error)}{" "}
          <button type="button" onClick={reload}>
            {t("Reintentar")}
          </button>
        </p>
      )}
      {!state && !error && <p role="status">{t("Consultando tu avance…")}</p>}
      {state && progress && (
        <>
          <div className="academy-progress">
            <label>
              {t("Práctica")}
              <select
                ref={selector}
                aria-label={t("Práctica")}
                value={id}
                onChange={(event) => {
                  const item = ACADEMY_LESSONS.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (item) onChoose(item.id);
                }}
              >
                {tiers.map((tier) => (
                  <optgroup key={tier} label={t(tier)}>
                    {ACADEMY_LESSONS.filter((item) => item.tier === tier).map(
                      (item) => {
                        const entry = state.progress.find(
                          (row) => row.id === item.id,
                        );
                        return (
                          <option value={item.id} key={item.id}>
                            {t(item.title)}
                            {entry?.completedAt
                              ? t(" · Completada")
                              : entry?.unlocked
                                ? ""
                                : t(" · Bloqueada")}
                          </option>
                        );
                      },
                    )}
                  </optgroup>
                ))}
              </select>
            </label>
            <div>
              <p>
                {t("{done} de {total} prácticas completadas", {
                  done: resolved,
                  total: ACADEMY_LESSONS.length,
                })}
              </p>
              <progress
                aria-label={t("Avance de prácticas")}
                value={resolved}
                max={ACADEMY_LESSONS.length}
              />
            </div>
          </div>
          <CasePanel
            key={id + ":" + (preferredTool ?? "")}
            lesson={lesson}
            progress={progress}
            state={state}
            preferredTool={preferredTool}
            onState={setState}
            onChoose={(next) => {
              onChoose(next);
              selector.current?.focus();
            }}
          />
        </>
      )}
    </section>
  );
}
