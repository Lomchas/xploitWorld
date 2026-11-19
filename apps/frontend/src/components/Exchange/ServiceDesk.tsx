import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  findingOptions,
  formatPvpBtc,
  languageTag,
  PVP_SERVICES,
  SERVICE_FEE_PERCENT,
  SERVICE_FINDINGS,
  SERVICE_KINDS,
  type ExchangeAction,
  type ExchangeState,
  type PvpServiceId,
  type ServiceContractView,
  type ServiceFinding,
  type ServiceKind,
  type ServiceOfferView,
  type ServiceScope,
} from "@null-protocol/shared";
import { useLocale } from "../../lib/locale";
import { ShopDialog } from "./ShopDialog";
import type { ExchangeFeedback, RunExchange } from "./ExchangeDesk";

const stateName = {
  HIRED: "Contratado",
  DELIVERED: "Entregado",
  DISPUTED: "En disputa",
  PAID: "Pagado",
  REFUNDED: "Reembolsado",
} as const;
const kinds = Object.keys(SERVICE_KINDS) as ServiceKind[];
const field = (data: FormData, name: string) => String(data.get(name) ?? "");
const price = (value: string) => formatPvpBtc(value) + " BTC";

function ScopeView({ scope }: { scope: ServiceScope }) {
  const { t, locale } = useLocale();
  if (scope.kind === "audit")
    return (
      <div className="contract-scope">
        <ul>
          {scope.services.map((service) => (
            <li key={service.id}>
              {t(PVP_SERVICES[service.id].name)} ·{" "}
              {t(service.open ? "Abierto" : "Cerrado")} ·{" "}
              {t(service.patched ? "Parcheado" : "Parche pendiente")}
            </li>
          ))}
        </ul>
        <p>
          TLS · {t(scope.tls ? "Activo" : "Inactivo")} ·{" "}
          {t(scope.isolated ? "Dispositivo aislado" : "Dispositivo en red")}
        </p>
      </div>
    );
  if (scope.kind === "analysis")
    return (
      <div className="contract-scope">
        <p>{t(scope.incident.summary)}</p>
        <p>
          {t(SERVICE_FINDINGS[scope.incident.severity])} ·{" "}
          <time dateTime={scope.incident.at}>
            {new Date(scope.incident.at).toLocaleString(languageTag(locale))}
          </time>
        </p>
        {scope.incident.sha256 && <code>SHA-256 {scope.incident.sha256}</code>}
      </div>
    );
  if (scope.kind === "recovery")
    return (
      <p className="contract-scope">
        {t("Integridad al contratar: {value} %", { value: scope.integrity })}
      </p>
    );
  return (
    <p className="contract-scope">
      {t(PVP_SERVICES[scope.service].name)} ·{" "}
      {t(scope.open ? "Abierto" : "Cerrado")} · {t("Parche pendiente")}
    </p>
  );
}

function HireDialog({
  offer,
  assets,
  balance,
  busy,
  feedback,
  run,
  close,
  onHired,
}: {
  offer: ServiceOfferView;
  assets: ExchangeState["serviceAssets"];
  balance: string | null;
  busy: boolean;
  feedback: ExchangeFeedback;
  run: RunExchange;
  close: () => void;
  onHired: () => void;
}) {
  const { t, locale } = useLocale();
  const [selection, setSelection] = useState("");
  const [attempted, setAttempted] = useState(false);
  const quote = SERVICE_KINDS[offer.kind];
  const choices =
    offer.kind === "maintenance"
      ? (assets?.services.map((id) => ({
          id,
          label: t(PVP_SERVICES[id].name),
        })) ?? [])
      : offer.kind === "analysis"
        ? (assets?.incidents.map((entry) => ({
            id: entry.id,
            label:
              new Date(entry.at).toLocaleString(languageTag(locale)) +
              " · " +
              t(entry.summary),
          })) ?? [])
        : [];
  const requiresChoice =
    offer.kind === "maintenance" || offer.kind === "analysis";
  const amount = BigInt(offer.priceSats);
  const fee = (amount * BigInt(SERVICE_FEE_PERCENT)) / 100n;
  const reason = !assets
    ? "Despliega tu dispositivo para contratar."
    : BigInt(balance ?? "0") < amount
      ? "Saldo insuficiente para esta operación."
      : offer.kind === "recovery" && assets.integrity >= 100
        ? "Tu equipo ya tiene la integridad completa."
        : offer.kind === "recovery" &&
            assets.recoveryAvailableAt &&
            Date.parse(assets.recoveryAvailableAt) > Date.now()
          ? "La recuperación de emergencia sigue en enfriamiento."
          : requiresChoice && !choices.length
            ? offer.kind === "maintenance"
              ? "Tus servicios ya están parcheados."
              : "No tienes incidentes recientes para compartir."
            : "";
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempted(true);
    const action: ExchangeAction = {
      type: "service.hire",
      id: offer.id,
      revision: offer.revision,
      ...(offer.kind === "maintenance"
        ? { service: selection as PvpServiceId }
        : {}),
      ...(offer.kind === "analysis" ? { incidentId: selection } : {}),
    };
    if (await run(action)) onHired();
  };
  return (
    <ShopDialog
      title={offer.title}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form className="hire-form" onSubmit={(event) => void submit(event)}>
        <p>{offer.description}</p>
        <p>{t(quote.proof)}</p>
        <dl>
          <div>
            <dt>{t("Proveedor")}</dt>
            <dd>{offer.merchant}</dd>
          </div>
          <div>
            <dt>{t("Pago en depósito")}</dt>
            <dd>{price(offer.priceSats)}</dd>
          </div>
          <div>
            <dt>{t("Recibe el proveedor")}</dt>
            <dd>{price(String(amount - fee))}</dd>
          </div>
          <div>
            <dt>{t("Plazo de entrega")}</dt>
            <dd>{offer.hours} h</dd>
          </div>
        </dl>
        {requiresChoice && choices.length > 0 && (
          <label>
            {t(
              offer.kind === "maintenance"
                ? "Servicio autorizado"
                : "Incidente autorizado",
            )}
            <select
              value={selection}
              required
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="" disabled>
                {t("Selecciona un activo")}
              </option>
              {choices.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="station-muted">
          {t(
            "El depósito se libera al aceptar o tras 48 horas de revisión. Si no hay entrega a tiempo, vuelve a tu saldo.",
          )}
        </p>
        {reason && <p role="status">{t(reason)}</p>}
        {attempted && feedback?.error && <p role="alert">{t(feedback.text)}</p>}
        <button
          className="exchange-action"
          disabled={busy || !!reason || (requiresChoice && !selection)}
        >
          {t("Confirmar y reservar pago")}
        </button>
      </form>
    </ShopDialog>
  );
}

function ContractCard({
  row,
  busy,
  run,
}: {
  row: ServiceContractView;
  busy: boolean;
  run: RunExchange;
}) {
  const { t, locale } = useLocale();
  const [dispute, setDispute] = useState(false);
  const client = row.side === "client";
  const date = (value: string) =>
    new Date(value).toLocaleString(languageTag(locale));
  const expired = Date.parse(row.dueAt) <= Date.now();
  const reviewExpired =
    !!row.reviewAt && Date.parse(row.reviewAt) <= Date.now();
  const deliver = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (row.scope)
      void run({
        type: "service.report",
        id: row.id,
        finding: field(form, "finding") as ServiceFinding,
        report: field(form, "report"),
      });
    else
      void run({
        type: "service.deliver",
        id: row.id,
        evidenceId: field(form, "proof"),
      });
  };
  const isOpen = ["HIRED", "DELIVERED", "DISPUTED"].includes(row.state);
  return (
    <article className="pvp-card contract-card">
      <div className="contract-heading">
        <div>
          <p className="product-meta">
            {t(SERVICE_KINDS[row.kind].name)} ·{" "}
            {t(client ? "Cliente" : "Proveedor")}
          </p>
          <h4>{row.title}</h4>
        </div>
        <span className="exchange-pill">{t(stateName[row.state])}</span>
      </div>
      {row.description && <p>{row.description}</p>}
      <dl className="contract-summary">
        <div>
          <dt>{t(client ? "Proveedor" : "Cliente")}</dt>
          <dd>{client ? row.provider : row.client}</dd>
        </div>
        <div>
          <dt>{t("Precio acordado")}</dt>
          <dd>{price(row.priceSats)}</dd>
        </div>
        <div>
          <dt>{t("Plazo de entrega")}</dt>
          <dd>
            <time dateTime={row.dueAt}>{date(row.dueAt)}</time>
          </dd>
        </div>
      </dl>
      {row.scope && (
        <details>
          <summary>{t("Evidencia autorizada")}</summary>
          <ScopeView scope={row.scope} />
        </details>
      )}
      {row.reviewAt && row.state === "DELIVERED" && (
        <p className="station-muted">
          {t("Revisar antes de {date}", { date: date(row.reviewAt) })}
        </p>
      )}
      {row.evidence && (
        <p>
          {t("Hallazgo")}:{" "}
          {t(
            row.scope
              ? (SERVICE_FINDINGS[row.evidence as ServiceFinding] ??
                  row.evidence)
              : row.evidence,
          )}
        </p>
      )}
      {row.report && <p className="contract-report">{row.report}</p>}
      {row.effect && <p className="contract-effect">{t(row.effect)}</p>}
      {row.dispute && (
        <p>
          {t("Disputa · ")}
          {row.dispute}
        </p>
      )}
      {row.resolution && (
        <p>
          {t(row.resolution)}
          {row.rating ? " · " + row.rating + "/5" : ""}
        </p>
      )}
      {!client && row.state === "HIRED" && !expired && (
        <form className="contract-form" onSubmit={deliver}>
          {row.scope ? (
            <>
              <label>
                {t("Hallazgo")}
                <select name="finding" required defaultValue="">
                  <option value="" disabled>
                    {t("Selecciona un hallazgo")}
                  </option>
                  {findingOptions(row.scope.kind).map((value) => (
                    <option value={value} key={value}>
                      {t(SERVICE_FINDINGS[value])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Informe para el cliente")}
                <textarea
                  name="report"
                  minLength={30}
                  maxLength={800}
                  required
                  placeholder={t(
                    "Incluye evidencia, conclusión y acción recomendada.",
                  )}
                />
              </label>
            </>
          ) : (
            <>
              {row.target && (
                <p>
                  {t("Equipo autorizado ·")}{" "}
                  <code>{row.target.ipv4 ?? row.target.ipv6}</code> ·{" "}
                  <Link to="/arena">{t("Abrir PvP")}</Link>
                </p>
              )}
              <label>
                {t("Evidencia verificada")}
                <select name="proof" required defaultValue="">
                  <option value="" disabled>
                    {t("Selecciona una operación")}
                  </option>
                  {row.evidenceChoices.map((entry) => (
                    <option value={entry.id} key={entry.id}>
                      {date(entry.at)} · {t(entry.summary)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button
            disabled={busy || (!row.scope && !row.evidenceChoices.length)}
          >
            {t("Entregar evidencia")}
          </button>
        </form>
      )}
      {client &&
        (row.state === "DELIVERED" || row.state === "DISPUTED") &&
        (row.state === "DISPUTED" || !reviewExpired) && (
          <form
            className="contract-form contract-inline"
            onSubmit={(event) => {
              event.preventDefault();
              void run({
                type: "service.accept",
                id: row.id,
                rating: Number(
                  field(new FormData(event.currentTarget), "rating"),
                ),
              });
            }}
          >
            <label>
              {t("Calificación")}
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button disabled={busy}>{t("Aceptar y liberar pago")}</button>
          </form>
        )}
      {((client && row.state === "DELIVERED" && !reviewExpired) ||
        (!client &&
          !row.scope &&
          row.state === "DELIVERED" &&
          !!row.deliveredAt &&
          Date.now() - Date.parse(row.deliveredAt) >= 48 * 3_600_000)) &&
        (dispute ? (
          <form
            className="contract-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run({
                type: "service.dispute",
                id: row.id,
                reason: field(new FormData(event.currentTarget), "reason"),
              });
            }}
          >
            <label>
              {t("Motivo de la disputa")}
              <textarea name="reason" required maxLength={280} />
            </label>
            <button disabled={busy}>{t("Abrir disputa")}</button>
          </form>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setDispute(true)}
          >
            {t("Abrir disputa")}
          </button>
        ))}
      {isOpen && (!client || (row.state === "HIRED" && expired)) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ type: "service.refund", id: row.id })}
        >
          {t("Reembolsar contrato")}
        </button>
      )}
    </article>
  );
}

export function ServiceDesk({
  state,
  busy,
  feedback,
  run,
}: {
  state: ExchangeState;
  busy: boolean;
  feedback: ExchangeFeedback;
  run: RunExchange;
}) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState<"browse" | "jobs" | "offer">("browse");
  const [kind, setKind] = useState<ServiceKind>("audit");
  const [filter, setFilter] = useState("");
  const [hiring, setHiring] = useState<ServiceOfferView | null>(null);
  const mine = state.services.find((offer) => offer.own && offer.kind === kind);
  const terms = SERVICE_KINDS[kind];
  const offers = state.services.filter(
    (offer) => !filter || offer.kind === filter,
  );
  return (
    <div className="service-desk">
      <div
        className="service-switch"
        role="group"
        aria-label={t("Mesa de servicios")}
      >
        <button
          type="button"
          aria-pressed={mode === "browse"}
          onClick={() => setMode("browse")}
        >
          {t("Contratar")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "jobs"}
          onClick={() => setMode("jobs")}
        >
          {t("Mis contratos")} ·{" "}
          {
            state.contracts.filter((row) =>
              ["HIRED", "DELIVERED", "DISPUTED"].includes(row.state),
            ).length
          }
        </button>
        <button
          type="button"
          aria-pressed={mode === "offer"}
          onClick={() => setMode("offer")}
        >
          {t("Ofrecer un servicio")}
        </button>
      </div>
      {mode === "browse" && (
        <>
          <div className="service-intro">
            <p>
              {t(
                "Contrata diagnósticos y mejoras para tu dispositivo. La Mesa retiene el pago y valida el hallazgo con la evidencia autorizada.",
              )}
            </p>
            <label>
              {t("Especialidad")}
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="">{t("Todas")}</option>
                {kinds.map((id) => (
                  <option key={id} value={id}>
                    {t(SERVICE_KINDS[id].name)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!offers.length && (
            <p className="station-muted">{t("Sin servicios publicados.")}</p>
          )}
          <div className="trade-grid">
            {offers.map((offer) => (
              <article
                className="pvp-card trade-card service-offer"
                key={offer.id}
              >
                <p className="product-meta">
                  {t(offer.active ? SERVICE_KINDS[offer.kind].name : "Pausado")}
                </p>
                <h3>{offer.title}</h3>
                <p>{offer.description}</p>
                <p>
                  <strong>{offer.merchant}</strong> ·{" "}
                  {offer.reputation === null
                    ? t("Sin calificaciones")
                    : new Intl.NumberFormat(languageTag(locale), {
                        maximumFractionDigits: 1,
                      }).format(offer.reputation) + "/5"}
                </p>
                <p className="station-muted">
                  {t("{count} contratos pagados", { count: offer.delivered })} ·{" "}
                  {offer.hours} h
                </p>
                {offer.biography && (
                  <p className="station-muted">{offer.biography}</p>
                )}
                <div className="product-footer">
                  <strong>{price(offer.priceSats)}</strong>
                  {offer.own ? (
                    <button
                      type="button"
                      disabled={busy || !offer.active}
                      onClick={() =>
                        void run({ type: "service.pause", id: offer.id })
                      }
                    >
                      {t("Pausar servicio")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !state.canTrade || !offer.active}
                      onClick={() => setHiring(offer)}
                    >
                      {t("Ver condiciones")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {mode === "jobs" && (
        <section aria-label={t("Mis contratos")}>
          {!state.contracts.length && (
            <p className="station-muted">{t("Sin contratos.")}</p>
          )}
          <div className="contract-grid">
            {state.contracts.map((row) => (
              <ContractCard key={row.id} row={row} busy={busy} run={run} />
            ))}
          </div>
        </section>
      )}
      {mode === "offer" && (
        <div className="contract-grid">
          <form
            className="pvp-card contract-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run({
                type: "merchant.save",
                description: field(new FormData(event.currentTarget), "bio"),
              });
            }}
          >
            <h3>{t("Mi perfil de comerciante")}</h3>
            <label>
              {t("Presentación del comerciante")}
              <textarea
                key={state.merchant?.description}
                name="bio"
                defaultValue={state.merchant?.description}
                maxLength={240}
                required
              />
            </label>
            <button disabled={busy || !state.canTrade}>
              {t("Guardar perfil")}
            </button>
          </form>
          <form
            className="pvp-card contract-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run({
                type: "service.offer",
                kind,
                title: field(data, "title"),
                description: field(data, "scope"),
                price: field(data, "price"),
                hours: Number(field(data, "hours")),
              });
            }}
          >
            <h3>{t("Publicar o actualizar servicio")}</h3>
            <label>
              {t("Especialidad")}
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as ServiceKind)}
              >
                {kinds.map((id) => (
                  <option key={id} value={id}>
                    {t(SERVICE_KINDS[id].name)}
                  </option>
                ))}
              </select>
            </label>
            <p>{t(terms.proof)}</p>
            <label>
              {t("Título del servicio")}
              <input
                key={kind + "-title"}
                name="title"
                maxLength={64}
                defaultValue={mine?.title}
                required
              />
            </label>
            <label>
              {t("Alcance y entrega")}
              <textarea
                key={kind + "-scope"}
                name="scope"
                maxLength={280}
                defaultValue={mine?.description}
                required
              />
            </label>
            <div className="contract-inline">
              <label>
                {t("Precio del servicio en BTC")}
                <input
                  key={kind + "-price"}
                  type="number"
                  name="price"
                  min={terms.min}
                  max={terms.max}
                  step="0.00000001"
                  defaultValue={mine ? formatPvpBtc(mine.priceSats) : terms.min}
                  required
                />
              </label>
              <label>
                {t("Plazo en horas")}
                <input
                  key={kind + "-hours"}
                  type="number"
                  name="hours"
                  min={1}
                  max={168}
                  defaultValue={mine?.hours ?? 24}
                  required
                />
              </label>
            </div>
            <p className="station-muted">
              {t("Comisión al liquidar: {fee} %.", {
                fee: SERVICE_FEE_PERCENT,
              })}
            </p>
            <button disabled={busy || !state.canTrade || !state.merchant}>
              {t("Publicar servicio")}
            </button>
          </form>
        </div>
      )}
      {hiring && (
        <HireDialog
          offer={hiring}
          assets={state.serviceAssets}
          balance={state.balanceSats}
          busy={busy}
          feedback={feedback}
          run={run}
          close={() => setHiring(null)}
          onHired={() => {
            setHiring(null);
            setMode("jobs");
          }}
        />
      )}
    </div>
  );
}
