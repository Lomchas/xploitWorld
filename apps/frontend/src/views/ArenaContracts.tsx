import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  type ExchangeAction,
  type ExchangeState,
  type ExchangeResult,
} from "@null-protocol/shared";
import { ServiceDesk } from "../components/Exchange/ServiceDesk";
import { ApiError, exchangeAction, fetchContracts } from "../lib/api";
import { useLocale } from "../lib/locale";
import { requestId } from "../lib/request-id";
import { WalletView } from "./WalletView";

function ArenaDesk({
  identity,
  onWallet,
}: {
  identity: string;
  onWallet: () => void;
}) {
  const { t } = useLocale();
  const [state, setState] = useState<ExchangeState>();
  const [feedback, setFeedback] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [retry, setRetry] = useState<{ key: string; action: ExchangeAction }>();
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const refresh = () => fetchContracts().then(setState);
  const update = () => {
    void refresh()
      .then(onWallet)
      .catch((error: unknown) =>
        setFeedback({
          error: true,
          text:
            error instanceof Error
              ? error.message
              : "Falló la lectura de contratos.",
        }),
      );
  };
  useEffect(() => {
    let active = true;
    void fetchContracts()
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
                : "Falló la lectura de contratos.",
          });
      });
    return () => {
      active = false;
    };
  }, [identity]);
  const send = async (
    action: ExchangeAction,
    key = requestId(),
  ): Promise<ExchangeResult | null> => {
    if (sending.current) return null;
    sending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await exchangeAction(key, action, "contracts");
      setRetry(undefined);
      setFeedback({ error: false, text: result.message });
      onWallet();
      await refresh().catch(() => undefined);
      return result;
    } catch (error) {
      setRetry(
        !(error instanceof ApiError) || error.status >= 500
          ? { key, action }
          : undefined,
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
      setBusy(false);
      sending.current = false;
    }
  };
  const reward = state?.rewards.find((row) => row.id === "rival");
  return (
    <div className="exchange-board">
      <div className="exchange-body">
        <button onClick={update} disabled={busy}>
          {t("Actualizar")}
        </button>
        {feedback && (
          <p
            className={
              feedback.error
                ? "pvp-feedback pvp-feedback-error"
                : "pvp-feedback"
            }
            role={feedback.error ? "alert" : "status"}
          >
            {t(feedback.text)}
          </p>
        )}
        {retry && (
          <button
            disabled={busy}
            onClick={() => void send(retry.action, retry.key)}
          >
            {t("Reintentar la misma operación")}
          </button>
        )}
        {state ? (
          <>
            {!state.canTrade && (
              <p className="trade-access">
                {t(
                  "Despliega tu equipo y vincula tu perfil de Arena para contratar.",
                )}{" "}
                <Link to="/pvp">{t("Abrir mi escritorio")}</Link>
                {" · "}
                <a href="#account-title">{t("Cuenta de Arena")}</a>
              </p>
            )}
            {reward && (
              <details className="pvp-card">
                <summary>{t("Recompensas de Arena")}</summary>
                <p>
                  {t(
                    "Verifica enlaces virtuales con otros operadores vinculados. Hay hasta dos pagos por día y cada operador cuenta una vez por semana.",
                  )}
                </p>
                <button
                  disabled={busy || !!retry || reward.state !== "ready"}
                  onClick={() =>
                    void send({ type: "reward.claim", reward: "rival" })
                  }
                >
                  {reward.state === "ready"
                    ? t("Reclamar {btc} BTC", { btc: reward.available })
                    : t("Objetivo pendiente")}
                </button>
              </details>
            )}
            <ServiceDesk
              state={state}
              busy={busy || !!retry}
              run={send}
              feedback={feedback}
            />
          </>
        ) : (
          <p role="status">{t("Consultando contratos…")}</p>
        )}
      </div>
    </div>
  );
}

export function ArenaContracts() {
  return (
    <WalletView
      arena
      renderDesk={(identity, onWallet) => (
        <ArenaDesk identity={identity} onWallet={onWallet} />
      )}
    />
  );
}
