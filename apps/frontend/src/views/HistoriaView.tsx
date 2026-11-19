import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Terminal } from "../components/Terminal/Terminal";
import { ensureGuestSession, fetchUserProgress } from "../lib/api";
import { useLocale } from "../lib/locale";
import opening from "./story-opening.json";
import "./StoryOpening.css";

function marker(userId: string) {
  return "xwd.story.prologue." + userId;
}
function watched(userId: string) {
  try {
    return localStorage.getItem(marker(userId)) === "seen";
  } catch {
    return false;
  }
}

function Prologue({ onContinue }: { onContinue: () => void }) {
  const { t, locale } = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [error, setError] = useState(false);
  const base = import.meta.env.BASE_URL + "intro/vanta-";
  const begin = () => {
    const element = video.current;
    if (!element) return;
    element.muted = false;
    setStarted(true);
    void element.play().catch(() => setError(true));
  };
  return (
    <section className="story-opening" aria-labelledby="opening-title">
      <div className="opening-stage">
        <video
          ref={video}
          controls={started}
          playsInline
          preload="metadata"
          poster={base + (locale === "es" ? "es-poster.webp" : "poster.webp")}
          aria-label={t("Cinemática de la primera guardia")}
          onEnded={onContinue}
          onError={() => setError(true)}
          src={base + locale + ".mp4"}
        >
          <track
            default={locale === "en"}
            kind="captions"
            srcLang={locale}
            label={locale === "en" ? "English" : "Español"}
            src={base + locale + ".vtt"}
          />
        </video>
        {!started && (
          <div className="opening-cover">
            <p>2061 · VANTA</p>
            <h2 id="opening-title">{t("La primera guardia")}</h2>
            <button type="button" onClick={begin} className="opening-play">
              <span aria-hidden="true">▶</span> {t("Iniciar historia con voz")}
            </button>
          </div>
        )}
        {started && (
          <h2 className="sr-only" id="opening-title">
            {t("La primera guardia")}
          </h2>
        )}
      </div>
      <div className="opening-controls">
        <button
          type="button"
          onClick={() => setTranscript(!transcript)}
          aria-expanded={transcript}
        >
          {t("Leer transcripción")}
        </button>
        <button type="button" onClick={onContinue}>
          {t("Ir a la terminal")}
        </button>
      </div>
      {error && (
        <p role="alert">
          {t(
            "El video no se pudo reproducir. Puedes leer la transcripción o abrir la terminal.",
          )}
        </p>
      )}
      {transcript && (
        <div className="opening-transcript">
          {opening.map((scene) => (
            <section key={scene.title[0]}>
              <h3>{scene.title[locale === "en" ? 1 : 0]}</h3>
              {scene.beats.map((line) => (
                <p key={String(line[0])}>
                  {String(line[locale === "en" ? 1 : 0])}
                </p>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function StorySession({ wsUrl, replay }: { wsUrl: string; replay: boolean }) {
  const { t } = useLocale();
  const [session, setSession] = useState<{
    userId: string;
    returning: boolean;
  }>();
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void ensureGuestSession()
      .then(async (user) => {
        const progress = await fetchUserProgress();
        if (active)
          setSession({
            userId: user.id,
            returning:
              watched(user.id) || progress.some((row) => row.completed),
          });
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudo cargar la partida.",
          );
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const proceed = () => {
    if (session) {
      try {
        localStorage.setItem(marker(session.userId), "seen");
      } catch {
        /* The terminal can still open. */
      }
    }
    if (replay) {
      const url = new URL(window.location.href);
      url.searchParams.delete("intro");
      window.history.replaceState(window.history.state, "", url);
    }
    setFinished(true);
  };
  useEffect(() => {
    if (finished) document.getElementById("main")?.focus();
  }, [finished]);
  if (error)
    return (
      <div role="alert">
        {t(error)}{" "}
        <button
          onClick={() => {
            setError("");
            setRetry(retry + 1);
          }}
        >
          {t("Reintentar")}
        </button>
      </div>
    );
  if (!session) return <p role="status">{t("Cargando partida…")}</p>;
  return !finished && (replay || !session.returning) ? (
    <Prologue onContinue={proceed} />
  ) : (
    <Terminal wsUrl={wsUrl} />
  );
}

export function HistoriaView({ wsUrl }: { wsUrl: string }) {
  const { search } = useLocation();
  const [params] = useSearchParams();
  if (params.has("practica"))
    return <Navigate to={"/practicas" + search} replace />;
  return (
    <StorySession
      key={search}
      wsUrl={wsUrl}
      replay={params.get("intro") === "1"}
    />
  );
}
