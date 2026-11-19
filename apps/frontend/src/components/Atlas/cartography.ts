import {
  geoArea,
  geoCircle,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  GeometryCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
} from "geojson";
import type { PvpRegionId } from "@null-protocol/shared";

type Coordinates = [number, number];
type Country = Feature<MultiPolygon, { name: string; english: string }>;

export interface Geography {
  countries: FeatureCollection<MultiPolygon, Country["properties"]>;
  borders: MultiLineString;
  disputed: MultiLineString;
  lakes: GeometryCollection;
}
export interface MapPoint {
  id: PvpRegionId;
  name: string;
  country: string;
  lon: number;
  lat: number;
  online: number;
  activity: number;
  full: boolean;
}
export interface Layers {
  borders: boolean;
  night: boolean;
  traffic: boolean;
}
export interface Camera {
  lon: number;
  lat: number;
  zoom: number;
}
export interface MapTarget {
  x: number;
  y: number;
  sites: MapPoint[];
}

export const INITIAL_CAMERA: Camera = { lon: 0, lat: 0, zoom: 1 };
const RADIANS = Math.PI / 180;
const SPHERE = { type: "Sphere" } as const;
const GRID = geoGraticule10();
const EQUATOR: LineString = {
  type: "LineString",
  coordinates: [
    [-180, 0],
    [-90, 0],
    [0, 0],
    [90, 0],
    [180, 0],
  ],
};
const FLAT_X = 2.735384723480633;
const FLAT_Y = 1.422390506730596;
const PLANET = "#0a2334";
const BORDER = "rgba(131, 193, 191, .55)";
const POLE = "#09141e";

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const longitude = (n: number) => ((n + 540) % 360) - 180;

export function projectionFor(
  camera: Camera,
  width: number,
  height: number,
  globe: boolean,
) {
  const middle: Coordinates = [width / 2, height / 2];
  if (globe) {
    return geoOrthographic()
      .translate(middle)
      .scale(Math.min(width, height) * 0.468 * camera.zoom)
      .rotate([-camera.lon, -camera.lat])
      .precision(0.55);
  }
  const scale =
    Math.min((width - 32) / (2 * FLAT_X), (height - 24) / (2 * FLAT_Y)) *
    camera.zoom;
  const projection = geoNaturalEarth1()
    .scale(scale)
    .translate(middle)
    .precision(0.55);
  if (camera.zoom > 1) {
    const raw = projection([camera.lon, camera.lat])!;
    const horizontal = Math.max(0, FLAT_X * scale - width / 2 + 16);
    const vertical = Math.max(0, FLAT_Y * scale - height / 2 + 12);
    projection.translate([
      middle[0] - clamp(raw[0] - middle[0], -horizontal, horizontal),
      middle[1] - clamp(raw[1] - middle[1], -vertical, vertical),
    ]);
  }
  return projection;
}

/** Night hemisphere around the anti-solar point from UTC and solar declination. */
function nightAt(time: number) {
  const date = new Date(time);
  const yearDay = (time - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000;
  const fraction = dayFraction(date);
  const gamma = ((2 * Math.PI) / 365) * (yearDay - 0.5);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const correction =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  return geoCircle()
    .center([longitude(360 - fraction * 360 - correction / 4), -decl / RADIANS])
    .radius(90)
    .precision(3)();
}
const dayFraction = (date: Date) =>
  (date.getUTCHours() * 3_600 +
    date.getUTCMinutes() * 60 +
    date.getUTCSeconds()) /
  86_400;

export function countryAt(
  data: Geography,
  projection: GeoProjection,
  point: Coordinates,
  camera: Camera,
  globe: boolean,
): string | null {
  const coordinates = projection.invert?.(point);
  if (!coordinates || !coordinates.every(Number.isFinite)) return null;
  if (Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90)
    return null;
  if (
    globe &&
    geoDistance([camera.lon, camera.lat], coordinates) >= Math.PI / 2
  )
    return null;
  const matching = data.countries.features.filter((feature) =>
    geoContains(feature, coordinates),
  );
  const country = matching.sort((a, b) => geoArea(a) - geoArea(b))[0];
  if (country?.id) return String(country.id);
  return null;
}

type Drawing = {
  data: Geography;
  relief: HTMLImageElement | null;
  globe: boolean;
  width: number;
  height: number;
  layers: Layers;
  countries: readonly string[];
  projection: GeoProjection;
  time: number;
};

export function drawTerrain(ctx: CanvasRenderingContext2D, args: Drawing) {
  const {
    data,
    relief,
    globe,
    width,
    height,
    layers,
    countries,
    projection,
    time,
  } = args;
  const scale = projection.scale();
  const [x, y] = projection.translate();
  const path = geoPath(projection, ctx);
  const fill = (
    shape: GeoPermissibleObjects,
    color: string | CanvasGradient,
  ) => {
    ctx.beginPath();
    path(shape);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const stroke = (
    shape: GeoPermissibleObjects,
    color: string,
    lineWidth: number,
  ) => {
    ctx.beginPath();
    path(shape);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  ctx.clearRect(0, 0, width, height);
  const ocean = ctx.createRadialGradient(
    x - width * 0.08,
    y - height * 0.12,
    0,
    x,
    y,
    Math.max(width * 0.54, height * 0.64),
  );
  ocean.addColorStop(0, "#123043");
  ocean.addColorStop(0.62, PLANET);
  ocean.addColorStop(1, "#081826");
  ctx.save();
  if (globe) {
    ctx.shadowColor = "#2198a8";
    ctx.shadowBlur = 25;
  }
  fill(SPHERE, ocean);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  path(SPHERE);
  ctx.clip();
  // Real relief raster is drawn only for the flat projection it was warped to.
  const land = ctx.createLinearGradient(0, 0, width * 0.7, height);
  land.addColorStop(0, "#224f58");
  land.addColorStop(0.5, "#1d4b4e");
  land.addColorStop(1, "#0d323b");
  fill(data.countries, land);
  if (!globe && relief) {
    ctx.save();
    ctx.beginPath();
    path(data.countries);
    ctx.clip();
    ctx.globalAlpha = 0.58;
    ctx.globalCompositeOperation = "soft-light";
    ctx.drawImage(
      relief,
      x - FLAT_X * scale,
      y - FLAT_Y * scale,
      FLAT_X * scale * 2,
      FLAT_Y * scale * 2,
    );
    ctx.restore();
  }
  fill(data.lakes, "#113041");
  if (layers.night) fill(nightAt(time), "rgba(3, 8, 20, .49)");
  stroke(GRID, "rgba(128, 185, 200, .11)", 0.64);
  stroke(EQUATOR, "rgba(128, 185, 200, .27)", 0.8);
  if (layers.borders) {
    stroke(data.countries, "rgba(68, 126, 132, .30)", 0.55);
    stroke(data.borders, BORDER, 0.8);
    ctx.setLineDash([3, 3]);
    stroke(data.disputed, "rgba(255, 198, 124, .83)", 0.95);
    ctx.setLineDash([]);
  }
  const [destination, origin] = countries;
  const home = data.countries.features.find(({ id }) => id === origin);
  const focus = data.countries.features.find(({ id }) => id === destination);
  if (home && home !== focus) {
    fill(home, "rgba(74, 209, 224, .10)");
    stroke(home, "rgba(107, 221, 230, .85)", 1.2);
  }
  if (focus) {
    fill(focus, "rgba(255, 189, 97, .18)");
    stroke(focus, "rgba(255, 202, 119, .95)", 1.36);
  }
  if (globe) {
    const limb = ctx.createRadialGradient(
      x - scale * 0.28,
      y - scale * 0.26,
      scale * 0.22,
      x,
      y,
      scale,
    );
    limb.addColorStop(0, "rgba(1, 8, 13, 0)");
    limb.addColorStop(0.82, "rgba(1, 8, 13, .12)");
    limb.addColorStop(1, "rgba(1, 8, 13, .58)");
    fill(SPHERE, limb);
  }
  ctx.restore();
  stroke(SPHERE, "rgba(81, 154, 171, .48)", 1);
}

export function drawNodes(
  ctx: CanvasRenderingContext2D,
  args: {
    width: number;
    height: number;
    projection: GeoProjection;
    camera: Camera;
    globe: boolean;
    layers: Layers;
    points: readonly MapPoint[];
    selected: PvpRegionId;
    current?: PvpRegionId;
    anchor?: MapPoint;
    target?: MapPoint;
    animation: number;
    labelWidth: number;
  },
): MapTarget[] {
  const {
    width,
    height,
    projection,
    camera,
    globe,
    points,
    selected,
    current,
    target,
    anchor,
  } = args;
  ctx.clearRect(0, 0, width, height);
  const pointFor = (point: MapPoint) => {
    const coordinates: Coordinates = [point.lon, point.lat];
    if (
      globe &&
      geoDistance([camera.lon, camera.lat], coordinates) >= Math.PI / 2 - 0.012
    )
      return null;
    const projected = projection(coordinates);
    if (!projected) return null;
    const [x, y] = projected;
    return x > -12 && x < width + 12 && y > -12 && y < height + 12
      ? { x, y }
      : null;
  };

  if (anchor && target && anchor.id !== target.id) {
    const interpolate = geoInterpolate(
      [anchor.lon, anchor.lat],
      [target.lon, target.lat],
    );
    const greatCircle = {
      type: "LineString",
      coordinates: Array.from({ length: 76 }, (_, index) =>
        interpolate(index / 75),
      ),
    } as const;
    ctx.beginPath();
    geoPath(projection, ctx)(greatCircle);
    ctx.lineWidth = 1.55;
    ctx.strokeStyle = "rgba(248, 208, 139, .91)";
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const size = width < 550 ? 21 : 23;
  const groups = new Map<string, MapTarget>();
  const special: MapTarget[] = [];
  for (const site of points) {
    const projected = pointFor(site);
    if (!projected) continue;
    const { x, y } = projected;
    if (site.id === selected || site.id === current || site.id === anchor?.id) {
      special.push({ x, y, sites: [site] });
      continue;
    }
    const key = Math.floor(x / size) + "/" + Math.floor(y / size);
    const group = groups.get(key);
    if (!group) groups.set(key, { x, y, sites: [site] });
    else {
      const n = group.sites.length;
      group.x = (group.x * n + x) / (n + 1);
      group.y = (group.y * n + y) / (n + 1);
      group.sites.push(site);
    }
  }
  special.sort(
    (a, b) =>
      Number(a.sites[0]?.id === selected) - Number(b.sites[0]?.id === selected),
  );
  const all = [...groups.values(), ...special];
  for (const { x, y, sites } of all) {
    const single = sites[0]!;
    const count = sites.length;
    const activity = sites.reduce((sum, site) => sum + site.activity, 0);
    const active = single.id === selected;
    const own = single.id === current || single.id === anchor?.id;
    const color = active
      ? "#ffcd86"
      : own
        ? "#83e5ef"
        : sites.some((site) => site.online)
          ? "#81e5bc"
          : "#77a9b1";
    if (args.layers.traffic && activity > 0) {
      const radius = Math.min(26, 8 + Math.log2(1 + activity) * 4);
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
      halo.addColorStop(0, "rgba(91, 233, 178, .34)");
      halo.addColorStop(1, "rgba(91, 233, 178, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    if (active || own) {
      const radius = active ? 6.5 : 5;
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.globalAlpha = 0.65 - args.animation * 0.4;
      ctx.arc(x, y, radius + 4 + args.animation * 9, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (count > 1) {
      ctx.fillStyle = "rgba(12, 39, 51, .95)";
      ctx.arc(x, y, count > 9 ? 9.5 : 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 8px ui-monospace, monospace";
      ctx.fillText(String(count), x, y + 0.45);
    } else {
      ctx.arc(x, y, single.online ? 3.3 : 2.1, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  const labels: { x: number; y: number; w: number; h: number }[] = [];
  for (const { x, y, sites } of [...special].reverse()) {
    const site = sites[0]!;
    const active = site.id === selected;
    ctx.font = "600 12px system-ui, sans-serif";
    const name = site.name;
    const w = Math.min(args.labelWidth, ctx.measureText(name).width) + 16;
    const left = clamp(x + (x > width * 0.72 ? -w - 13 : 13), 3, width - w - 3);
    const preferredTop = clamp(y - 26, 3, height - 24);
    const taken = labels.some(
      (label) =>
        left < label.x + label.w &&
        left + w > label.x &&
        preferredTop < label.y + label.h &&
        preferredTop + 22 > label.y,
    );
    const top = taken ? clamp(y + 12, 3, height - 24) : preferredTop;
    labels.push({ x: left, y: top, w, h: 22 });
    ctx.beginPath();
    ctx.roundRect(left, top, w, 22, 5);
    ctx.fillStyle = POLE;
    ctx.fill();
    ctx.strokeStyle = active ? "#b48649" : "#3f96a4";
    ctx.stroke();
    ctx.fillStyle = active ? "#ffda9c" : "#a7eef2";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(name, left + 8, top + 11, w - 16);
  }
  return all;
}
