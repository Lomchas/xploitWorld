import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  languageTag,
  PORTAL_DRILL,
  type ArenaDrillResult,
} from "@null-protocol/shared";
import {
  ensureGuestSession,
  readPortalDrill,
  submitPortalDrill,
} from "../lib/api";
import { useLocale } from "../lib/locale";
import "./ArenaDesktop.css";

export function ArenaDrill() {
  const { t, locale } = useLocale();
  const [result, setResult] = useState<ArenaDrillResult | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [evaluated, setEvaluated] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    void ensureGuestSession()
      .then(readPortalDrill)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo evaluar el dispositivo.",
          );
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const evaluate = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(await submitPortalDrill());
      setEvaluated(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo evaluar el dispositivo.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const passed = result?.checks.filter((check) => check.passed).length ?? 0;
  return (
    <section className="arena-desktop" aria-labelledby="drill-title">
      <h2 id="drill-title">{t("Desafío de guardia")}</h2>
      <p>
        {t(
          "Prepara tu equipo de Arena para abrir un portal público. Un visitante virtual comprobará el servicio, el cifrado y los límites de acceso.",
        )}
      </p>
      {error && (
        <p role="alert">
          {t(error)}{" "}
          {!result && (
            <button
              onClick={() => {
                setError("");
                setReload((n) => n + 1);
              }}
            >
              {t("Reintentar")}
            </button>
          )}
        </p>
      )}
      {!result &&
        (error ? (
          <Link to="/pvp">{t("Abrir mi escritorio")}</Link>
        ) : (
          <p role="status">{t("Cargando…")}</p>
        ))}
      {result && (
        <div className="arena-files">
          <h3>{t("Portal de guardia")}</h3>
          <p role="status">
            {t("Criterios verificados: {done}/{total}", {
              done: passed,
              total: result.checks.length,
            })}
            {evaluated &&
              passed < result.checks.length &&
              " · " + t("Ajusta los controles pendientes y vuelve a evaluar.")}
          </p>
          <ul>
            {result.checks.map((check) => {
              const criterion = PORTAL_DRILL[check.id];
              return (
                <li key={check.id}>
                  <strong>{t(check.passed ? "Cumplido" : "Pendiente")}</strong>
                  {" · "}
                  {t(criterion.label)}
                  {!check.passed && <p>{t(criterion.hint)}</p>}
                </li>
              );
            })}
          </ul>
          {result.completedAt && (
            <p role="status">
              {t("Insignia de guardia obtenida el {date}.", {
                date: new Date(result.completedAt).toLocaleDateString(
                  languageTag(locale),
                ),
              })}
            </p>
          )}
          <div className="file-actions">
            <Link to="/dispositivo" state={{ fromDrill: true }}>
              {t("Configurar dispositivo")}
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void evaluate()}
            >
              {t("Evaluar mi equipo")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
