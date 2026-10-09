import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PowerDay = { date: string; solar: number | null; temp: number | null; tmax: number | null; tmin: number | null; humidity: number | null; rain: number | null };
export type FireSummary = { count: number; nearestKm: number | null; maxFrp: number | null; radiusKm: number; available: boolean };
export type SatelliteData = { power: { latest: PowerDay | null; days: PowerDay[]; available: boolean }; fires: FireSummary };

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const val = (v: unknown) => (typeof v === "number" && v > -900 ? v : null);

function haversineKm(a: number, b: number, c: number, d: number) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function fetchPower(lat: number, lon: number) {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 86400000);
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN,T2M,T2M_MAX,T2M_MIN,RH2M,PRECTOTCORR&community=AG&latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`POWER ${res.status}`);
  const j = (await res.json()) as { properties: { parameter: Record<string, Record<string, number>> } };
  const p = j.properties.parameter;
  const days: PowerDay[] = Object.keys(p["T2M"] ?? {}).map((k) => ({
    date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`,
    solar: val(p["ALLSKY_SFC_SW_DWN"]?.[k]), temp: val(p["T2M"]?.[k]), tmax: val(p["T2M_MAX"]?.[k]), tmin: val(p["T2M_MIN"]?.[k]),
    humidity: val(p["RH2M"]?.[k]), rain: val(p["PRECTOTCORR"]?.[k]),
  })).filter((d) => d.temp !== null);
  const last = days.at(-1);
  // Satellite solar values arrive a few days later than temperature; fall back to the most recent reading.
  const latest = last ? { ...last, solar: last.solar ?? [...days].reverse().find((d) => d.solar !== null)?.solar ?? null } : null;
  return { days: days.slice(-7), latest };
}

async function fetchFires(lat: number, lon: number): Promise<FireSummary> {
  const key = process.env["NASA_FIRMS_MAP_KEY"];
  const radiusKm = 100;
  if (!key) return { count: 0, nearestKm: null, maxFrp: null, radiusKm, available: false };
  const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const box = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((n) => n.toFixed(3)).join(",");
  const res = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_NOAA20_NRT/${box}/2`);
  const text = await res.text();
  if (!res.ok || !text.startsWith("latitude")) throw new Error(`FIRMS ${res.status}`);
  const [head, ...rows] = text.trim().split("\n");
  const cols = head!.split(",");
  const iLat = cols.indexOf("latitude"), iLon = cols.indexOf("longitude"), iFrp = cols.indexOf("frp");
  let nearest: number | null = null, maxFrp: number | null = null, count = 0;
  for (const row of rows) {
    const c = row.split(",");
    const dist = haversineKm(lat, lon, Number(c[iLat]), Number(c[iLon]));
    if (dist > radiusKm) continue;
    count++;
    nearest = nearest === null ? dist : Math.min(nearest, dist);
    const frp = Number(c[iFrp]);
    if (!Number.isNaN(frp)) maxFrp = maxFrp === null ? frp : Math.max(maxFrp, frp);
  }
  return { count, nearestKm: nearest === null ? null : Math.round(nearest), maxFrp, radiusKm, available: true };
}

export const getSatelliteData = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).parse(d))
  .handler(async ({ data }): Promise<SatelliteData> => {
    const [power, fires] = await Promise.allSettled([fetchPower(data.lat, data.lon), fetchFires(data.lat, data.lon)]);
    if (power.status === "rejected") console.error("NASA POWER failed", power.reason);
    if (fires.status === "rejected") console.error("NASA FIRMS failed", fires.reason);
    return {
      power: power.status === "fulfilled" ? { ...power.value, available: true } : { latest: null, days: [], available: false },
      fires: fires.status === "fulfilled" ? fires.value : { count: 0, nearestKm: null, maxFrp: null, radiusKm: 100, available: false },
    };
  });

export type Place = { name: string; lat: number; lon: number };
export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data }): Promise<Place[]> => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(data.q)}`, { headers: { "User-Agent": "AegisAgria/1.0 (plant care app)", "Accept-Language": "en" } });
    if (!res.ok) throw new Error(`Place search failed (${res.status})`);
    const j = (await res.json()) as { display_name: string; lat: string; lon: string }[];
    return j.map((p) => ({ name: p.display_name, lat: Number(p.lat), lon: Number(p.lon) }));
  });
