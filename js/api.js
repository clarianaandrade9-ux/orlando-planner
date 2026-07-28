/* =========================================================================
   api.js — Integração com a API pública do Queue-Times
   Docs: https://queue-times.com/pages/api
     - GET /parks.json                    -> lista de parques (agrupados)
     - GET /parks/{id}/queue_times.json   -> filas (atualiza a cada 5 min)
   Atribuição obrigatória: "Powered by Queue-Times.com".
   CORS: a API não envia cabeçalhos CORS. Use um 'proxy' configurável nos
   Ajustes (ex.: https://corsproxy.io/?url=).
   ========================================================================= */

import { store } from './store.js';

const BASE = 'https://queue-times.com';
let _parksIndexCache = null;
const _queueCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function withProxy(url) {
  const proxy = store.state.settings.proxy?.trim();
  if (!proxy) return url;
  return proxy.includes('?url=') || proxy.includes('=')
    ? proxy + encodeURIComponent(url)
    : proxy + url;
}

async function fetchJSON(url) {
  const res = await fetch(withProxy(url), { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao acessar ${url}`);
  return res.json();
}

export async function getParksIndex() {
  if (_parksIndexCache) return _parksIndexCache;
  const groups = await fetchJSON(`${BASE}/parks.json`);
  const flat = [];
  for (const g of groups) for (const p of (g.parks || [])) flat.push({ id: p.id, name: p.name, group: g.name });
  _parksIndexCache = flat;
  return flat;
}

function normalize(str) {
  return (str || '').toLowerCase()
    .replace(/disney'?s?|walt|park|resort|florida|the/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
}

export async function resolveQueueTimesId(park) {
  if (park.queueTimesId) return park.queueTimesId;
  try {
    const index = await getParksIndex();
    const target = normalize(park.name);
    const match = index.find(p => normalize(p.name) === target)
              || index.find(p => normalize(p.name).includes(target) || target.includes(normalize(p.name)));
    return match ? match.id : null;
  } catch { return null; }
}

export async function getQueueTimes(park) {
  const qtId = await resolveQueueTimesId(park);
  if (!qtId) throw new Error(`Parque "${park.name}" não possui filas no Queue-Times (ex.: parque aquático/novo).`);
  const cached = _queueCache.get(qtId);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.data;

  const data = await fetchJSON(`${BASE}/parks/${qtId}/queue_times.json`);
  const rides = [];
  for (const land of (data.lands || [])) for (const r of (land.rides || []))
    rides.push({ id: r.id, name: r.name, isOpen: r.is_open, waitTime: r.wait_time, land: land.name, lastUpdated: r.last_updated });
  for (const r of (data.rides || []))
    rides.push({ id: r.id, name: r.name, isOpen: r.is_open, waitTime: r.wait_time, land: null, lastUpdated: r.last_updated });

  _queueCache.set(qtId, { ts: Date.now(), data: rides });
  return rides;
}

export function matchWaitTime(rides, attractionName) {
  const target = normalize(attractionName);
  let best = null;
  for (const r of rides) {
    const n = normalize(r.name);
    if (n === target || n.includes(target) || target.includes(n)) { if (!best) best = r; }
  }
  return best ? { waitTime: best.isOpen ? best.waitTime : null, isOpen: best.isOpen } : { waitTime: null, isOpen: null };
}

export function queueLevel(minutes) {
  if (minutes == null) return 'closed';
  if (minutes <= 20) return 'green';
  if (minutes <= 45) return 'yellow';
  return 'red';
}
