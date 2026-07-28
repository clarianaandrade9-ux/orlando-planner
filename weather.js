/* =========================================================================
   weather.js — Integração com a API Open-Meteo (sem chave, CORS OK)
   Clima atual + previsão de 7 dias para Orlando, FL.
   ========================================================================= */

const ORLANDO = { lat: 28.5383, lon: -81.3792 };

const WMO = {
  0:['☀️','Céu limpo'],1:['🌤️','Predomínio de sol'],2:['⛅','Parcialmente nublado'],3:['☁️','Nublado'],
  45:['🌫️','Nevoeiro'],48:['🌫️','Nevoeiro com geada'],
  51:['🌦️','Garoa fraca'],53:['🌦️','Garoa'],55:['🌦️','Garoa forte'],
  61:['🌧️','Chuva fraca'],63:['🌧️','Chuva'],65:['🌧️','Chuva forte'],
  66:['🌧️','Chuva congelante'],67:['🌧️','Chuva congelante forte'],
  71:['🌨️','Neve fraca'],73:['🌨️','Neve'],75:['🌨️','Neve forte'],
  80:['🌦️','Pancadas de chuva'],81:['🌧️','Pancadas fortes'],82:['⛈️','Pancadas violentas'],
  95:['⛈️','Tempestade'],96:['⛈️','Tempestade com granizo'],99:['⛈️','Tempestade severa']
};
export function describeCode(code) { return WMO[code] || ['🌡️','Indefinido']; }

export async function getWeather() {
  const params = new URLSearchParams({
    latitude: ORLANDO.lat, longitude: ORLANDO.lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'America/New_York', forecast_days: 7, temperature_unit: 'celsius'
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();

  const current = {
    temp: Math.round(data.current.temperature_2m),
    feels: Math.round(data.current.apparent_temperature),
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation,
    code: data.current.weather_code
  };
  const daily = data.daily.time.map((date, i) => ({
    date, code: data.daily.weather_code[i],
    tMax: Math.round(data.daily.temperature_2m_max[i]),
    tMin: Math.round(data.daily.temperature_2m_min[i]),
    rainChance: data.daily.precipitation_probability_max[i],
    windMax: Math.round(data.daily.wind_speed_10m_max[i])
  }));
  return { current, daily };
}

export function getAlerts(daily) {
  const alerts = [];
  for (const d of daily) {
    if (d.rainChance >= 70) alerts.push({ date: d.date, msg: `Alta chance de chuva (${d.rainChance}%) — leve capa e priorize atrações cobertas.` });
    if ([95, 96, 99].includes(d.code)) alerts.push({ date: d.date, msg: `Risco de tempestade — acompanhe fechamentos de atrações ao ar livre.` });
    if (d.windMax >= 45) alerts.push({ date: d.date, msg: `Ventos fortes (${d.windMax} km/h) — algumas atrações altas podem fechar.` });
    if (d.tMax >= 35) alerts.push({ date: d.date, msg: `Calor intenso (${d.tMax}°C) — hidrate-se e planeje pausas.` });
  }
  return alerts;
}
