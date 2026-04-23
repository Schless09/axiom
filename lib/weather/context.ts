/**
 * Historical weather context for claim analysis.
 *
 * Uses OpenWeatherMap One Call API 3.0 (timemachine endpoint) to fetch
 * conditions at the time and location of the incident.
 *
 * Gated on OPENWEATHER_API_KEY — returns null silently if the key is absent
 * or if GPS coordinates / timestamp are unavailable. Never throws; always
 * fails gracefully so analysis can proceed without weather context.
 *
 * Requirements:
 *   - OPENWEATHER_API_KEY environment variable (One Call API 3.0 subscription)
 *   - GPS coordinates (lat, lon) from dashcam EXIF metadata or user input
 *   - captured_at timestamp from the evidence record
 */

import type { WeatherContext } from "@/lib/ai/vla-schemas";

interface OWMTimemachineResponse {
  data: Array<{
    dt: number;
    temp: number;
    visibility?: number;
    wind_speed?: number;
    rain?: { "1h"?: number };
    snow?: { "1h"?: number };
    weather: Array<{ description: string; main: string }>;
  }>;
}

/**
 * Fetch historical weather conditions for a given location and time.
 *
 * @param lat - Latitude (WGS84)
 * @param lon - Longitude (WGS84)
 * @param capturedAt - ISO timestamp of the incident
 * @returns WeatherContext or null if unavailable
 */
export async function fetchWeatherContext(
  lat: number,
  lon: number,
  capturedAt: string,
): Promise<WeatherContext | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const timestamp = Math.floor(new Date(capturedAt).getTime() / 1000);
    if (isNaN(timestamp)) {
      console.warn("[weather] invalid capturedAt timestamp:", capturedAt);
      return null;
    }

    // OpenWeatherMap One Call 3.0 timemachine endpoint
    const url = new URL("https://api.openweathermap.org/data/3.0/onecall/timemachine");
    url.searchParams.set("lat", lat.toFixed(6));
    url.searchParams.set("lon", lon.toFixed(6));
    url.searchParams.set("dt", String(timestamp));
    url.searchParams.set("units", "metric");
    url.searchParams.set("appid", apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[weather] API returned ${response.status} for lat=${lat}, lon=${lon}, ts=${timestamp}`);
      return null;
    }

    const data = (await response.json()) as OWMTimemachineResponse;
    const hourly = data.data?.[0];
    if (!hourly) return null;

    const precipMm =
      (hourly.rain?.["1h"] ?? 0) + (hourly.snow?.["1h"] ?? 0);

    const conditions = hourly.weather.map((w) => w.description);
    const description = conditions.join(", ") || (hourly.weather[0]?.main ?? "unknown");

    return {
      timestamp: capturedAt,
      lat,
      lon,
      description,
      temp_c: hourly.temp,
      visibility_m: hourly.visibility,
      wind_speed_mps: hourly.wind_speed,
      precipitation_mm: precipMm > 0 ? precipMm : undefined,
      conditions,
    };
  } catch (e) {
    console.warn("[weather] fetch failed (non-fatal):", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Produce a human-readable weather summary for the adjuster narrative.
 * Returns null if weatherContext is null.
 */
export function summarizeWeather(ctx: WeatherContext | null): string | null {
  if (!ctx) return null;

  const parts: string[] = [];

  if (ctx.description) parts.push(ctx.description);
  if (ctx.temp_c != null) parts.push(`${ctx.temp_c.toFixed(1)}°C`);
  if (ctx.visibility_m != null) {
    parts.push(
      ctx.visibility_m >= 10000
        ? "good visibility"
        : `visibility ${(ctx.visibility_m / 1000).toFixed(1)} km`,
    );
  }
  if (ctx.precipitation_mm != null && ctx.precipitation_mm > 0) {
    parts.push(`precipitation ${ctx.precipitation_mm.toFixed(1)} mm/hr`);
  }
  if (ctx.wind_speed_mps != null && ctx.wind_speed_mps > 10) {
    parts.push(`wind ${ctx.wind_speed_mps.toFixed(0)} m/s`);
  }

  return parts.length > 0 ? `Weather at incident time: ${parts.join(", ")}.` : null;
}

/**
 * Derive adverse-conditions flags from weather context.
 * Returns a list of descriptive strings for the synthesis narrative.
 */
export function getAdverseConditionFlags(ctx: WeatherContext | null): string[] {
  if (!ctx) return [];

  const flags: string[] = [];

  if (ctx.precipitation_mm != null && ctx.precipitation_mm > 0) {
    flags.push("wet road surface");
  }
  if (ctx.visibility_m != null && ctx.visibility_m < 1000) {
    flags.push("reduced visibility (< 1 km)");
  }
  if (ctx.wind_speed_mps != null && ctx.wind_speed_mps > 15) {
    flags.push("high wind");
  }
  const desc = ctx.description.toLowerCase();
  if (/snow|ice|frost|sleet|blizzard/.test(desc)) {
    flags.push("icy or snowy conditions");
  }
  if (/fog|mist|haze/.test(desc)) {
    flags.push("foggy conditions");
  }

  return flags;
}
