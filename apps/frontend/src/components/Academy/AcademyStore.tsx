import { useLocale } from "../../lib/locale";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACADEMY_LESSONS,
  ACADEMY_TOOLS,
  type AcademyToolId,
} from "@null-protocol/shared";
import { activateAcademyTool } from "../../lib/api";
import { useAcademy } from "./useAcademy";
import "./Academy.css";
import { PRACTICE_GUIDES } from "../Exchange/guides";
import { ProductArt, ShopDialog } from "../Exchange/ShopDialog";

export function AcademyStore({
  installedOnly = false,
}: {
  installedOnly?: boolean;
}) {
  const { t, locale } = useLocale();
  const { state, setState, error, reload } = useAcademy();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [busy, setBusy] = useState<AcademyToolId | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const saving = useRef(false);
  const [selected, setSelected] = useState<AcademyToolId | null>(null);
  const product = ACADEMY_TOOLS.find(({ id }) => id === selected);
  const practice =
    product && ACADEMY_LESSONS.find(({ id }) => id === product.lessonId)!;
  const guide = practice && PRACTICE_GUIDES[practice.id];
  const search = query.trim().toLocaleLowerCase(locale);
  const tools = ACADEMY_TOOLS.flatMap((tool) => {
    if (installedOnly && !state?.installed.includes(tool.id)) return [];
    const lesson = ACADEMY_LESSONS.find((entry) => entry.id === tool.lessonId)!;
    if (
      (tier && lesson.tier !== tier) ||
      !`${tool.name} ${t(tool.description)} ${t(lesson.title)}`
        .toLocaleLowerCase(locale)
        .includes(search)
    )
      return [];
    return [{ tool, lesson }];
  });

  const activate = async (id: AcademyToolId, name: string): Promise<void> => {
    if (saving.current) return;
    saving.current = true;
    setBusy(id);
    setNotice(null);
    try {
      setState(await activateAcademyTool(id));
      setNotice({
        text: t("{name} añadida a tu biblioteca de práctica.", { name }),
        error: false,
      });
    } catch (failure) {
      setNotice({
        text:
          failure instanceof Error
            ? failure.message
            : "La activación requiere un reintento.",
        error: true,
      });
    } finally {
      saving.current = false;
      setBusy(null);
    }
  };
  return (
    <section
      className="academy academy-catalog"
      aria-label={
        installedOnly
          ? t("Biblioteca de práctica")
          : t("Herramientas de práctica")
      }
    >
      <header className="academy-header">
        <div>
          <h2>
            {installedOnly
              ? t("Biblioteca de práctica")
              : t("Herramientas de práctica")}
          </h2>
          {!installedOnly && (
            <p className="station-muted">
              {t(
                "Herramientas simuladas de 0 BTC para los expedientes de Historia.",
              )}
            </p>
          )}
        </div>
        <Link
          className="academy-link"
          to={
            installedOnly
              ? "/exchange?tienda=academia"
              : "/practicas?practica=ruta"
          }
        >
          {installedOnly
            ? t("Ver catálogo de práctica")
            : t("Ir a la ruta de Historia")}
        </Link>
      </header>
      {error && (
        <p className="academy-alert" role="alert">
          {t(error)}{" "}
          <button type="button" onClick={reload}>
            {t("Reintentar")}
          </button>
        </p>
      )}
      {notice && (
        <p
          className={notice.error ? "academy-alert" : "station-green"}
          role={notice.error ? "alert" : "status"}
        >
          {t(notice.text)}
        </p>
      )}
      {!state && !error && (
        <p role="status">{t("Consultando tus licencias…")}</p>
      )}
      {state && (
        <>
          {!installedOnly && (
            <div className="academy-filters">
              <label>
                {t("Buscar herramientas")}
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nmap, Wireshark…"
                />
              </label>
              <label>
                {t("Dificultad")}
                <select
                  value={tier}
                  onChange={(event) => setTier(event.target.value)}
                >
                  <option value="">{t("Todas")}</option>
                  <option value="Básico">{t("Básico")}</option>
                  <option value="Intermedio">{t("Intermedio")}</option>
                  <option value="Avanzado">{t("Avanzado")}</option>
                </select>
              </label>
              <p className="station-muted" role="status">
                {tools.length === 1
                  ? t("1 herramienta")
                  : t("{count} herramientas", { count: tools.length })}
              </p>
            </div>
          )}
          {!tools.length && (
            <p className="station-muted">
              {installedOnly
                ? t("Tu biblioteca de práctica está vacía.")
                : t("Ninguna herramienta coincide con la búsqueda.")}
            </p>
          )}
          <div className="equipment-grid academy-equipment">
            {tools.map(({ tool, lesson }) => {
              const added = state.installed.includes(tool.id);
              return (
                <article key={tool.id} className="equipment-card">
                  <button
                    type="button"
                    className="product-open"
                    onClick={() => setSelected(tool.id)}
                    aria-label={t("Ver detalles de {name}", {
                      name: tool.name,
                    })}
                  >
                    <ProductArt name={PRACTICE_GUIDES[lesson.id].art} />
                  </button>
                  <div className="product-copy">
                    <div className="product-meta">
                      <span>{t(lesson.tier)}</span>
                      <span>{t(added ? "Añadida" : "Único")}</span>
                    </div>
                    <h3>{tool.name}</h3>
                    <p>{t(tool.description)}</p>
                    <div className="product-footer">
                      <strong>0 BTC</strong>
                      <button
                        type="button"
                        onClick={() => setSelected(tool.id)}
                      >
                        {t("Ver detalles")}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {product && practice && guide && (
        <ShopDialog title={product.name} onClose={() => setSelected(null)}>
          <div className="product-detail">
            <ProductArt name={guide.art} />
            <div className="product-detail-copy">
              <p className="product-stat">{t(product.description)}</p>
              <h3>{t("Práctica asociada")}</h3>
              <p>
                {t(practice.title)} · {t(practice.tier)}
              </p>
              <p>{t(guide.takeaway)}</p>
              <div className="product-links">
                <Link
                  to={`/practicas?practica=${practice.id}&herramienta=${product.id}`}
                >
                  {t("Abrir práctica")}
                </Link>
                <a href={guide.reference.url} target="_blank" rel="noreferrer">
                  {guide.reference.title} ↗
                </a>
              </div>
            </div>
          </div>
          <div className="product-checkout">
            {state?.installed.includes(product.id) ? (
              <p>{t("Añadida")}</p>
            ) : (
              <button
                type="button"
                className="exchange-action"
                disabled={!state || busy !== null}
                onClick={() => void activate(product.id, product.name)}
              >
                {busy === product.id
                  ? t("Añadiendo…")
                  : t("Añadir {v1} · 0 BTC", { v1: product.name })}
              </button>
            )}
            {notice?.error && <p role="alert">{t(notice.text)}</p>}
          </div>
        </ShopDialog>
      )}
    </section>
  );
}
