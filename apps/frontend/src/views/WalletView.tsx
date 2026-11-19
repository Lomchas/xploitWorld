import { useLocale } from "../lib/locale";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  formatPvpBtc,
  languageTag,
  type AccountState,
} from "@null-protocol/shared";
import {
  ensureGuestSession,
  fetchAccount,
  linkAccount,
  loginAccount,
  logoutAccount,
  restoreMigratedAccount,
} from "../lib/api";
import "./PVPView.css";
import "./Trade.css";

function newKey(): string {
  return (
    "xwd_" +
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  );
}

const ledgerNames: Record<string, string> = {
  starter: "Crédito de primer despliegue",
  "shop-buy": "Compra en tienda",
  "reward-practice": "Recompensa de práctica",
  "reward-pvp": "Recompensa de arena",
  "market-buy": "Compra de artículo",
  "market-sale": "Venta de artículo",
  "market-fee": "Comisión de mercado",
  "service-hold": "Reserva de servicio",
  "service-pay": "Cobro de servicio",
  "service-refund": "Reembolso de servicio",
  "service-fee": "Comisión de servicio",
  "reward-duty": "Guardia defensiva",
  "reward-academy": "Recompensa de práctica",
  "migration-opening": "Ajuste de migración",
  "retired-item-refund": "Devolución de carga",
  "duplicate-refund": "Reembolso de artículo duplicado",
};

export function WalletView({
  arena = false,
  renderDesk,
}: {
  arena?: boolean;
  renderDesk: (identity: string, refresh: () => void) => ReactNode;
}) {
  const { t, locale } = useLocale();
  const [account, setAccount] = useState<AccountState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"link" | "login" | "restore">("link");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [claim, setClaim] = useState("");
  const currency = t(arena ? "BTC de Arena" : "BTC de Historia");

  useEffect(() => {
    let active = true;
    void ensureGuestSession()
      .then(fetchAccount)
      .then((state) => {
        if (active) setAccount(state);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Falló la consulta de la billetera.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (account && window.location.hash === "#account-title")
      document.getElementById("account-title")?.scrollIntoView();
  }, [account]);

  const selectMode = (value: "link" | "login" | "restore"): void => {
    setMode(value);
    setName("");
    setKey("");
    setClaim("");
    setSaved(false);
    setError("");
  };
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy || (mode !== "login" && !saved)) return;
    setError("");
    setBusy(true);
    try {
      const credentials = {
        username: name.trim().toLowerCase(),
        key: key.trim(),
      };
      if (mode === "link") {
        setAccount(await linkAccount(credentials));
        window.dispatchEvent(new Event("xwd:wallet"));
        setKey("");
      } else {
        if (mode === "restore")
          await restoreMigratedAccount({ ...credentials, claim: claim.trim() });
        else await loginAccount(credentials);
        window.location.reload();
      }
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "La operación de cuenta falló.",
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async (): Promise<void> => {
    setError("");
    setBusy(true);
    try {
      await logoutAccount();
      window.location.reload();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Falló el cierre de sesión.",
      );
      setBusy(false);
    }
  };
  return (
    <section className="pvp-view" aria-labelledby="exchange-title">
      <header className="exchange-header">
        <div>
          <h1 id="exchange-title">{t(arena ? "Contratos" : "Exchange")}</h1>
          <p>
            {t(arena ? "Mesa de contratos de Arena" : "Mesa de operaciones")}
          </p>
        </div>
        {account && (
          <a
            href="#wallet-title"
            className="exchange-wallet"
            onClick={() => {
              const ledger =
                document.getElementById("wallet-title")?.parentElement;
              if (ledger instanceof HTMLDetailsElement) ledger.open = true;
            }}
          >
            <span>{t("Saldo del juego")}</span>
            <strong>
              {formatPvpBtc(account.balanceSats ?? "0")} {currency}
            </strong>
          </a>
        )}
      </header>
      {error && (
        <p className="pvp-feedback pvp-feedback-error" role="alert">
          {t(error)}
        </p>
      )}
      {!account && !error && <p role="status">{t("Cargando tu billetera…")}</p>}
      {account &&
        renderDesk(account.username, () => {
          void fetchAccount()
            .then(setAccount)
            .catch(() => undefined);
          window.dispatchEvent(new Event("xwd:wallet"));
        })}
      {account && (
        <div className="pvp-columns exchange-account-grid">
          <details className="pvp-card exchange-ledger">
            <summary id="wallet-title">
              {t("Billetera")} · {formatPvpBtc(account.balanceSats ?? "0")}{" "}
              {currency}
            </summary>
            <h3>{t("Movimientos recientes")}</h3>
            {account.movements.length === 0 && (
              <p className="pvp-muted">{t("Sin movimientos.")}</p>
            )}
            <ul className="pvp-list">
              {account.movements.map((entry) => (
                <li key={entry.id} className="pvp-row">
                  <span>
                    <strong>{t(ledgerNames[entry.kind] ?? entry.kind)}</strong>
                    <small>
                      <time dateTime={entry.createdAt}>
                        {new Date(entry.createdAt).toLocaleString(
                          languageTag(locale),
                        )}
                      </time>
                    </small>
                  </span>
                  <span>
                    {entry.deltaSats.startsWith("-") ? "" : "+"}
                    {formatPvpBtc(entry.deltaSats)} {currency}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <section className="pvp-card" aria-labelledby="account-title">
            <h2 id="account-title">
              {t(arena ? "Cuenta de Arena" : "Cuenta de Historia")}
            </h2>
            {account.linked ? (
              <>
                <p>
                  {t("Operador activo: ")}
                  <strong>{account.username}</strong>
                </p>
                <p className="pvp-muted">
                  {t(
                    "Tu nombre y clave de acceso recuperan este perfil desde otro navegador.",
                  )}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  {t("Cerrar sesión")}
                </button>
              </>
            ) : (
              <>
                <nav className="pvp-tabs" aria-label={t("Acceso de operador")}>
                  <button
                    type="button"
                    aria-pressed={mode === "link"}
                    disabled={busy}
                    onClick={() => selectMode("link")}
                  >
                    {t("Vincular invitado")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "login"}
                    disabled={busy}
                    onClick={() => selectMode("login")}
                  >
                    {t("Iniciar sesión")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "restore"}
                    disabled={busy}
                    onClick={() => selectMode("restore")}
                  >
                    {t("Migrar perfil M6.4")}
                  </button>
                </nav>
                <form
                  className="pvp-deploy-form"
                  onSubmit={(event) => void submit(event)}
                >
                  <label>
                    {t("Nombre de operador")}
                    <input
                      autoComplete="username"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      minLength={3}
                      maxLength={24}
                      pattern="[a-z0-9][a-z0-9_\-]{2,23}"
                      required
                    />
                  </label>
                  {mode === "restore" && (
                    <label>
                      {t("Código de migración")}
                      <input
                        value={claim}
                        onChange={(event) => setClaim(event.target.value)}
                        autoComplete="off"
                        required
                      />
                    </label>
                  )}
                  {mode !== "login" ? (
                    <>
                      <p>
                        {t(
                          "Vincula el perfil invitado de este navegador. Guarda la clave para entrar desde otros equipos.",
                        )}
                      </p>
                      {!key && (
                        <button type="button" onClick={() => setKey(newKey())}>
                          {t("Generar clave de acceso")}
                        </button>
                      )}
                      {key && (
                        <>
                          <label>
                            {t("Tu clave de acceso")}
                            <input
                              value={key}
                              readOnly
                              onFocus={(event) => event.target.select()}
                              autoComplete="off"
                            />
                          </label>
                          <label className="exchange-check">
                            <input
                              type="checkbox"
                              checked={saved}
                              onChange={(event) =>
                                setSaved(event.target.checked)
                              }
                              required
                            />
                            {t("Guardé mi clave en un lugar privado.")}
                          </label>
                        </>
                      )}
                    </>
                  ) : (
                    <label>
                      {t("Clave de acceso")}
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={key}
                        onChange={(event) => setKey(event.target.value)}
                        required
                      />
                    </label>
                  )}
                  <button
                    className="pvp-primary"
                    disabled={busy || (mode !== "login" && !saved)}
                    type="submit"
                  >
                    {busy
                      ? t("Procesando…")
                      : mode === "restore"
                        ? t(
                            arena
                              ? "Recuperar mi equipo"
                              : "Recuperar mi partida",
                          )
                        : mode === "link"
                          ? t("Vincular mi perfil")
                          : t("Entrar al operador")}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
