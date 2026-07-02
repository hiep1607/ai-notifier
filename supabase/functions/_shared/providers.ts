// Nguồn dữ liệu CHUYÊN BIỆT (Pha B) — API công khai, MIỄN PHÍ, không cần key:
//   weather : Open-Meteo (geocoding + forecast)
//   crypto  : CoinGecko simple/price
//   fx      : open.er-api.com (tỷ giá tham khảo, cập nhật ngày)
// KHÔNG đụng quota Gemini grounding (1.500/ngày). Lỗi gì cũng THROW để run-monitor
// fallback về đường search cũ — provider hỏng không làm chết rule.
// Phần compose văn bản là hàm THUẦN ở monitorLogic.ts (jest test được); file này chỉ fetch.

import {
  composeCryptoNotif,
  composeFxNotif,
  composeWeatherNotif,
  extractWeatherLocation,
  matchCoin,
  ProviderNotif,
  WeatherDaily,
} from "./monitorLogic.ts";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} từ ${new URL(url).host}`);
  return await res.json() as T;
}

// ---- THỜI TIẾT: Open-Meteo ----
interface GeoResult { results?: { name: string; latitude: number; longitude: number }[] }
interface ForecastResult {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max?: number[];
  };
}

export async function fetchWeatherNotif(keyword: string): Promise<ProviderNotif> {
  const loc = extractWeatherLocation(keyword);
  if (!loc) throw new Error("không tách được địa danh từ keyword");

  const geo = await getJson<GeoResult>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=vi&format=json`,
  );
  const place = geo.results?.[0];
  if (!place) throw new Error(`không tìm thấy địa danh "${loc}"`);

  const fc = await getJson<ForecastResult>(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&current=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
    `&timezone=Asia%2FHo_Chi_Minh&forecast_days=2`,
  );
  const d = fc.daily;
  if (!d?.temperature_2m_max?.length) throw new Error("Open-Meteo không trả dữ liệu ngày");

  const day = (i: number): WeatherDaily => ({
    code: d.weather_code?.[i] ?? 0,
    tmax: d.temperature_2m_max?.[i] ?? 0,
    tmin: d.temperature_2m_min?.[i] ?? 0,
    rainPct: d.precipitation_probability_max?.[i] ?? 0,
    windMax: d.wind_speed_10m_max?.[i] ?? 0,
  });
  const tomorrow = (d.temperature_2m_max?.length ?? 0) > 1 ? day(1) : null;

  return composeWeatherNotif(
    place.name,
    fc.current?.temperature_2m ?? day(0).tmax,
    fc.current?.weather_code ?? day(0).code,
    day(0),
    tomorrow,
  );
}

// ---- CRYPTO: CoinGecko ----
interface CoinPrice {
  [id: string]: { usd?: number; vnd?: number; usd_24h_change?: number };
}

export async function fetchCryptoNotif(keyword: string): Promise<ProviderNotif> {
  const coin = matchCoin(keyword);
  if (!coin) throw new Error("không nhận diện được coin từ keyword");

  const data = await getJson<CoinPrice>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd,vnd&include_24hr_change=true`,
  );
  const p = data[coin.id];
  if (!p?.usd) throw new Error(`CoinGecko không trả giá cho ${coin.id}`);

  return composeCryptoNotif(coin.id, coin.name, p.usd, p.vnd ?? null, p.usd_24h_change ?? null);
}

// ---- TỶ GIÁ: open.er-api.com ----
interface ErApiResult { result?: string; rates?: Record<string, number> }

export async function fetchFxNotif(prevValue?: string | null): Promise<ProviderNotif> {
  const data = await getJson<ErApiResult>("https://open.er-api.com/v6/latest/USD");
  const vnd = data.rates?.VND;
  if (data.result !== "success" || !vnd) throw new Error("er-api không trả tỷ giá VND");
  return composeFxNotif(Math.round(vnd), prevValue);
}
