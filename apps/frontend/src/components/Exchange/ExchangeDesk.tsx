import { useLocale } from "../../lib/locale";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CATALOG,
  type ExchangeResult,
  type ExchangeAction,
  type ExchangeState,
  type OwnedItem,
} from "@null-protocol/shared";
import { ApiError, exchangeAction, fetchExchange } from "../../lib/api";
import { requestId } from "../../lib/request-id";
import { AcademyStore } from "../Academy/AcademyStore";
import { EquipmentShop } from "./EquipmentShop";
import { RewardDesk } from "./RewardDesk";
import { ProductArt } from "./ShopDialog";
import { PRODUCT_GUIDES } from "./guides";

export type RunExchange = (
  action: ExchangeAction,
) => Promise<ExchangeResult | null>;
export type ExchangeFeedback = { error: boolean; text: string } | null;
const tabs = {
  tienda: "Tienda",
  inventario: "Inventario",
  recompensas: "Recompensas",
} as const;
type Tab = keyof typeof tabs;
const isTab = (value: string | null): value is Tab =>
  !!value && Object.hasOwn(tabs, value);
const status = {
  READY: "Disponible",
  EQUIPPED: "Equipado",
  RESERVED: "Reservado",
  CONSUMED: "Usado",
};

function InventoryCard({
  item,
  units,
  busy,
  run,
}: {
  item: OwnedItem;
  units: number;
  busy: boolean;
  run: RunExchange;
}) {
  const { t } = useLocale();
  const product = CATALOG[item.sku];
  return (
    <article className="pvp-card trade-card inventory-card">
      <ProductArt name={item.sku} />
      <span className="pvp-pill">
        {t(status[item.state])}
        {units > 1 ? " · ×" + units : ""}
      </span>
      <h3>{t(product.name)}</h3>
      <p>
        {t(
          item.sku === "recovery"
            ? "Canje disponible en Historia."
            : (PRODUCT_GUIDES[item.sku].summary ?? product.description),
        )}
      </p>
      {item.state === "EQUIPPED" && (
        <button
          disabled={busy}
          onClick={() => run({ type: "inventory.unequip", id: item.id })}
        >
          {t("Desequipar")}
        </button>
      )}
      {item.state === "READY" && (
        <>
          {product.use === "equip" && (
            <button
              disabled={busy}
              onClick={() => run({ type: "inventory.equip", id: item.id })}
            >
              {t("Equipar")}
            </button>
          )}
          {product.use === "consume" && (
            <button
              disabled={busy}
              onClick={() => run({ type: "inventory.use", id: item.id })}
            >
              {t("Canjear carga por 20 BTC")}
            </button>
          )}
          {product.use === "read" && (
            <button
              disabled={busy}
              onClick={() => run({ type: "inventory.read", id: item.id })}
            >
              {t("Abrir taller")}
            </button>
          )}
        </>
      )}
    </article>
  );
}

export function ExchangeDesk({
  identity,
  onWallet,
}: {
  identity: string;
  onWallet: () => void;
}) {
  const { t } = useLocale();
  const [params, setParams] = useSearchParams();
  const requested = params.get("panel");
  const tab: Tab = isTab(requested) ? requested : "tienda";
  const academyShop = tab === "tienda" && params.get("tienda") === "academia";
  const chooseCatalog = (academy: boolean): void => {
    setParams(academy ? { tienda: "academia" } : {});
  };
  const [state, setState] = useState<ExchangeState | null>(null);
  const [feedback, setFeedback] = useState<ExchangeFeedback>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<{
    key: string;
    action: ExchangeAction;
  } | null>(null);
  const [content, setContent] = useState("");
  const running = useRef(false);
  const refresh = useCallback(async () => {
    setState(await fetchExchange());
  }, []);
  const refreshSafely = (): void => {
    void refresh()
      .then(onWallet)
      .catch((error: unknown) =>
        setFeedback({
          error: true,
          text:
            error instanceof Error
              ? error.message
              : "Falló la lectura de Exchange.",
        }),
      );
  };
  useEffect(() => {
    let active = true;
    void fetchExchange()
      .then((value) => {
        if (active) setState(value);
      })
      .catch((error: unknown) => {
        if (active)
          setFeedback({
            error: true,
            text:
              error instanceof Error
                ? error.message
                : "Falló la lectura de Exchange.",
          });
      });
    return () => {
      active = false;
    };
  }, [identity]);

  const send = async (
    key: string,
    action: ExchangeAction,
  ): Promise<ExchangeResult | null> => {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    setFeedback(null);
    setContent("");
    try {
      const result = await exchangeAction(key, action);
      setRetry(null);
      setFeedback({ error: result.accepted === false, text: result.message });
      if (result.content) setContent(result.content);
      onWallet();
      await refresh().catch(() =>
        setFeedback({
          error: true,
          text:
            t(result.message) +
            t(" Actualiza la vista para consultar el estado."),
        }),
      );
      return result;
    } catch (error: unknown) {
      setRetry(
        !(error instanceof ApiError) || error.status >= 500
          ? { key, action }
          : null,
      );
      setFeedback({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : "La operación requiere un reintento.",
      });
      await refresh().catch(() => undefined);
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const run: RunExchange = (action) =>
    retry ? Promise.resolve(null) : send(requestId(), action);
  const blocked = busy || retry !== null;
  const inventory = new Map<string, { item: OwnedItem; units: number }>();
  for (const item of state?.inventory ?? []) {
    const key =
      CATALOG[item.sku].stock > 1 && item.state === "READY"
        ? item.sku
        : item.id;
    const group = inventory.get(key);
    if (group) group.units++;
    else inventory.set(key, { item, units: 1 });
  }
  return (
    <section className="exchange-board" aria-label={t("Mesa de operaciones")}>
      <nav className="exchange-tabs" aria-label={t("Secciones de Exchange")}>
        {(Object.keys(tabs) as Tab[]).map((id) => (
          <Link
            key={id}
            to={id === "tienda" ? "/exchange" : "/exchange?panel=" + id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setContent("")}
          >
            {t(tabs[id])}
          </Link>
        ))}
        <button type="button" disabled={busy} onClick={refreshSafely}>
          {t("Actualizar")}
        </button>
      </nav>
      <div className="exchange-body">
        {state?.storyRequirement && (
          <div className="story-purchase">
            <div>
              <strong>{t("Tu próxima misión")}</strong>
              <span>
                {t("Historia {code} requiere {item}.", {
                  code: state.storyRequirement.code,
                  item: t(CATALOG[state.storyRequirement.sku].name),
                })}
              </span>
            </div>
            <Link to={"/exchange?articulo=" + state.storyRequirement.sku}>
              {t("Ver artículo")}
            </Link>
            <Link to="/exchange?panel=recompensas">{t("Ganar BTC")}</Link>
          </div>
        )}
        {tab === "tienda" && (
          <div
            className="academy-catalog-switch"
            role="group"
            aria-label={t("Catálogos de la tienda")}
          >
            <button
              type="button"
              aria-pressed={!academyShop}
              onClick={() => chooseCatalog(false)}
            >
              {t("Equipamiento")}
            </button>
            <button
              type="button"
              aria-pressed={academyShop}
              onClick={() => chooseCatalog(true)}
            >
              {t("Herramientas de práctica")}
            </button>
          </div>
        )}
        {feedback && (
          <p
            className={
              "pvp-feedback" + (feedback.error ? " pvp-feedback-error" : "")
            }
            role={feedback.error ? "alert" : "status"}
          >
            {t(feedback.text)}
          </p>
        )}
        {retry && (
          <div className="pvp-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(retry.key, retry.action)}
            >
              {t("Reintentar la misma operación")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRetry(null);
                refreshSafely();
              }}
            >
              {t("Consultar estado y descartar reintento")}
            </button>
          </div>
        )}
        {academyShop ? (
          <AcademyStore />
        ) : !state ? (
          <p role="status">{t("Consultando Exchange…")}</p>
        ) : (
          <>
            {tab === "tienda" && (
              <EquipmentShop
                state={state}
                busy={blocked}
                run={run}
                feedback={feedback}
              />
            )}
            {tab === "inventario" && (
              <>
                {state.inventory.length === 0 && (
                  <p>{t("Tu inventario de equipamiento está vacío.")}</p>
                )}
                <div className="trade-grid">
                  {[...inventory].map(([key, { item, units }]) => (
                    <InventoryCard
                      key={key}
                      item={item}
                      units={units}
                      busy={blocked}
                      run={run}
                    />
                  ))}
                </div>
                {content && (
                  <article
                    className="pvp-card workshop"
                    aria-label={t("Material del taller")}
                  >
                    <pre>
                      {content
                        .split("\n")
                        .map((line) => t(line))
                        .join("\n")}
                    </pre>
                  </article>
                )}
                <AcademyStore installedOnly />
              </>
            )}
            {tab === "recompensas" && (
              <RewardDesk state={state} busy={blocked} run={run} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
