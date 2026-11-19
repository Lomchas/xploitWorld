import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CATALOG,
  formatPvpBtc,
  isSku,
  MAX_INVENTORY,
  MAX_PURCHASE_QUANTITY,
  SATS_PER_BTC,
  STORY_EQUIPMENT,
  type ExchangeState,
  type Sku,
} from "@null-protocol/shared";
import { useLocale } from "../../lib/locale";
import { PRODUCT_GUIDES } from "./guides";
import { ProductArt, ShopDialog } from "./ShopDialog";
import type { ExchangeFeedback, RunExchange } from "./ExchangeDesk";

const skuList = (Object.keys(CATALOG) as Sku[]).filter(
  (sku) => sku !== "recovery",
);
const categories = [...new Set(skuList.map((id) => CATALOG[id].category))];

function ProductDetails({
  sku,
  state,
  busy,
  run,
  feedback,
  close,
}: {
  sku: Sku;
  state: ExchangeState;
  busy: boolean;
  run: RunExchange;
  feedback: ExchangeFeedback;
  close: () => void;
}) {
  const { t } = useLocale();
  const product = CATALOG[sku];
  const guide = PRODUCT_GUIDES[sku];
  const owned = state.inventory.filter((item) => item.sku === sku);
  const ownedCount = owned.length;
  const balance = BigInt(state.balanceSats ?? "0");
  const limit = Math.min(
    product.stock - ownedCount,
    MAX_PURCHASE_QUANTITY,
    MAX_INVENTORY - state.inventory.length,
  );
  const [quantity, setQuantity] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const units = Math.max(1, Math.min(quantity, limit));
  const total = product.price * units;
  const affordable = balance >= BigInt(total) * SATS_PER_BTC;
  const missing = affordable
    ? "0"
    : formatPvpBtc((BigInt(total) * SATS_PER_BTC - balance).toString());
  const requirement = Object.entries(STORY_EQUIPMENT).find(
    ([, item]) => item === sku,
  )?.[0];
  const purchase = async (): Promise<void> => {
    setAttempted(true);
    const result = await run({ type: "shop.buy", sku, quantity: units });
    if (result) close();
  };
  return (
    <ShopDialog
      title={t(product.name)}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <div className="product-detail">
        <ProductArt name={sku} />
        <div className="product-detail-copy">
          <p className="product-stat">{t(guide.effect)}</p>
          <p>{t(guide.summary ?? product.description)}</p>
          {requirement && (
            <p className="exchange-pill">
              {t("Requisito para Historia {code}", { code: requirement })}
            </p>
          )}
          <h3>{t("Cómo usarlo")}</h3>
          <ol>
            {guide.steps.map((step) => (
              <li key={step}>{t(step)}</li>
            ))}
          </ol>
          <div className="product-links">
            {guide.lesson && (
              <Link to={"/practicas?practica=" + guide.lesson}>
                {t("Abrir práctica")}
              </Link>
            )}
            <a href={guide.reference.url} target="_blank" rel="noreferrer">
              {guide.reference.title} ↗
            </a>
          </div>
        </div>
      </div>
      <div className="product-checkout">
        <div>
          <p>
            <strong>{total} BTC</strong>
            {product.stock > 1 && (
              <small>
                {" "}
                · {product.price} BTC {t("por unidad")}
              </small>
            )}
          </p>
          {ownedCount > 0 && (
            <p className="station-muted">
              {t("{count} en inventario", { count: ownedCount })}
            </p>
          )}
        </div>
        {product.stock > 1 && (
          <label>
            {t("Cantidad")}
            <input
              type="number"
              value={units}
              min={1}
              max={Math.max(1, limit)}
              disabled={busy || limit <= 0}
              onChange={(event) =>
                setQuantity(Math.trunc(Number(event.target.value)) || 1)
              }
            />
          </label>
        )}
        {product.stock === 1 && ownedCount > 0 ? (
          <Link
            className="exchange-action"
            to={
              owned[0]?.state === "RESERVED"
                ? "/exchange?panel=mercado"
                : "/exchange?panel=inventario"
            }
          >
            {t(
              owned[0]?.state === "RESERVED"
                ? "Ver artículo reservado"
                : "Ver en inventario",
            )}
          </Link>
        ) : (
          <button
            className="exchange-action"
            type="button"
            disabled={busy || limit <= 0 || !affordable}
            onClick={() => void purchase()}
          >
            {t("Comprar")}
          </button>
        )}
        {limit <= 0 && product.stock > 1 && (
          <p role="status">
            {t("Alcanzaste el límite de unidades de este artículo.")}
          </p>
        )}
        {limit > 0 && !affordable && (
          <p role="status">
            {t("Te faltan {amount} BTC.", { amount: missing })}{" "}
            <Link to="/exchange?panel=recompensas">{t("Ganar BTC")}</Link>
          </p>
        )}
        {attempted && feedback?.error && <p role="alert">{t(feedback.text)}</p>}
      </div>
    </ShopDialog>
  );
}

export function EquipmentShop({
  state,
  busy,
  run,
  feedback,
}: {
  state: ExchangeState;
  busy: boolean;
  run: RunExchange;
  feedback: ExchangeFeedback;
}) {
  const { t, locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const item = params.get("articulo");
  const selected = isSku(item) && item !== "recovery" ? item : null;
  const search = query.trim().toLocaleLowerCase(locale);
  const displayed = skuList.filter(
    (sku) =>
      (!category || CATALOG[sku].category === category) &&
      (t(CATALOG[sku].name) + " " + t(CATALOG[sku].description))
        .toLocaleLowerCase(locale)
        .includes(search),
  );
  const choose = (sku: Sku | null): void => {
    const next = new URLSearchParams(params);
    if (sku) next.set("articulo", sku);
    else next.delete("articulo");
    setParams(next);
  };
  return (
    <section
      className="equipment-shop"
      aria-label={t("Equipamiento de Exchange")}
    >
      <div className="shop-filters">
        <label>
          {t("Buscar artículos")}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Nombre o efecto")}
          />
        </label>
        <div role="group" aria-label={t("Categorías")}>
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => setCategory("")}
          >
            {t("Todas")}
          </button>
          {categories.map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={id === category}
              onClick={() => setCategory(id)}
            >
              {t(id)}
            </button>
          ))}
        </div>
      </div>
      {!displayed.length && (
        <p className="station-muted">
          {t("Ningún artículo coincide con la búsqueda.")}
        </p>
      )}
      <div className="equipment-grid">
        {displayed.map((sku) => {
          const product = CATALOG[sku];
          const owned = state.inventory.filter((item) => item.sku === sku);
          return (
            <article className="equipment-card" key={sku}>
              <button
                type="button"
                className="product-open"
                onClick={() => choose(sku)}
                aria-label={t("Ver detalles de {name}", {
                  name: t(product.name),
                })}
              >
                <ProductArt name={sku} />
              </button>
              <div className="product-copy">
                <div className="product-meta">
                  <span>{t(product.category)}</span>
                  <span>
                    {product.stock === 1 ? t("Único") : t("Acumulable")}
                  </span>
                </div>
                <h3>{t(product.name)}</h3>
                <p>{t(PRODUCT_GUIDES[sku].effect)}</p>
                <div className="product-footer">
                  <strong>{product.price} BTC</strong>
                  <button type="button" onClick={() => choose(sku)}>
                    {t(
                      owned.length && product.stock === 1
                        ? "Ver adquirido"
                        : "Ver detalles",
                    )}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {selected && (
        <ProductDetails
          key={selected}
          sku={selected}
          state={state}
          busy={busy}
          run={run}
          feedback={feedback}
          close={() => choose(null)}
        />
      )}
    </section>
  );
}
