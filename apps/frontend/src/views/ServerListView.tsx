import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  atlasRoute,
  isPvpRegionId,
  languageTag,
  pvpRegion,
  PVP_REGIONS,
  type AtlasContinent,
  type PvpRegion,
  type PvpRegionId,
  type WorldState,
} from "@null-protocol/shared";
import { AtlasMap } from "../components/Atlas/AtlasMap";
import {
  clockText,
  countryNames,
  continents,
  locationOf,
  normalize,
  preferredArena,
  profiles,
  readFavorites,
  roles,
  storeFavorites,
} from "../components/Atlas/atlas-model";
import type { Layers, MapPoint } from "../components/Atlas/cartography";
import { usePvpWorld } from "../hooks/usePvpWorld";
import { useWorld } from "../hooks/useWorld";
import {
  ApiError,
  ensureGuestSession,
  fetchPvpState,
  transferPvp,
} from "../lib/api";
import { useLocale } from "../lib/locale";
import {
  arenaName,
  readSelectedServer,
  saveSelectedServer,
} from "../lib/servers";
import "./Atlas.css";

const PAGE_SIZE = 12;
const spanishCountryName = countryNames("es");
const englishCountryName = countryNames("en");
const countryCodes = new Set(
  PVP_REGIONS.flatMap((region) => (region.site ? [region.site.country] : [])),
);
const signalName = {
  SCAN: "Reconocimiento",
  PROBE: "Sonda de red",
  COMPROMISE: "Dispositivo comprometido",
  LINK: "Enlace virtual",
};
type Signal = WorldState["signals"][number];
type Sort = "name" | "active" | "near" | "space";

function Traffic({
  world,
  scope,
  global,
  setGlobal,
  timeZone,
  open,
}: {
  world: WorldState | null;
  scope: string;
  global: boolean;
  setGlobal: (global: boolean) => void;
  timeZone?: string;
  open: (id: PvpRegionId) => void;
}) {
  const { t, locale } = useLocale();
  const [hour, setHour] = useState<string>();
  const series = world?.series;
  const signals: Signal[] = world?.signals ?? [];
  const labels = new Intl.DateTimeFormat(languageTag(locale), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const fullDate = new Intl.DateTimeFormat(languageTag(locale), {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const selectedHour = series?.find((entry) => entry.hour === hour);
  const totals =
    selectedHour ??
    series?.reduce(
      (sum, entry) => ({
        scans: sum.scans + entry.scans,
        probes: sum.probes + entry.probes,
        compromises: sum.compromises + entry.compromises,
        links: sum.links + entry.links,
      }),
      { scans: 0, probes: 0, compromises: 0, links: 0 },
    );
  const counts = (series ?? []).map(
    ({ scans, probes, compromises, links }) =>
      scans + probes + compromises + links,
  );
  const highest = Math.max(1, ...counts);
  return (
    <aside
      className="atlas-traffic atlas-card"
      aria-labelledby="atlas-traffic-title"
    >
      <div className="atlas-block-heading">
        <h3 id="atlas-traffic-title">{t("Actividad de la red")}</h3>
        <span>12 h</span>
      </div>
      <div
        className="atlas-traffic-scope"
        role="group"
        aria-label={t("Alcance de la actividad")}
      >
        <button
          type="button"
          aria-pressed={!global}
          onClick={() => setGlobal(false)}
        >
          {t("Esta arena")}
        </button>
        <button
          type="button"
          aria-pressed={global}
          onClick={() => setGlobal(true)}
        >
          {t("Global")}
        </button>
      </div>
      <p className="atlas-traffic-context">{scope}</p>
      {series && (
        <div
          className="atlas-bars"
          role="group"
          aria-label={t(
            "{count} operaciones durante las últimas 12 franjas horarias",
            {
              count: counts.reduce((sum, count) => sum + count, 0),
            },
          )}
        >
          {series.map(({ hour }, index) => (
            <button
              type="button"
              key={hour}
              aria-pressed={selectedHour?.hour === hour}
              aria-label={t("{time} · {count} operaciones", {
                time: fullDate.format(new Date(hour)),
                count: counts[index]!,
              })}
              title={fullDate.format(new Date(hour)) + " · " + counts[index]}
              onClick={() =>
                setHour((active) => (active === hour ? undefined : hour))
              }
            >
              <span
                style={{ height: 4 + (94 * counts[index]!) / highest + "%" }}
              />
            </button>
          ))}
        </div>
      )}
      {totals && (
        <>
          <p className="atlas-traffic-window">
            {selectedHour
              ? fullDate.format(new Date(selectedHour.hour))
              : t("Últimas 12 franjas horarias")}
            {selectedHour && (
              <button
                type="button"
                className="atlas-inline"
                onClick={() => setHour(undefined)}
              >
                {t("Ver las 12 horas")}
              </button>
            )}
          </p>
          <dl
            className="atlas-traffic-totals"
            aria-label={t("Desglose de operaciones")}
          >
            {(
              [
                ["scans", "Reconocimiento"],
                ["probes", "Sonda de red"],
                ["compromises", "Dispositivo comprometido"],
                ["links", "Enlace virtual"],
              ] as const
            ).map(([kind, name]) => (
              <div key={kind}>
                <dt>{t(name)}</dt>
                <dd>{totals[kind]}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <h4>{t("Señales recientes")}</h4>
      {signals.length ? (
        <ol>
          {signals.slice(0, 5).map((signal) => (
            <li key={signal.id}>
              <button type="button" onClick={() => open(signal.region)}>
                <strong>
                  {arenaName(pvpRegion(signal.region), locale, t)}
                </strong>
                <span>{t(signalName[signal.kind])}</span>
              </button>
              <time dateTime={signal.createdAt}>
                {labels.format(new Date(signal.createdAt))}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="atlas-muted">
          {t(series ? "Sin señales recientes." : "Esperando datos de señales")}
        </p>
      )}
      <h4>{t("Clasificación")}</h4>
      {world?.ranking.length ? (
        <ol className="atlas-ranking">
          {world.ranking.slice(0, 5).map((operator) => (
            <li key={operator.region + "/" + operator.alias}>
              <button type="button" onClick={() => open(operator.region)}>
                <strong>{operator.alias}</strong>
                {global && (
                  <span>
                    {arenaName(pvpRegion(operator.region), locale, t)}
                  </span>
                )}
              </button>
              <span>{t("{count} puntos", { count: operator.score })}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="atlas-muted">
          {t(
            world
              ? "Todavía no hay puntuaciones."
              : "Esperando datos de señales",
          )}
        </p>
      )}
      {world && (
        <p className="atlas-reading">
          <time dateTime={world.generatedAt}>
            {t("Lectura de {time}", {
              time: labels.format(new Date(world.generatedAt)),
            })}
          </time>
          <span>{timeZone || t("Tu hora local")}</span>
        </p>
      )}
    </aside>
  );
}

export function ServerListView({ wsUrl }: { wsUrl: string }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const invite = params.get("arena");
  const operator = usePvpWorld(wsUrl, 0, "");
  const self = operator.state?.self;
  const currentId = self?.regionId;
  const [fallback] = useState(
    () => readSelectedServer()?.id ?? preferredArena(),
  );
  const [focus, setFocus] = useState(0);
  const [continent, setContinent] = useState<AtlasContinent | "">("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [favorites, setFavorites] = useState(readFavorites);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [global, setGlobal] = useState(false);
  const [page, setPage] = useState(0);
  const [layers, setLayers] = useState<Layers>({
    borders: true,
    night: false,
    traffic: true,
  });
  const [fixedOrigin, setFixedOrigin] = useState<PvpRegionId>();
  const [compare, setCompare] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [enterError, setEnterError] = useState("");
  const [rename, setRename] = useState(false);
  const [alias, setAlias] = useState("");
  const [share, setShare] = useState<"copied" | "manual">();
  const entering = useRef(false);
  const results = useRef<HTMLHeadingElement>(null);
  const details = useRef<HTMLHeadingElement>(null);
  const selectedId = isPvpRegionId(invite) ? invite : (currentId ?? fallback);
  const scope = global ? undefined : selectedId;
  const pulse = useWorld(scope);
  const traffic = pulse.world?.scope === scope ? pulse.world : null;
  const selected = pvpRegion(selectedId);
  const timeZone = selected.site?.timeZone;
  const time = timeZone ? clockText(clock, timeZone, locale) : null;
  const countries = useMemo(() => countryNames(locale), [locale]);
  const languages = useMemo(
    () => new Intl.DisplayNames([languageTag(locale)], { type: "language" }),
    [locale],
  );
  const commonLanguages = selected.site?.langs
    .map((id) => languages.of(id) ?? id)
    .join(" · ");
  const number = useMemo(
    () => new Intl.NumberFormat(languageTag(locale)),
    [locale],
  );
  const names = useMemo(
    () =>
      new Map(
        PVP_REGIONS.map((region) => [region.id, arenaName(region, locale, t)]),
      ),
    [locale, t],
  );
  const counters = useMemo(
    () => new Map(pulse.world?.regions.map((region) => [region.id, region])),
    [pulse.world],
  );
  const selectedStats = counters.get(selectedId);
  const atDestination = currentId === selectedId;
  const sourceId = fixedOrigin ?? currentId;
  const source = sourceId ? pvpRegion(sourceId) : undefined;
  const route =
    source && source.id !== selectedId
      ? atlasRoute(
          locationOf(source),
          locationOf(selected),
          source.accessMs + selected.accessMs,
        )
      : undefined;
  const cityCount = PVP_REGIONS.filter((region) => region.site).length;
  const online = pulse.world?.regions.reduce((sum, row) => sum + row.online, 0);
  const network = "2001:db8:" + selected.network + "::/48";

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    setShare(undefined);
    setEnterError("");
    setRename(false);
    setAlias("");
  }, [selectedId]);
  useEffect(() => {
    if (isPvpRegionId(invite)) setFocus((value) => value + 1);
  }, [invite]);

  const sorted = useMemo(() => {
    const code = query.trim();
    const exactCode = countryCodes.has(code) ? code : undefined;
    const tokens = normalize(query).split(/\s+/u).filter(Boolean);
    const from = sourceId ? locationOf(pvpRegion(sourceId)) : undefined;
    const distance = (region: PvpRegion) =>
      from ? atlasRoute(from, locationOf(region), 0).km : 0;
    return PVP_REGIONS.filter((region) => {
      if (continent && region.continent !== continent) return false;
      if (favoritesOnly && !favorites.includes(region.id)) return false;
      if (activeOnly && !counters.get(region.id)?.online) return false;
      if (availableOnly && region.id !== currentId) {
        const stats = counters.get(region.id);
        if (
          pulse.stale ||
          !stats ||
          stats.devices >= (region.capacity ?? Infinity)
        )
          return false;
      }
      const country = region.site?.country;
      if (exactCode) return country === exactCode;
      const haystack = normalize(
        [
          names.get(region.id),
          region.name,
          region.site?.english,
          country && spanishCountryName(country),
          country && englishCountryName(country),
          country,
          region.id,
        ].join(" "),
      );
      return tokens.every((token) => haystack.includes(token));
    }).sort((a, b) => {
      if (sort === "space") {
        const aFree =
          (a.capacity ?? Number.MAX_SAFE_INTEGER) -
          (counters.get(a.id)?.devices ?? 0);
        const bFree =
          (b.capacity ?? Number.MAX_SAFE_INTEGER) -
          (counters.get(b.id)?.devices ?? 0);
        if (aFree !== bFree) return bFree - aFree;
      }
      if (sort === "active") {
        const first = counters.get(a.id);
        const second = counters.get(b.id);
        const difference =
          (second?.online ?? 0) - (first?.online ?? 0) ||
          (second?.activity ?? 0) - (first?.activity ?? 0);
        if (difference) return difference;
      }
      if (sort === "near" && from) {
        const difference = distance(a) - distance(b);
        if (difference) return difference;
      }
      return names
        .get(a.id)!
        .localeCompare(names.get(b.id)!, languageTag(locale));
    });
  }, [
    query,
    continent,
    favoritesOnly,
    favorites,
    activeOnly,
    availableOnly,
    currentId,
    pulse.stale,
    counters,
    names,
    sort,
    sourceId,
    locale,
  ]);

  const makePoint = (region: PvpRegion): MapPoint => {
    const stat = counters.get(region.id);
    const { lon, lat, country } = locationOf(region);
    return {
      id: region.id,
      name: names.get(region.id)!,
      lon,
      lat,
      country,
      online: stat?.online ?? 0,
      activity: stat?.activity ?? 0,
      full:
        !pulse.stale &&
        region.capacity !== undefined &&
        stat !== undefined &&
        stat.devices >= region.capacity,
    };
  };
  const selectedPoint = makePoint(selected);
  const current = currentId ? makePoint(pvpRegion(currentId)) : undefined;
  const anchor = compare && source ? makePoint(source) : undefined;
  const mapPoints = [
    ...sorted
      .filter(
        (region) =>
          region.site &&
          region.id !== selectedId &&
          region.id !== currentId &&
          region.id !== anchor?.id,
      )
      .map(makePoint),
    selectedPoint,
    ...(current && current.id !== selectedId ? [current] : []),
    ...(anchor && anchor.id !== selectedId && anchor.id !== currentId
      ? [anchor]
      : []),
  ];
  const filteredPage = Math.min(
    page,
    Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1),
  );
  const visible = sorted.slice(
    filteredPage * PAGE_SIZE,
    (filteredPage + 1) * PAGE_SIZE,
  );
  const select = (id: PvpRegionId) => {
    if (!entering.current) setParams({ arena: id }, { replace: true });
  };
  const showDetails = (id: PvpRegionId) => {
    if (entering.current) return;
    select(id);
    const heading = details.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const { top, bottom } = heading.getBoundingClientRect();
    if (top < 48 || bottom > window.innerHeight)
      heading.scrollIntoView({ block: "center" });
  };
  const selectCountry = (code: string) => {
    const primary = PVP_REGIONS.find((region) => region.site?.country === code);
    const match =
      primary && sorted.includes(primary)
        ? primary
        : sorted.find((region) => region.site?.country === code);
    if (match) select(match.id);
  };
  const star = () => {
    const next = favorites.includes(selectedId)
      ? favorites.filter((id) => id !== selectedId)
      : [...favorites, selectedId];
    setFavorites(next);
    storeFavorites(next);
    setPage(0);
  };
  const url = new URL("/servidores", location.origin);
  url.searchParams.set("arena", selectedId);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url.href);
      setShare("copied");
    } catch {
      setShare("manual");
    }
  };
  const enter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (entering.current) return;
    entering.current = true;
    setBusy(true);
    setEnterError("");
    try {
      await ensureGuestSession();
      const { self: live } = await fetchPvpState(0, "");
      if (live && live.regionId !== selectedId)
        await transferPvp(
          selectedId,
          live.arenaVisit,
          rename ? alias.trim() : undefined,
        );
      saveSelectedServer(selected);
      navigate("/pvp", { state: { serverId: selectedId } });
    } catch (error: unknown) {
      setEnterError(
        error instanceof Error
          ? error.message
          : "No se pudo entrar a la arena.",
      );
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.message.includes("alias")
      )
        setRename(true);
    } finally {
      entering.current = false;
      setBusy(false);
    }
  };
  const distance = route && number.format(route.km) + " km";
  const changePage = (next: number) => {
    setPage(next);
    results.current?.focus({ preventScroll: true });
  };
  const clearFilters = () => {
    setQuery("");
    setContinent("");
    setActiveOnly(false);
    setAvailableOnly(false);
    setFavoritesOnly(false);
    setPage(0);
  };

  return (
    <section className="atlas-view" aria-labelledby="atlas-title">
      <header className="atlas-header">
        <div>
          <h2 id="atlas-title">{t("Atlas de señales")}</h2>
          <p>
            <span className="atlas-self-dot" />
            {current
              ? t("Mi despliegue · {name}", { name: current.name })
              : t("Sin despliegue activo")}
            {current && (
              <button
                className="atlas-inline"
                type="button"
                onClick={() => {
                  select(current.id);
                  setFocus((value) => value + 1);
                }}
              >
                {t("Ver mi posición")}
              </button>
            )}
          </p>
        </div>
        <dl className="atlas-metrology">
          <div>
            <dt>{t("Ubicaciones")}</dt>
            <dd>{number.format(cityCount)}</dd>
          </div>
          <div>
            <dt>{t("En línea")}</dt>
            <dd>{online === undefined ? "—" : number.format(online)}</dd>
          </div>
          <div>
            <dt>{t("RTT API")}</dt>
            <dd>{pulse.latency === null ? "—" : pulse.latency + " ms"}</dd>
          </div>
        </dl>
      </header>
      {pulse.stale && (
        <p className="atlas-notice" role="status">
          {t(
            pulse.world
              ? "Telemetría sin actualizar. Mostrando la última lectura."
              : "Telemetría temporalmente sin conexión.",
          )}
        </p>
      )}

      <div className="atlas-main">
        <AtlasMap
          selected={selectedPoint}
          current={current}
          anchor={anchor}
          points={mapPoints}
          layers={layers}
          clock={clock}
          focusKey={focus}
          onSelect={select}
          onCountry={selectCountry}
          controls={
            <div
              className="atlas-layer-controls"
              role="group"
              aria-label={t("Capas del atlas")}
            >
              {(
                [
                  ["borders", "Fronteras"],
                  ["night", "Día y noche"],
                  ["traffic", "Actividad"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={layers[key]}
                  type="button"
                  onClick={() => setLayers({ ...layers, [key]: !layers[key] })}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          }
        />

        <aside
          className="atlas-inspector atlas-card"
          aria-labelledby="atlas-destination"
        >
          <div className="atlas-inspector-heading">
            <div>
              <p>
                {selected.site
                  ? countries(selected.site.country)
                  : t(continents[selected.continent])}
              </p>
              <h3 id="atlas-destination" ref={details} tabIndex={-1}>
                {names.get(selectedId)}
              </h3>
            </div>
            <button
              type="button"
              className="atlas-favorite"
              aria-pressed={favorites.includes(selectedId)}
              aria-label={t("Marcar como favorita")}
              onClick={star}
            >
              {favorites.includes(selectedId) ? "★" : "☆"}
            </button>
          </div>
          <div className="atlas-site-role">
            <span>
              {t(selected.site ? roles[selected.site.role] : "Arena regional")}
            </span>
            <span>
              {atDestination
                ? t("Desplegado aquí")
                : selectedPoint.full
                  ? t("Aforo completo")
                  : pulse.stale || !selectedStats
                    ? t("Aforo por confirmar")
                    : t("Arena disponible")}
            </span>
          </div>
          <dl className="atlas-local-data">
            <div>
              <dt>{t("Hora local")}</dt>
              <dd>
                {time ? (
                  <>
                    {time.time} <small>{time.offset}</small>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>{t("Coordenadas")}</dt>
              <dd>
                {selectedPoint.lat.toFixed(2)}°, {selectedPoint.lon.toFixed(2)}°
              </dd>
            </div>
          </dl>
          {timeZone && <p className="atlas-zone">{timeZone}</p>}
          {commonLanguages && (
            <p className="atlas-site-languages">
              <span>{t("Idiomas de referencia")}</span> {commonLanguages}
            </p>
          )}
          <div className="atlas-profile">
            <span>{t("Perfil de red")}</span>
            <strong>
              {t(
                selected.site ? profiles[selected.site.tier] : "Arena regional",
              )}
            </strong>
          </div>
          <dl className="atlas-local-data atlas-site-stats">
            <div>
              <dt>{t("En línea")}</dt>
              <dd>{selectedStats?.online ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("Cupos ocupados")}</dt>
              <dd>
                {selectedStats?.devices ?? "—"} / {selected.capacity ?? "∞"}
              </dd>
            </div>
            <div>
              <dt>{t("Cupos libres")}</dt>
              <dd>
                {pulse.stale || !selectedStats
                  ? "—"
                  : selected.capacity === undefined
                    ? "∞"
                    : Math.max(0, selected.capacity - selectedStats.devices)}
              </dd>
            </div>
            <div>
              <dt>{t("Operaciones · 12 h")}</dt>
              <dd>{selectedStats?.activity ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("Enlaces por equipo")}</dt>
              <dd>{selected.linkLimit}</dd>
            </div>
          </dl>
          <code className="atlas-prefix">{network}</code>
          <div className="atlas-inspector-actions">
            <button
              type="button"
              aria-pressed={compare}
              onClick={() => {
                if (!sourceId) setFixedOrigin(selectedId);
                setCompare(!compare);
              }}
            >
              {t("Comparar ruta")}
            </button>
            <button type="button" onClick={() => void copy()}>
              {t("Copiar enlace")}
            </button>
          </div>
          {share === "copied" && (
            <p className="atlas-muted" role="status">
              {t("Enlace copiado.")}
            </p>
          )}
          {share === "manual" && (
            <input
              readOnly
              aria-label={t("Enlace a la arena")}
              value={url.href}
              onFocus={(event) => event.currentTarget.select()}
              autoFocus
            />
          )}
          {compare && (
            <section
              className="atlas-route-readout"
              aria-label={t("Comparación geográfica")}
            >
              <strong>
                {sourceId ? names.get(sourceId) : "—"} → {selectedPoint.name}
              </strong>
              {route ? (
                <p>
                  <span>
                    {distance} · {t("RTT simulado")} {route.rtt} ms
                  </span>
                </p>
              ) : (
                <p>
                  {t("Selecciona otro destino en el mapa o el directorio.")}
                </p>
              )}
              <div>
                <button
                  type="button"
                  className="atlas-inline"
                  onClick={() => setFixedOrigin(selectedId)}
                >
                  {t("Usar como origen")}
                </button>
                {currentId && fixedOrigin && (
                  <button
                    type="button"
                    className="atlas-inline"
                    onClick={() => setFixedOrigin(undefined)}
                  >
                    {t("Usar mi despliegue")}
                  </button>
                )}
              </div>
            </section>
          )}
          <form onSubmit={(event) => void enter(event)} className="atlas-enter">
            {rename && (
              <label>
                {t("Alias para el destino")}
                <input
                  value={alias}
                  minLength={3}
                  maxLength={24}
                  required
                  pattern="[A-Za-z0-9_\-]{3,24}"
                  onChange={(event) => setAlias(event.target.value)}
                />
              </label>
            )}
            <button
              className="atlas-cta"
              type="submit"
              disabled={busy || (!atDestination && selectedPoint.full)}
            >
              {t(
                busy
                  ? "Conectando…"
                  : atDestination
                    ? "Volver al escritorio"
                    : self
                      ? "Trasladar mi equipo"
                      : "Desplegar aquí",
              )}{" "}
              <span aria-hidden="true">↗</span>
            </button>
            {self && !atDestination && (
              <p className="atlas-muted">
                {t(
                  "El traslado cierra tus enlaces activos en la arena anterior.",
                )}
              </p>
            )}
            {enterError && (
              <p className="atlas-error" role="alert">
                {t(enterError)}
              </p>
            )}
          </form>
        </aside>
      </div>

      <div className="atlas-below">
        <section
          className="atlas-directory atlas-card"
          aria-labelledby="atlas-directory-title"
        >
          <div className="atlas-block-heading">
            <h3 id="atlas-directory-title" ref={results} tabIndex={-1}>
              {t("Directorio de arenas")}
            </h3>
            <span>
              {t("{count} resultados", { count: number.format(sorted.length) })}
            </span>
          </div>
          <div className="atlas-filters">
            <label className="atlas-search">
              <span>{t("Buscar ubicación")}</span>
              <input
                type="search"
                placeholder={t("Ciudad, país o código")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && sorted[0]) {
                    event.preventDefault();
                    showDetails(sorted[0].id);
                  }
                }}
              />
            </label>
            <label>
              {t("Región")}
              <select
                value={continent}
                onChange={(event) => {
                  setContinent(event.target.value as typeof continent);
                  setPage(0);
                }}
              >
                <option value="">{t("Todas")}</option>
                {Object.entries(continents).map(([id, label]) => (
                  <option key={id} value={id}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Ordenar por")}
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as Sort);
                  setPage(0);
                }}
              >
                <option value="name">{t("Nombre")}</option>
                <option value="active">{t("Actividad")}</option>
                <option value="space">{t("Cupos libres")}</option>
                <option value="near" disabled={!sourceId}>
                  {t("Distancia al origen")}
                </option>
              </select>
            </label>
            <div className="atlas-filter-buttons">
              <button
                type="button"
                aria-pressed={availableOnly}
                onClick={() => {
                  setAvailableOnly(!availableOnly);
                  setPage(0);
                }}
              >
                {t("Con cupos libres")}
              </button>
              <button
                type="button"
                aria-pressed={activeOnly}
                onClick={() => {
                  setActiveOnly(!activeOnly);
                  setPage(0);
                }}
              >
                {t("Con jugadores")}
              </button>
              <button
                type="button"
                aria-pressed={favoritesOnly}
                onClick={() => {
                  setFavoritesOnly(!favoritesOnly);
                  setPage(0);
                }}
              >
                {t("Favoritas")}
              </button>
            </div>
          </div>
          {visible.length ? (
            <ul className="atlas-city-grid">
              {visible.map((region) => {
                const stat = counters.get(region.id);
                const own = currentId === region.id;
                return (
                  <li key={region.id}>
                    <button
                      type="button"
                      aria-pressed={selectedId === region.id}
                      onClick={() => showDetails(region.id)}
                    >
                      <span>
                        <strong>{names.get(region.id)}</strong>
                        <small>
                          {region.site
                            ? countries(region.site.country)
                            : t("Arena regional")}
                        </small>
                      </span>
                      <span className="atlas-city-end">
                        {favorites.includes(region.id) && (
                          <span aria-hidden="true">★</span>
                        )}
                        <span
                          className={
                            own
                              ? "atlas-current"
                              : stat?.online
                                ? "atlas-online"
                                : ""
                          }
                        >
                          {own ? t("Aquí") : stat ? stat.online : "—"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="atlas-empty">
              <p className="atlas-muted">
                {t(
                  availableOnly && (!pulse.world || pulse.stale)
                    ? "Esperando aforo actualizado."
                    : "No hay arenas con esos filtros.",
                )}
              </p>
              <button
                type="button"
                className="atlas-inline"
                onClick={clearFilters}
              >
                {t("Limpiar filtros")}
              </button>
            </div>
          )}
          {sorted.length > PAGE_SIZE && (
            <nav
              className="atlas-pages"
              aria-label={t("Páginas del directorio")}
            >
              <button
                type="button"
                disabled={filteredPage === 0}
                onClick={() => changePage(filteredPage - 1)}
              >
                {t("Anterior")}
              </button>
              <span>
                {filteredPage + 1} / {Math.ceil(sorted.length / PAGE_SIZE)}
              </span>
              <button
                type="button"
                disabled={(filteredPage + 1) * PAGE_SIZE >= sorted.length}
                onClick={() => changePage(filteredPage + 1)}
              >
                {t("Siguiente")}
              </button>
            </nav>
          )}
        </section>
        <Traffic
          key={scope ?? "global"}
          world={traffic}
          scope={global ? t("Todas las arenas") : names.get(selectedId)!}
          global={global}
          setGlobal={setGlobal}
          timeZone={global ? undefined : timeZone}
          open={showDetails}
        />
      </div>
      <details className="atlas-sources">
        <summary>{t("Fuentes y mediciones")}</summary>
        <p>
          {t(
            "Los límites siguen la cartografía de Natural Earth. Cada arena es virtual. La distancia sigue el arco terrestre y el RTT simulado es una estimación de juego. RTT API mide el tiempo de consulta desde tu navegador.",
          )}
        </p>
        <p>
          <a
            href="https://www.naturalearthdata.com/about/terms-of-use/"
            target="_blank"
            rel="noreferrer"
          >
            Natural Earth
          </a>
          {" · "}
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            GeoNames
          </a>
          {" · "}
          <a
            href="https://unstats.un.org/unsd/methodology/m49/overview/"
            target="_blank"
            rel="noreferrer"
          >
            {t("ONU M49")}
          </a>
          {" · "}
          <a
            href="https://www.iana.org/time-zones"
            target="_blank"
            rel="noreferrer"
          >
            IANA
          </a>
        </p>
      </details>
    </section>
  );
}
