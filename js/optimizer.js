/* =========================================================================
   optimizer.js — Otimizador de roteiro dentro de um parque
   Considera fila (Queue-Times), distância (Haversine), horário e clima.
   Heurística: vizinho mais próximo ponderado (guloso, rápido, determinístico).
   ========================================================================= */

import { getQueueTimes, matchWaitTime } from './api.js';

export function haversine(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180, lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const WEIGHTS = {
  balanced: { queue: 1.0, distance: 1.0 },
  queue:    { queue: 2.5, distance: 0.4 },
  distance: { queue: 0.4, distance: 2.5 }
};

export async function optimizeRoute(park, attractions, weatherDay, strategy = 'balanced') {
  const w = WEIGHTS[strategy] || WEIGHTS.balanced;
  const notes = [];

  let rides = [];
  try { rides = await getQueueTimes(park); }
  catch (e) { notes.push('⚠️ Sem dados de fila em tempo real (usando distância/horário apenas). ' + e.message); }

  const enriched = attractions.map(a => {
    const m = matchWaitTime(rides, a.name);
    return { ...a, waitTime: m.waitTime, isOpen: m.isOpen };
  });

  const waits = enriched.map(a => a.waitTime ?? 30);
  const maxWait = Math.max(...waits, 1);

  const remaining = [...enriched];
  const order = [];
  let current = park.coords;
  let totalWalkKm = 0;
  const maxDist = Math.max(...enriched.map(a => haversine(park.coords, a.coords)), 0.1) * 2;

  while (remaining.length) {
    let bestIdx = 0, bestScore = Infinity;
    remaining.forEach((a, i) => {
      const dist = haversine(current, a.coords);
      const waitNorm = (a.waitTime ?? 30) / maxWait;
      const distNorm = dist / maxDist;
      const score = w.queue * waitNorm + w.distance * distNorm;
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    });
    const chosen = remaining.splice(bestIdx, 1)[0];
    totalWalkKm += haversine(current, chosen.coords);
    current = chosen.coords;
    order.push(chosen);
  }

  if (park.openingHours)
    notes.push(`🕐 Parque opera das ${park.openingHours.open} às ${park.openingHours.close}. Sugestão: chegue no rope drop para pegar as filas mais curtas.`);
  if (weatherDay && weatherDay.rainChance >= 60)
    notes.push(`🌧️ ${weatherDay.rainChance}% de chance de chuva — intercale atrações cobertas nos horários de pico de pancadas.`);

  const level = min => (min == null ? 'closed' : min <= 20 ? 'green' : min <= 45 ? 'yellow' : 'red');
  order.forEach(a => a.level = level(a.waitTime));

  return { order, totalWalkKm: Math.round(totalWalkKm * 100) / 100, notes };
}
