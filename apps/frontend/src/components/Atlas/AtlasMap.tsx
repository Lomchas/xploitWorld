import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { PvpRegionId } from "@null-protocol/shared";
import { useLocale } from "../../lib/locale";
import { countryNames } from "./atlas-model";
import overviewUrl from "./world-overview.json?url";
import detailUrl from "./world-detail.json?url";
import reliefUrl from "./relief.webp";
import {
  INITIAL_CAMERA,
  clamp,
  countryAt,
  drawNodes,
  drawTerrain,
  longitude,
  projectionFor,
  type Camera,
  type Geography,
  type Layers,
  type MapPoint,
  type MapTarget,
} from "./cartography";

type Props = {
  selected: MapPoint;
  current?: MapPoint;
  anchor?: MapPoint;
  points: MapPoint[];
  layers: Layers;
  clock: number;
  focusKey: number;
  onSelect: (id: PvpRegionId) => void;
  onCountry: (country: string) => void;
  controls: ReactNode;
};
const MAX_ZOOM = 12;
const EMPTY = { width: 0, height: 0, ratio: 1 };
const clipZoom = (zoom: number) => clamp(zoom, 1, MAX_ZOOM);
let overviewRequest: Promise<Geography> | undefined;
let detailRequest: Promise<Geography> | undefined;

function geography(url: string) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error("Atlas geometry unavailable");
    return response.json() as Promise<Geography>;
  });
}

export function AtlasMap({
  selected,
  current,
  anchor,
  points,
  layers,
  clock,
  focusKey,
  onSelect,
  onCountry,
  controls,
}: Props) {
  const { t, locale } = useLocale();
  const countries = useMemo(() => countryNames(locale), [locale]);
  const holder = useRef<HTMLDivElement>(null);
  const terrain = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const targets = useRef<MapTarget[]>([]);
  const animation = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number } | undefined>(undefined);
  const [globe, setGlobe] = useState(false);
  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  const [screen, setScreen] = useState(EMPTY);
  const [data, setData] = useState<Geography>();
  const [detail, setDetail] = useState<Geography>();
  const [relief, setRelief] = useState<HTMLImageElement | null>(null);
  const [mapError, setMapError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [group, setGroup] = useState<MapPoint[]>([]);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    sites: MapPoint[];
  }>();
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setScreen({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
        ratio: Math.min(window.devicePixelRatio || 1, 2),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    void (overviewRequest ??= geography(overviewUrl)).then(
      (value) => {
        if (active) setData(value);
      },
      () => {
        overviewRequest = undefined;
        if (active) setMapError(true);
      },
    );
    const image = new Image();
    image.onload = () => {
      if (active) setRelief(image);
    };
    image.src = reliefUrl;
    return () => {
      active = false;
    };
  }, [retry]);
  const detailed = camera.zoom >= 1.75;
  useEffect(() => {
    if (!detailed || detail) return;
    let active = true;
    void (detailRequest ??= geography(detailUrl)).then(
      (value) => {
        if (active) setDetail(value);
      },
      () => {
        detailRequest = undefined;
      },
    );
    return () => {
      active = false;
    };
  }, [detailed, detail]);
  useEffect(() => () => window.cancelAnimationFrame(animation.current), []);

  const fly = (to: Camera) => {
    setHover(undefined);
    window.cancelAnimationFrame(animation.current);
    if (reduced) {
      setCamera(to);
      return;
    }
    const start = performance.now();
    const difference = globe
      ? longitude(to.lon - camera.lon)
      : to.lon - camera.lon;
    const step = (time: number) => {
      const fraction = Math.min(1, (time - start) / 350);
      const progress = 1 - (1 - fraction) ** 3;
      setCamera({
        lon: longitude(camera.lon + difference * progress),
        lat: camera.lat + (to.lat - camera.lat) * progress,
        zoom: camera.zoom + (to.zoom - camera.zoom) * progress,
      });
      if (fraction < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  };
  const focusRef = useRef(fly);
  focusRef.current = fly;
  useEffect(() => {
    if (focusKey) {
      setGroup([]);
      focusRef.current({
        lon: selected.lon,
        lat: selected.lat,
        zoom: Math.max(2.2, camera.zoom),
      });
    }
    // A filter or telemetry update alone must never interrupt map exploration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const zoomBy = (factor: number) => {
    setHover(undefined);
    window.cancelAnimationFrame(animation.current);
    setCamera((value) => ({
      ...(!globe && value.zoom === 1 && factor > 1
        ? { lon: selected.lon, lat: selected.lat }
        : value),
      zoom: clipZoom(value.zoom * factor),
    }));
  };
  const zoomRef = useRef(zoomBy);
  zoomRef.current = zoomBy;
  useEffect(() => {
    const element = overlay.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== element && !event.ctrlKey) return;
      event.preventDefault();
      zoomRef.current(event.deltaY < 0 ? 1.16 : 1 / 1.16);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  const { width, height, ratio } = screen;
  const geometry = detailed ? (detail ?? data) : data;
  useEffect(() => {
    const ctx = terrain.current?.getContext("2d");
    if (!ctx || !geometry || width < 50 || height < 50) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawTerrain(ctx, {
      data: geometry,
      relief,
      globe,
      width,
      height,
      layers,
      countries: [selected.country, current?.country ?? ""],
      projection: projectionFor(camera, width, height, globe),
      time: clock,
    });
  }, [
    geometry,
    relief,
    globe,
    width,
    height,
    ratio,
    layers,
    selected.country,
    current?.country,
    camera,
    clock,
  ]);
  useEffect(() => {
    const ctx = overlay.current?.getContext("2d");
    if (!ctx || !geometry || width < 50 || height < 50) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const projection = projectionFor(camera, width, height, globe);
    const draw = (progress: number) => {
      targets.current = drawNodes(ctx, {
        globe,
        width,
        height,
        layers,
        projection,
        camera,
        points,
        selected: selected.id,
        current: current?.id,
        anchor,
        target: selected,
        animation: progress,
        labelWidth: width < 620 ? 113 : 218,
      });
    };
    draw(0);
    if (reduced || dragging) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) draw((performance.now() % 2500) / 2500);
    }, 110);
    return () => window.clearInterval(timer);
  }, [
    geometry,
    globe,
    width,
    height,
    ratio,
    layers,
    selected,
    current,
    anchor,
    camera,
    points,
    reduced,
    dragging,
  ]);

  const pan = (dx: number, dy: number) => {
    setHover(undefined);
    window.cancelAnimationFrame(animation.current);
    setCamera((previous) => {
      if (globe)
        return {
          ...previous,
          lon: longitude(
            previous.lon - (dx * 145) / Math.min(width, height) / previous.zoom,
          ),
          lat: clamp(
            previous.lat + (dy * 145) / Math.min(width, height) / previous.zoom,
            -86,
            86,
          ),
        };
      if (previous.zoom === 1) return previous;
      const projection = projectionFor(previous, width, height, false);
      const projected = projection([previous.lon, previous.lat])!;
      const next = projection.invert!([projected[0] - dx, projected[1] - dy])!;
      return {
        ...previous,
        lon: clamp(next[0], -179.9, 179.9),
        lat: clamp(next[1], -87, 87),
      };
    });
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const { pointerId, clientX: x, clientY: y } = event;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(pointerId);
    pointers.current.set(pointerId, { x, y });
    press.current = pointers.current.size === 1 ? { x, y } : undefined;
    setGroup([]);
    setHover(undefined);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const { pointerId, clientX: x, clientY: y } = event;
    const previous = pointers.current.get(pointerId);
    if (!previous) {
      if (event.pointerType !== "mouse") return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const nearest = targets.current.find(
        (target) => Math.hypot(target.x - x, target.y - y) < 12,
      );
      setHover(nearest ? { x, y, sites: nearest.sites } : undefined);
      return;
    }
    const other = [...pointers.current].find(([id]) => id !== pointerId)?.[1];
    pointers.current.set(pointerId, { x, y });
    if (other) {
      setDragging(true);
      const oldDistance = Math.hypot(
        previous.x - other.x,
        previous.y - other.y,
      );
      if (oldDistance > 0)
        zoomBy(Math.hypot(x - other.x, y - other.y) / oldDistance);
      return;
    }
    if (
      press.current &&
      Math.hypot(x - press.current.x, y - press.current.y) < 5
    )
      return;
    press.current = undefined;
    setDragging(true);
    pan(x - previous.x, y - previous.y);
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    const clicked = Boolean(press.current);
    press.current = undefined;
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) setDragging(false);
    if (event.type !== "pointerup" || !clicked || !geometry) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const nearest = [...targets.current]
      .reverse()
      .filter(
        (target) =>
          Math.hypot(target.x - x, target.y - y) <
          (target.sites.length > 1 ? 14 : 10),
      )
      .sort(
        (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )[0];
    if (nearest) {
      if (nearest.sites.length === 1) onSelect(nearest.sites[0]!.id);
      else setGroup(nearest.sites);
      return;
    }
    const country = countryAt(
      geometry,
      projectionFor(camera, width, height, globe),
      [x, y],
      camera,
      globe,
    );
    if (country) onCountry(country);
  };
  const keyboard = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const key = event.key;
    if (key === "+" || key === "=") zoomBy(1.35);
    else if (key === "-") zoomBy(1 / 1.35);
    else if (key === "0") fly(INITIAL_CAMERA);
    else if (key === "ArrowLeft") pan(34, 0);
    else if (key === "ArrowRight") pan(-34, 0);
    else if (key === "ArrowUp") pan(0, 34);
    else if (key === "ArrowDown") pan(0, -34);
    else return;
    event.preventDefault();
  };
  const changeProjection = (next: boolean) => {
    window.cancelAnimationFrame(animation.current);
    setGroup([]);
    setHover(undefined);
    setGlobe(next);
    setCamera(
      next ? { lon: selected.lon, lat: selected.lat, zoom: 1 } : INITIAL_CAMERA,
    );
  };
  return (
    <div className="atlas-map-frame">
      <div className="atlas-map-toolbar">
        <div role="group" aria-label={t("Proyección")}>
          <button
            type="button"
            aria-pressed={!globe}
            onClick={() => changeProjection(false)}
          >
            {t("Mapa plano")}
          </button>
          <button
            type="button"
            aria-pressed={globe}
            onClick={() => changeProjection(true)}
          >
            {t("Globo")}
          </button>
        </div>
        {controls}
      </div>
      <div className="atlas-canvas" ref={holder}>
        <canvas
          aria-hidden="true"
          ref={terrain}
          width={width * ratio}
          height={height * ratio}
        />
        <canvas
          className={dragging ? "atlas-grabbing" : ""}
          ref={overlay}
          width={width * ratio}
          height={height * ratio}
          tabIndex={0}
          aria-label={t(
            "Mapa de arenas. Usa las flechas para mover y más o menos para acercar o alejar.",
          )}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={() => setHover(undefined)}
          onLostPointerCapture={(event) => {
            if (pointers.current.has(event.pointerId)) finish(event);
          }}
          onKeyDown={keyboard}
        />
        {!data && (
          <div className="atlas-map-status" role="status">
            {t(
              mapError
                ? "No se pudo cargar la cartografía."
                : "Cargando cartografía…",
            )}
            {mapError && (
              <button
                type="button"
                onClick={() => {
                  setMapError(false);
                  setRetry((value) => value + 1);
                }}
              >
                {t("Reintentar")}
              </button>
            )}
          </div>
        )}
        <div
          className="atlas-map-tools"
          role="group"
          aria-label={t("Controles del mapa")}
        >
          <button
            type="button"
            aria-label={t("Acercar")}
            onClick={() => zoomBy(1.45)}
            disabled={camera.zoom >= MAX_ZOOM}
          >
            +
          </button>
          <button
            type="button"
            aria-label={t("Alejar")}
            onClick={() => zoomBy(1 / 1.45)}
            disabled={camera.zoom === 1}
          >
            −
          </button>
          <button
            type="button"
            aria-label={t("Enfocar destino")}
            onClick={() =>
              fly({
                lon: selected.lon,
                lat: selected.lat,
                zoom: Math.max(2.2, camera.zoom),
              })
            }
          >
            ⌖
          </button>
          <button
            type="button"
            aria-label={t("Restablecer vista")}
            onClick={() => fly(INITIAL_CAMERA)}
          >
            ↶
          </button>
        </div>
        {group.length > 1 && (
          <section
            className="atlas-map-group"
            aria-label={t("Capitales agrupadas")}
          >
            <div>
              <strong>{t("Capitales cercanas")}</strong>
              <button
                type="button"
                aria-label={t("Cerrar")}
                onClick={() => setGroup([])}
              >
                ×
              </button>
            </div>
            <ul>
              {group.map(({ id, name }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      setGroup([]);
                      onSelect(id);
                    }}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {hover && (
          <div
            className="atlas-map-tooltip"
            role="tooltip"
            style={{
              left: Math.max(8, Math.min(hover.x + 14, width - 218)),
              top: Math.max(8, Math.min(hover.y + 14, height - 74)),
            }}
          >
            <strong>
              {hover.sites.length === 1
                ? hover.sites[0]!.name
                : t("{count} capitales. Pulsa para verlas.", {
                    count: hover.sites.length,
                  })}
            </strong>
            {hover.sites.length === 1 && (
              <span>{countries(hover.sites[0]!.country)}</span>
            )}
            <span>
              {t("{count} en línea", {
                count: hover.sites.reduce((sum, site) => sum + site.online, 0),
              })}
            </span>
          </div>
        )}
        <div className="atlas-map-scale" aria-hidden="true">
          {camera.zoom.toFixed(1)}×
        </div>
      </div>
      <div className="atlas-map-legend">
        <span>
          <i data-symbol="current" />
          {t("Mi despliegue")}
        </span>
        <span>
          <i data-symbol="target" />
          {t("Selección")}
        </span>
        <span>
          <i data-symbol="live" />
          {t("Con jugadores")}
        </span>
        {layers.borders && (
          <span>
            <i data-symbol="boundary" />
            {t("Límite disputado o incierto")}
          </span>
        )}
      </div>
    </div>
  );
}
