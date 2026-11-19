"""Build the checked-in Atlas assets from the inputs documented in docs/ATLAS.md."""

import argparse
import html
import json
import math
import re
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COUNTRIES = """
AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ
CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ
FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP
KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK
ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS
PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG
TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW
""".split()

# Location overrides with a role when a country has several seats or a special status.
# Slots are permanent identifiers for the virtual IPv6 subnets.
PRIMARY = {
    "BI": ("Gitega", "Gitega", "Gitega", "capital"),
    "CH": ("Bern", "Berna", "Bern", "federal"),
    "GQ": ("Ciudad de la Paz", "Ciudad de la Paz", "Ciudad de la Paz", "capital"),
    "IL": ("Jerusalem", "Jerusalén", "Jerusalem", "declared"),
    "KI": ("Tarawa", "Tarawa Sur", "South Tarawa", "capital"),
    "KZ": ("Astana", "Astaná", "Astana", "capital"),
    "LK": ("Sri Jayewardenepura Kotte", "Sri Jayawardenapura Kotte", "Sri Jayawardenepura Kotte", "legislative"),
    "NR": ("Yaren", "Yaren", "Yaren", "deFacto"),
    "PS": ("Ramallah", "Ramala", "Ramallah", "administrative"),
    "PW": ("Ngerulmud", "Ngerulmud", "Ngerulmud", "capital"),
    "SZ": ("Mbabane", "Mbabane", "Mbabane", "administrative"),
    "US": ("Washington", "Washington D. C.", "Washington, D.C.", "capital"),
    "XK": ("Pristina", "Pristina", "Pristina", "capital"),
    "YE": ("Sanaa", "Saná", "Sana'a", "constitutional"),
    "ZA": ("Pretoria", "Pretoria", "Pretoria", "administrative"),
}
EXTRA = {
    "BJ": [(1, "cotonou", "Cotonou", "Cotonú", "Cotonou", "government")],
    "BO": [(1, "lapaz", "La Paz", "La Paz", "La Paz", "government")],
    "CI": [(1, "abidjan", "Abidjan", "Abiyán", "Abidjan", "economic")],
    "LK": [(1, "colombo", "Colombo", "Colombo", "Colombo", "executive")],
    "MY": [(1, "putrajaya", "Putrajaya", "Putrajaya", "Putrajaya", "administrative")],
    "NL": [(1, "thehague", "The Hague", "La Haya", "The Hague", "government")],
    "PS": [(1, "eastjerusalem", "East Jerusalem", "Jerusalén Este", "East Jerusalem", "claimed")],
    "SZ": [(1, "lobamba", "Lobamba", "Lobamba", "Lobamba", "royal")],
    "YE": [(1, "aden", "Aden", "Adén", "Aden", "interim")],
    "ZA": [
        (1, "capetown", "Cape Town", "Ciudad del Cabo", "Cape Town", "legislative"),
        (2, "bloemfontein", "Bloemfontein", "Bloemfontein", "Bloemfontein", "judicial"),
    ],
}


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def normalize(text):
    return "".join(ch for ch in unicodedata.normalize("NFKD", text or "").lower() if ch.isascii() and ch.isalnum())


def m49_lookup(page):
    regions = {"Africa": "AF", "Asia": "AS", "Europe": "EU", "Oceania": "OC"}
    rows = {}
    for row in re.findall("<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = [html.unescape(re.sub("<[^>]*>", "", c)).strip() for c in re.findall("<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 12 or not re.fullmatch("[A-Z]{2}", cells[10]):
            continue
        region = ("SA" if cells[7] == "South America" else "NA") if cells[3] == "Americas" else regions.get(cells[3])
        if region:
            rows[cells[10]] = region
    return rows | {"XK": "EU", "TW": "AS"}


def catalog(source):
    info = {}
    for line in (source / "countryInfo.txt").read_text(encoding="utf8").splitlines():
        if line and not line.startswith("#"):
            row = line.split("\t")
            info[row[0]] = row
    subdivisions = m49_lookup((source / "m49.html").read_text(encoding="utf8"))
    natural = defaultdict(list)
    for feature in read_json(source / "ne_10m_populated_places.geojson")["features"]:
        row = feature["properties"]
        natural[row["ISO_A2"]].append(row)
    geonames = defaultdict(list)
    with zipfile.ZipFile(source / "cities15000.zip") as cities:
        with cities.open("cities15000.txt") as rows:
            for line in rows:
                row = line.decode().rstrip("\r\n").split("\t")
                geonames[row[8]].append(row)

    def site(code, slot, suffix, query, preferred_es, preferred_en, role):
        key = normalize(query)
        exact = [row for row in natural[code] if key in
                 {normalize(row.get(field)) for field in ("NAME", "NAME_EN", "NAME_ES", "NAMEASCII")}]
        # If a city is listed multiple times, prioritize the designated capital.
        exact.sort(key=lambda row: (-row["ADM0CAP"], row["SCALERANK"]))
        entry = exact[0] if exact else None
        if not entry and slot == 0 and code not in PRIMARY:
            primary = [row for row in natural[code] if row["ADM0CAP"]]
            if len(primary) == 1:
                entry = primary[0]
        matches = [row for row in geonames[code] if key in {normalize(row[1]), normalize(row[2])}]
        matches.sort(key=lambda row: (row[7] != "PPLC", -int(row[14] or 0)))
        geo = matches[0] if matches else None
        if geo and entry and math.hypot(float(geo[4]) - entry["LATITUDE"], float(geo[5]) - entry["LONGITUDE"]) > 0.6:
            geo = None
        if code == "PS" and slot == 1:
            coord, tz = [35.2346, 31.7851], "Asia/Jerusalem"
        elif code == "SZ" and slot == 1 and not (geo or entry):
            coord, tz = [31.20, -26.45], "Africa/Mbabane"
        elif entry or geo:
            coord = [float(geo[5]), float(geo[4])] if geo else [entry["LONGITUDE"], entry["LATITUDE"]]
            tz = geo[17] if geo else entry["TIMEZONE"]
        else:
            raise ValueError(f"Capital without coordinates: {code} {query}")
        es = preferred_es or (entry and entry["NAME_ES"]) or query
        en = preferred_en or (entry and entry["NAME_EN"]) or query
        if not tz:
            raise ValueError(f"Capital without timezone: {code} {query}")
        population = int(geo[14] or 0) if geo else entry["POP_MAX"] if entry else 0
        # Three game profiles. Their values describe the simulation, never a
        # real city's infrastructure or operator capacity.
        tier = "hub" if population >= 1_500_000 else "regional" if population >= 300_000 else "local"
        languages = list(dict.fromkeys(item.split("-")[0] for item in info[code][15].split(",") if item))
        identity = {"CO": "bogota", "JP": "tokio"}.get(code) if slot == 0 else None
        return {
            "id": identity or f"cap-{code.lower()}{'-' + suffix if suffix else ''}",
            "country": code,
            "continent": subdivisions[code],
            "name": es,
            "english": en,
            "lon": round(coord[0], 4),
            "lat": round(coord[1], 4),
            "timeZone": tz,
            "langs": languages[:5],
            "role": role,
            "tier": tier,
            "network": 0x1000 + ((ord(code[0]) - 65) * 26 + ord(code[1]) - 65) * 8 + slot,
        }

    result = []
    for code in COUNTRIES:
        query, es, en, role = PRIMARY.get(code, (info[code][5], None, None, "capital"))
        result.append(site(code, 0, "", query, es, en, role))
        result.extend(site(code, *extra) for extra in EXTRA.get(code, []))
    assert len({row["id"] for row in result}) == len(result)
    assert len(set(COUNTRIES)) == 197
    return result


def simplify(points, tolerance):
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    dx, dy = end[0] - start[0], end[1] - start[1]
    squared = dx * dx + dy * dy
    farthest = 0
    distance = tolerance * tolerance
    for i in range(1, len(points) - 1):
        x, y = points[i][0] - start[0], points[i][1] - start[1]
        fraction = max(0, min(1, (x * dx + y * dy) / squared)) if squared else 0
        gap = (x - fraction * dx) ** 2 + (y - fraction * dy) ** 2
        if gap > distance:
            farthest, distance = i, gap
    if farthest:
        return simplify(points[:farthest + 1], tolerance)[:-1] + simplify(points[farthest:], tolerance)
    return [start, end]


def area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:]))


def polygon_geometry(value, tolerance):
    polygons = [value["coordinates"]] if value["type"] == "Polygon" else value["coordinates"]
    output = []
    for index, polygon in enumerate(polygons):
        rings = []
        for ring_index, ring in enumerate(polygon):
            real_area = area(ring)
            if abs(real_area) < tolerance ** 2 and (index > 0 or ring_index > 0):
                continue
            thin = simplify(ring, tolerance)
            if len(thin) < 4:
                thin = ring
            # D3 uses the clockwise convention for the exterior on a sphere.
            if (real_area > 0) == (ring_index == 0):
                thin = thin[::-1]
            rings.append([[round(x, 4), round(y, 4)] for x, y in thin])
        if rings:
            output.append(rings)
    return {"type": "MultiPolygon", "coordinates": output}


def lines(features, tolerance):
    output = []
    for row in features:
        g = row["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        output.extend([[round(x, 4), round(y, 4)] for x, y in simplify(p, tolerance)] for p in parts)
    return {"type": "MultiLineString", "coordinates": output}


def geography(source, tolerance):
    load = lambda key: read_json(source / ("ne_50m_" + key + ".geojson"))["features"]
    countries = []
    features = load("admin_0_countries")
    standard_codes = {f["properties"]["ISO_A2"] for f in features if re.fullmatch("[A-Z]{2}", f["properties"]["ISO_A2"])}
    for f in features:
        p = f["properties"]
        code = p["ISO_A2"] if p["ISO_A2"] in standard_codes else p["ISO_A2_EH"]
        if code != p["ISO_A2"] and code in standard_codes:
            code = p["ADM0_A3"]
        key = code if re.fullmatch("[A-Z]{2}", code or "") else p["ADM0_A3"]
        countries.append({"type": "Feature", "id": key, "properties": {
            "name": p["NAME_ES"] or p["NAME"], "english": p["NAME_EN"] or p["NAME"],
        }, "geometry": polygon_geometry(f["geometry"], tolerance)})
    borders = load("admin_0_boundary_lines_land")
    regular = [f for f in borders if f["properties"]["FEATURECLA"].startswith("International")]
    disputed = [f for f in borders if f not in regular] + load("admin_0_boundary_lines_disputed_areas")
    lakes = [
        polygon_geometry(row["geometry"], tolerance)
        for row in load("lakes") if row["properties"]["scalerank"] <= 3
    ]
    return {
        "countries": {"type": "FeatureCollection", "features": countries},
        "borders": lines(regular, tolerance),
        "disputed": lines(disputed, tolerance),
        "lakes": {"type": "GeometryCollection", "geometries": lakes},
    }


def render_relief(source, target):
    import numpy as np
    from PIL import Image

    # Natural Earth I, the same raw projection used by D3 in the map.
    # The source is world-registered grayscale in WGS 84.
    raster = Image.open(source).convert("L").resize((5400, 2700), Image.Resampling.LANCZOS)
    raw = np.asarray(raster)
    width, height = 2800, 1456
    x_extent, y_extent = 2.735384723480633, 1.422390506730596
    y = np.linspace(y_extent, -y_extent, height)
    phi = y.copy()
    for _ in range(12):
        s = phi * phi
        v = phi * (1.007226 + s * (0.015085 + s**2 * (-0.044475 + 0.028874*s - 0.005916*s**2)))
        d = 1.007226 + s * (0.015085*3 + s**2 * (-0.044475*7 + 0.028874*9*s - 0.005916*11*s**2))
        phi -= (v-y) / d
    s = phi * phi
    scale = 0.8707 - .131979*s + s**2 * (-.013791 + s**2 * (.003971*s - .001529*s**2))
    lon = np.linspace(-x_extent, x_extent, width)[None, :] / scale[:, None]
    sx = np.clip(np.round((lon / np.pi + 1) * ((raw.shape[1]-1)/2)), 0, raw.shape[1]-1).astype(int)
    sy = np.clip(np.round((1-phi/(np.pi/2)) * ((raw.shape[0]-1)/2)), 0, raw.shape[0]-1).astype(int)
    shade = raw[sy[:, None], sx]
    shade[abs(lon) > np.pi] = 0
    Image.fromarray(shade).save(target, quality=84, method=6)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--relief", type=Path)
    args = parser.parse_args()
    data = catalog(args.source)
    write_json(ROOT / "packages/shared/src/pvp/capitals.json", data)
    target = ROOT / "apps/frontend/src/components/Atlas"
    write_json(target / "world-overview.json", geography(args.source, 0.16))
    write_json(target / "world-detail.json", geography(args.source, 0.035))
    if args.relief:
        render_relief(args.relief, target / "relief.webp")
    print(f"{len(COUNTRIES)} países o territorios y {len(data)} ubicaciones.")


if __name__ == "__main__":
    main()
