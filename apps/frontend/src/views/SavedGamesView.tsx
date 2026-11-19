import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  languageTag,
  type AccountState,
  type LevelSummary,
  type UserProgressEntry,
} from "@null-protocol/shared";
import { useLocale } from "../lib/locale";
import {
  ensureGuestSession,
  fetchAccount,
  fetchLevels,
  fetchUserProgress,
} from "../lib/api";

interface SaveData {
  levels: LevelSummary[];
  progress: UserProgressEntry[];
  account: AccountState;
}

export function SavedGamesView() {
  const { t, locale } = useLocale();
  const [data, setData] = useState<SaveData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void ensureGuestSession()
      .then(() =>
        Promise.all([fetchLevels(), fetchUserProgress(), fetchAccount()]),
      )
      .then(([levels, progress, account]) => {
        if (active) setData({ levels, progress, account });
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "No se pudo cargar la partida.",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const completed = data?.progress.filter((entry) => entry.completed) ?? [];
  const last = completed.reduce<string | null>(
    (latest, entry) =>
      entry.completedAt && (!latest || entry.completedAt > latest)
        ? entry.completedAt
        : latest,
    null,
  );
  const next = data?.levels.find(
    (level) => !completed.some((entry) => entry.levelId === level.id),
  );
  return (
    <section className="game-page saves-page" aria-labelledby="saves-title">
      <h1 id="saves-title">{t("Partidas guardadas")}</h1>
      {!data && !error && <p role="status">{t("Cargando partida…")}</p>}
      {error && (
        <div role="alert">
          <p>{t(error)}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setAttempt(attempt + 1);
            }}
          >
            {t("Reintentar")}
          </button>
        </div>
      )}
      {data && (
        <>
          <div className="save-account">
            <span>
              {data.account.linked
                ? data.account.username
                : t("Sesión de invitado")}
            </span>
            <Link to="/exchange#account-title">
              {data.account.linked
                ? t("Gestionar cuenta")
                : t("Vincular cuenta o iniciar sesión")}
            </Link>
          </div>
          <div className="save-grid">
            <article className="save-card">
              <h2>{t("Historia")}</h2>
              <p>
                {t("{done} de {total} niveles completados", {
                  done: completed.length,
                  total: data.levels.length,
                })}
              </p>
              <progress
                value={completed.length}
                max={data.levels.length || 1}
                aria-label={t("Progreso de Historia")}
              />
              <p>
                {next
                  ? t(next.name)
                  : data.levels.length
                    ? t("Historia completada")
                    : t("Campaña pendiente de cargar")}
              </p>
              {last && (
                <p className="save-date">
                  {t("Último avance")}:{" "}
                  <time dateTime={last}>
                    {new Date(last).toLocaleString(languageTag(locale))}
                  </time>
                </p>
              )}
              <Link className="game-button" to="/historia">
                {completed.length
                  ? t("Continuar historia")
                  : t("Iniciar historia")}
              </Link>
              <Link to="/historia?intro=1">
                {t("Volver a ver la introducción")}
              </Link>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
