import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  DAILY_DUTY_MAX,
  DUTY_RESERVE_BTC,
  REWARDS,
  type DutyBoard,
  type ExchangeState,
} from "@null-protocol/shared";
import { useLocale } from "../../lib/locale";
import { incidentReference } from "./guides";
import type { RunExchange } from "./ExchangeDesk";

function DutyForm({
  work,
  busy,
  retryAt,
  run,
}: {
  work: NonNullable<DutyBoard["next"]>;
  busy: boolean;
  retryAt: string | null;
  run: RunExchange;
}) {
  const { t } = useLocale();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const seconds = retryAt
    ? Math.max(0, Math.ceil((Date.parse(retryAt) - now) / 1000))
    : 0;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const [first, second] = [answers[0], answers[1]];
    if (first !== undefined && second !== undefined && !seconds)
      void run({ type: "duty.submit", id: work.id, answers: [first, second] });
  };
  return (
    <form className="duty-form" onSubmit={submit}>
      <h3>{t(work.title)}</h3>
      <p>{t(work.briefing)}</p>
      {work.questions.map(({ prompt, options }, index) => (
        <fieldset key={prompt}>
          <legend>{t(prompt)}</legend>
          {options.map((option, value) => (
            <label key={option}>
              <input
                type="radio"
                name={"duty-" + index}
                checked={answers[index] === value}
                onChange={() => setAnswers({ ...answers, [index]: value })}
              />
              {t(option)}
            </label>
          ))}
        </fieldset>
      ))}
      <button
        className="exchange-action"
        disabled={
          busy ||
          seconds > 0 ||
          Object.keys(answers).length < work.questions.length
        }
      >
        {seconds
          ? t("Reintento en {seconds} s", { seconds })
          : t("Entregar guardia · {btc} BTC", { btc: work.reward })}
      </button>
    </form>
  );
}

export function RewardDesk({
  state,
  busy,
  run,
}: {
  state: ExchangeState;
  busy: boolean;
  run: RunExchange;
}) {
  const { t } = useLocale();
  return (
    <div className="rewards-desk">
      <section className="duty-card" aria-labelledby="duty-title">
        <header>
          <h3 id="duty-title">{t("Guardias defensivas")}</h3>
          <span>
            {state.duty.earned} / {DAILY_DUTY_MAX} BTC · UTC
          </span>
        </header>
        <p>
          {t(
            "Resuelve casos con evidencia del juego. Cada día hay tres pagos de hasta 8, 5 y 3 BTC.",
          )}
        </p>
        {state.duty.next ? (
          <DutyForm
            key={state.duty.next.id}
            work={state.duty.next}
            busy={busy}
            run={run}
            retryAt={state.duty.retryAt}
          />
        ) : (
          <p role="status">
            {state.duty.reserveReached
              ? t(
                  "Las guardias vuelven a pagar cuando tu saldo baja de {btc} BTC.",
                  { btc: DUTY_RESERVE_BTC },
                )
              : t(
                  "Ya completaste las guardias de hoy. El tablero se renueva a medianoche UTC.",
                )}
          </p>
        )}
        <a
          className="exchange-doc"
          href={incidentReference.url}
          target="_blank"
          rel="noreferrer"
        >
          {incidentReference.title} ↗
        </a>
      </section>
      <section aria-labelledby="milestones-title">
        <h3 id="milestones-title">{t("Hitos y prácticas")}</h3>
        <div className="reward-list">
          {state.rewards.map((row) => (
            <article className="reward-item" key={row.id}>
              <div>
                <h4>{t(REWARDS[row.id].name)}</h4>
                <p>{t(REWARDS[row.id].description)}</p>
              </div>
              <div className="reward-item-action">
                <button
                  type="button"
                  disabled={busy || row.state !== "ready"}
                  onClick={() =>
                    void run({ type: "reward.claim", reward: row.id })
                  }
                >
                  {row.state === "ready"
                    ? t("Reclamar {btc} BTC", { btc: row.available })
                    : t(
                        row.state === "claimed"
                          ? "Acreditada"
                          : "Objetivo pendiente",
                      )}
                </button>
                {row.id === "academy" && (
                  <Link to="/practicas">{t("Ir a Prácticas")}</Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
