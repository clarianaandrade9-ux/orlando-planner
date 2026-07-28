/* =========================================================================
   app.js — Orquestrador principal (entry point, type="module")
   Carrega a base de parques, inicializa componentes, renderiza abas,
   liga eventos e gerencia tema, toasts, import/export e PWA.
   ========================================================================= */

import { store } from './store.js';
import * as api from './api.js';
import * as weather from './weather.js';
import * as maps from './maps.js';
import { optimizeRoute } from './optimizer.js';

let PARKS = null;
let weatherCache = null;
let autoRefreshTimer = null;

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const parkById = id => PARKS.parks.find(p => p.id === id);
const fmtDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ========================= 1) BOOTSTRAP ================================= */
async function boot() {
  PARKS = await loadParks();
  hydrateSettingsForm();
  wireGlobalEvents();
  wireTabs();
  store.subscribe(renderAll);
  renderAll();
  loadWeather();
  setupAutoRefresh();
}

async function loadParks() {
  try {
    const res = await fetch('data/parks.json');
    if (!res.ok) throw new Error('parks.json indisponível');
    return await res.json();
  } catch (e) {
    console.warn('Usando fallback embutido de parques.', e);
    toast('Não foi possível carregar data/parks.json — publique via GitHub Pages/servidor local.', 'error');
    return FALLBACK_PARKS;
  }
}

/* ========================= 2) NAVEGAÇÃO POR ABAS ======================= */
function wireTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      $$('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      $$('.tab-panel').forEach(p => p.classList.add('hidden'));
      $(`#tab-${tab}`).classList.remove('hidden');
      if (tab === 'map') maps.initMap(PARKS);
      if (tab === 'weather') renderWeatherTab();
      if (tab === 'queues') renderQueuesTab();
      if (tab === 'guide') renderGuide();
    });
  });
}

/* ========================= 3) RENDER PRINCIPAL ======================== */
function renderAll(state = store.state) {
  renderDashboard(state);
  renderPlanner(state);
  fillParkSelects();
}

/* ---------- 3.1 Dashboard --------------------------------------------- */
function renderDashboard(state) {
  renderCountdown(state.trip.start);
  const parksPlanned = new Set(state.days.filter(d => d.parkId).map(d => d.parkId)).size;
  const totalAttractions = state.days.reduce((s, d) => s + d.items.length, 0);
  $('#stat-parks').textContent = parksPlanned;
  $('#stat-days').textContent = state.days.length;
  $('#stat-attractions').textContent = totalAttractions;

  const upcoming = [];
  for (const d of state.days) {
    for (const it of d.items) { upcoming.push({ day: d, item: it }); if (upcoming.length >= 6) break; }
    if (upcoming.length >= 6) break;
  }
  $('#upcoming-attractions').innerHTML = upcoming.length
    ? upcoming.map(u => `
        <li class="flex items-center justify-between surface-2 rounded-xl px-3 py-2">
          <span>🎡 <strong>${u.item.name}</strong></span>
          <span class="text-xs" style="color:var(--text-muted)">${fmtDate(u.day.date)} · ${parkById(u.day.parkId)?.name || ''}</span>
        </li>`).join('')
    : `<li style="color:var(--text-muted)">Nenhuma atração ainda. Vá ao Planejador para montar seu roteiro.</li>`;

  $('#trip-summary').innerHTML = state.days.length
    ? state.days.map(d => `
        <div class="flex items-center justify-between border-b border-[color:var(--border)] pb-1">
          <span>${fmtDate(d.date)}</span>
          <span style="color:var(--text-muted)">${parkById(d.parkId)?.name || '— sem parque —'} · ${d.items.length} atração(ões)</span>
        </div>`).join('')
    : `<p style="color:var(--text-muted)">Defina as datas no Planejador.</p>`;
}

function renderCountdown(startISO) {
  const box = $('#countdown');
  if (!startISO) { box.innerHTML = `<span class="text-sm" style="color:var(--text-muted)">Defina a data no Planejador</span>`; return; }
  const diff = new Date(startISO + 'T00:00:00') - new Date();
  if (diff <= 0) { box.innerHTML = `<span class="count-num">🎉</span><span class="text-sm ml-2 self-center">A viagem começou!</span>`; return; }
  const days = Math.floor(diff / 864e5);
  const hours = Math.floor((diff % 864e5) / 36e5);
  const mins = Math.floor((diff % 36e5) / 6e4);
  box.innerHTML = `
    <div class="count-box"><div class="count-num">${days}</div><div class="count-label">dias</div></div>
    <div class="count-box"><div class="count-num">${hours}</div><div class="count-label">horas</div></div>
    <div class="count-box"><div class="count-num">${mins}</div><div class="count-label">min</div></div>`;
}

/* ---------- 3.2 Planejador de dias ------------------------------------ */
function renderPlanner(state) {
  $('#trip-start').value = state.trip.start || '';
  $('#trip-end').value = state.trip.end || '';
  const container = $('#days-container');
  $('#planner-empty').style.display = state.days.length ? 'none' : 'block';

  container.innerHTML = state.days.map((day, idx) => {
    const park = parkById(day.parkId);
    const parkOptions = ['<option value="">— escolher parque —</option>']
      .concat(PARKS.parks.map(p => `<option value="${p.id}" ${p.id === day.parkId ? 'selected' : ''}>${p.name} (${p.type})</option>`)).join('');
    const available = park ? park.attractions.filter(a => !day.items.some(i => i.id === a.id)) : [];
    const addOptions = available.length
      ? ['<option value="">+ adicionar atração...</option>'].concat(available.map(a => `<option value="${a.id}">${a.name}</option>`)).join('')
      : '<option value="">— selecione um parque —</option>';
    const itemsHTML = day.items.map(it => `
      <li class="itinerary-item flex items-center justify-between surface-2 rounded-xl px-3 py-2" data-id="${it.id}">
        <span class="flex items-center gap-2"><span class="drag-handle">⠿</span> ${it.name}</span>
        <button class="btn-remove text-sm" data-day="${day.id}" data-att="${it.id}" title="Remover">✖️</button>
      </li>`).join('') || `<li class="text-sm px-3 py-2" style="color:var(--text-muted)">Nenhuma atração adicionada.</li>`;

    return `
      <div class="card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl brand-gradient text-white grid place-items-center font-bold">${idx + 1}</div>
            <div>
              <p class="font-bold">${fmtDate(day.date)}</p>
              <input type="date" value="${day.date}" class="field-date field !py-1 !px-2 text-sm mt-1" data-day="${day.id}" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <select class="park-select field !py-2" data-day="${day.id}">${parkOptions}</select>
            <button class="btn-remove-day btn btn-danger" data-day="${day.id}">🗑️</button>
          </div>
        </div>
        <div class="grid sm:grid-cols-2 gap-3">
          <ul class="itinerary-list space-y-2" data-day="${day.id}">${itemsHTML}</ul>
          <div>
            <select class="add-attraction field" data-day="${day.id}">${addOptions}</select>
            <p class="text-xs mt-2" style="color:var(--text-muted)">💡 Arraste as atrações (⠿) para reordenar o roteiro.</p>
          </div>
        </div>
      </div>`;
  }).join('');

  wirePlannerEvents();
  initSortable();
}

function wirePlannerEvents() {
  $$('.park-select').forEach(sel => sel.onchange = e => store.setDayPark(e.target.dataset.day, e.target.value));
  $$('.add-attraction').forEach(sel => sel.onchange = e => {
    const day = store.state.days.find(d => d.id === e.target.dataset.day);
    const park = parkById(day.parkId);
    const att = park?.attractions.find(a => a.id === e.target.value);
    if (att) { store.addAttraction(day.id, att); toast(`Adicionado: ${att.name}`, 'success'); }
  });
  $$('.btn-remove').forEach(btn => btn.onclick = e => store.removeAttraction(e.currentTarget.dataset.day, e.currentTarget.dataset.att));
  $$('.btn-remove-day').forEach(btn => btn.onclick = e => store.removeDay(e.currentTarget.dataset.day));
  $$('.field-date').forEach(inp => inp.onchange = e => {
    const day = store.state.days.find(d => d.id === e.target.dataset.day);
    if (day) { day.date = e.target.value; store.commit(); }
  });
}

function initSortable() {
  $$('.itinerary-list').forEach(list => {
    if (list._sortable) return;
    list._sortable = Sortable.create(list, {
      animation: 180, handle: '.drag-handle',
      ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', dragClass: 'sortable-drag',
      onEnd: () => {
        const dayId = list.dataset.day;
        const orderedIds = Array.from(list.querySelectorAll('.itinerary-item')).map(li => li.dataset.id);
        if (orderedIds.length) store.reorderAttractions(dayId, orderedIds);
      }
    });
  });
}

function fillParkSelects() {
  const opts = PARKS.parks.map(p => `<option value="${p.id}">${p.name} (${p.type})</option>`).join('');
  ['#queue-park', '#opt-park', '#guide-park'].forEach(sel => { if ($(sel) && !$(sel).innerHTML) $(sel).innerHTML = opts; });
}

/* ========================= 4) FILAS EM TEMPO REAL ===================== */
async function renderQueuesTab() {
  const parkId = $('#queue-park').value || PARKS.parks[0].id;
  const park = parkById(parkId);
  const list = $('#queues-list');
  list.innerHTML = Array.from({ length: 6 }).map(() => `<div class="card p-4"><div class="skeleton h-16"></div></div>`).join('');
  try {
    const rides = await api.getQueueTimes(park);
    const sort = $('#queue-sort').checked;
    let rows = rides.slice();
    if (sort) rows.sort((a, b) => (a.isOpen ? a.waitTime : 1e9) - (b.isOpen ? b.waitTime : 1e9));
    list.innerHTML = rows.map(r => {
      const lvl = api.queueLevel(r.isOpen ? r.waitTime : null);
      const cls = { green: 'queue-green', yellow: 'queue-yellow', red: 'queue-red', closed: 'queue-closed' }[lvl];
      const label = r.isOpen ? `${r.waitTime} min` : 'Fechada';
      return `
        <div class="card p-4 flex items-center justify-between gap-3">
          <div><p class="font-semibold leading-tight">${r.name}</p>${r.land ? `<p class="text-xs" style="color:var(--text-muted)">${r.land}</p>` : ''}</div>
          <span class="queue-badge ${cls}"><span class="queue-dot"></span>${label}</span>
        </div>`;
    }).join('') || `<p style="color:var(--text-muted)">Sem atrações retornadas.</p>`;
    $('#queue-updated').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
  } catch (e) {
    list.innerHTML = `<div class="card p-5 col-span-full">
      <p class="font-semibold" style="color:var(--accent-red)">Não foi possível carregar as filas.</p>
      <p class="text-sm mt-1" style="color:var(--text-muted)">${e.message}</p>
      <p class="text-sm mt-2">Dica: configure um <strong>proxy CORS</strong> na aba Ajustes.</p>
    </div>`;
  }
}

/* ========================= 5) OTIMIZADOR ============================== */
async function runOptimizer() {
  const park = parkById($('#opt-park').value || PARKS.parks[0].id);
  const strategy = $('#opt-weight').value;
  const box = $('#optimizer-result');
  box.innerHTML = `<div class="skeleton h-40"></div>`;
  const day = store.state.days.find(d => d.parkId === park.id);
  let wd = null;
  if (weatherCache && day) wd = weatherCache.daily.find(x => x.date === day.date) || null;

  const { order, totalWalkKm, notes } = await optimizeRoute(park, park.attractions, wd, strategy);
  box.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h3 class="font-bold text-lg">🧭 Percurso sugerido — ${park.name}</h3>
      <span class="text-sm" style="color:var(--text-muted)">Caminhada estimada: <strong>${totalWalkKm} km</strong></span>
    </div>
    <ol class="space-y-2">
      ${order.map((a, i) => {
        const cls = { green: 'queue-green', yellow: 'queue-yellow', red: 'queue-red', closed: 'queue-closed' }[a.level];
        const label = a.waitTime == null ? (a.isOpen === false ? 'Fechada' : 's/ dado') : `${a.waitTime} min`;
        return `<li class="flex items-center justify-between surface-2 rounded-xl px-3 py-2">
          <span><span class="font-bold brand-text mr-2">${i + 1}.</span>${a.name}</span>
          <span class="queue-badge ${cls}"><span class="queue-dot"></span>${label}</span>
        </li>`;
      }).join('')}
    </ol>
    ${notes.length ? `<div class="mt-4 space-y-1 text-sm" style="color:var(--text-muted)">${notes.map(n => `<p>${n}</p>`).join('')}</div>` : ''}
    <div class="mt-4"><button id="opt-to-map" class="btn btn-ghost">🗺️ Ver percurso no mapa</button></div>`;
  $('#opt-to-map').onclick = () => {
    $('.tab-btn[data-tab="map"]').click();
    maps.initMap(PARKS);
    setTimeout(() => maps.drawRoute([park.coords, ...order.map(a => a.coords)]), 300);
  };
}

/* ============ 5.1) GUIA — Personagens e Onde comer, por parque ======== */
let guideView = 'characters';   // 'characters' | 'dining'

function renderGuide() {
  const sel = $('#guide-park');
  if (!sel.innerHTML) sel.innerHTML = PARKS.parks.map(p => `<option value="${p.id}">${p.name} (${p.type})</option>`).join('');
  $('#guide-view-characters').className = 'btn ' + (guideView === 'characters' ? 'btn-primary' : 'btn-ghost');
  $('#guide-view-dining').className     = 'btn ' + (guideView === 'dining' ? 'btn-primary' : 'btn-ghost');

  const parkId = sel.value || PARKS.parks[0].id;
  const park = parkById(parkId);
  const box = $('#guide-content');

  if (guideView === 'characters') {
    const spots = (PARKS.characterSpots || []).filter(c => c.parkId === parkId);
    box.innerHTML = `
      <div class="card p-5">
        <h2 class="font-bold text-lg mb-1">🤳 Personagens para foto — ${park.name}</h2>
        <p class="text-xs mb-4" style="color:var(--text-muted)">${spots.length} ponto(s) de encontro. ⚠️ Locais e horários mudam com frequência — confirme no app oficial no dia.</p>
        <ul class="grid sm:grid-cols-2 gap-2">
          ${spots.map(c => `
            <li class="surface-2 rounded-xl px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold">🤳 ${c.characters}</span>
                <a href="${maps.googleMapsDir(c.coords[0], -Math.abs(c.coords[1]), c.characters)}" target="_blank" rel="noopener" class="text-xs" style="color:var(--brand-2)">🧭 Mapa</a>
              </div>
              <p class="text-xs" style="color:var(--text-muted)">📍 ${c.location}</p>
            </li>`).join('') || `<li style="color:var(--text-muted)">Sem pontos de personagens cadastrados neste parque.</li>`}
        </ul>
      </div>`;
  } else {
    const dining = (PARKS.restaurants || []).filter(r => r.parkId === parkId);
    box.innerHTML = `
      <div class="card p-5">
        <h2 class="font-bold text-lg mb-1">🍽️ Onde comer — ${park.name}</h2>
        <p class="text-xs mb-4" style="color:var(--text-muted)">${dining.length} opção(ões) de alimentação dentro do parque.</p>
        <ul class="grid sm:grid-cols-2 gap-2">
          ${dining.map(r => {
            const nome = r.name.replace(/\s*\(.*\)\s*$/, '');
            return `<li class="surface-2 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <span>🍴 ${nome}</span>
              <a href="${maps.googleMapsDir(r.coords[0], -Math.abs(r.coords[1]), nome)}" target="_blank" rel="noopener" class="text-xs" style="color:var(--brand-2)">🧭 Mapa</a>
            </li>`;
          }).join('') || `<li style="color:var(--text-muted)">Sem restaurantes cadastrados neste parque.</li>`}
        </ul>
      </div>`;
  }
}

/* ========================= 6) CLIMA =================================== */
async function loadWeather() {
  try {
    weatherCache = await weather.getWeather();
    renderDashWeather();
    renderWeatherTab();
  } catch (e) {
    $('#dash-weather').innerHTML = `<span class="text-sm" style="color:var(--accent-red)">Clima indisponível</span>`;
  }
}

function renderDashWeather() {
  if (!weatherCache) return;
  const c = weatherCache.current;
  const [emoji, desc] = weather.describeCode(c.code);
  $('#dash-weather').innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-4xl">${emoji}</span>
      <div><p class="text-3xl font-extrabold leading-none">${c.temp}°C</p>
      <p class="text-xs" style="color:var(--text-muted)">${desc} · umidade ${c.humidity}%</p></div>
    </div>`;
}

function renderWeatherTab() {
  if (!weatherCache) return;
  const c = weatherCache.current;
  const [emoji, desc] = weather.describeCode(c.code);
  $('#weather-current').innerHTML = `
    <p class="count-label mb-2">Agora em Orlando</p>
    <div class="text-6xl mb-2">${emoji}</div>
    <p class="text-5xl font-extrabold">${c.temp}°C</p>
    <p style="color:var(--text-muted)">${desc}</p>
    <div class="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
      <div class="surface-2 rounded-xl p-2"><div class="font-bold">${c.feels}°C</div><div style="color:var(--text-muted)">sensação</div></div>
      <div class="surface-2 rounded-xl p-2"><div class="font-bold">${c.humidity}%</div><div style="color:var(--text-muted)">umidade</div></div>
      <div class="surface-2 rounded-xl p-2"><div class="font-bold">${c.precipitation} mm</div><div style="color:var(--text-muted)">chuva</div></div>
    </div>`;
  $('#weather-forecast').innerHTML = weatherCache.daily.map(d => {
    const [e2] = weather.describeCode(d.code);
    return `<div class="surface-2 rounded-xl p-3 text-center">
      <p class="text-xs font-semibold">${new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</p>
      <div class="text-2xl my-1">${e2}</div>
      <p class="text-sm"><strong>${d.tMax}°</strong> / ${d.tMin}°</p>
      <p class="text-xs mt-1" style="color:var(--brand-2)">💧 ${d.rainChance ?? 0}%</p>
    </div>`;
  }).join('');
  const alerts = weather.getAlerts(weatherCache.daily);
  $('#weather-alerts').innerHTML = alerts.length
    ? alerts.map(a => `<div class="weather-alert mb-2">⚠️ <strong>${fmtDate(a.date)}:</strong> ${a.msg}</div>`).join('')
    : `<div class="card p-3 text-sm" style="color:var(--text-muted)">✅ Sem alertas climáticos relevantes nos próximos 7 dias.</div>`;
}

/* ========================= 7) EVENTOS GLOBAIS ========================= */
function wireGlobalEvents() {
  $('#btn-theme').onclick = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('otp_theme', dark ? 'dark' : 'light');
    $('#btn-theme').textContent = dark ? '☀️' : '🌙';
  };
  $('#btn-theme').textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';

  $('#btn-generate-days').onclick = () => {
    const s = $('#trip-start').value, e = $('#trip-end').value;
    if (!s || !e) return toast('Informe início e fim da viagem.', 'error');
    if (e < s) return toast('A data final deve ser após a inicial.', 'error');
    store.setTripDates(s, e); store.generateDays(s, e); toast('Dias gerados!', 'success');
  };
  $('#btn-add-day').onclick = () => store.addDay();

  $('#btn-refresh-queues').onclick = renderQueuesTab;
  $('#queue-park').onchange = renderQueuesTab;
  $('#queue-sort').onchange = renderQueuesTab;

  $('#btn-optimize').onclick = runOptimizer;

  $('#guide-park').onchange = renderGuide;
  $('#guide-view-characters').onclick = () => { guideView = 'characters'; renderGuide(); };
  $('#guide-view-dining').onclick = () => { guideView = 'dining'; renderGuide(); };

  $$('.map-layer').forEach(chk => chk.onchange = e => maps.toggleLayer(e.target.dataset.layer, e.target.checked));

  $('#btn-save-settings').onclick = () => {
    store.setSettings({ proxy: $('#cfg-proxy').value.trim(), autoRefresh: $('#cfg-autorefresh').checked });
    setupAutoRefresh(); toast('Ajustes salvos.', 'success');
  };
  $('#btn-reset').onclick = () => {
    if (confirm('Isso apagará todo o seu planejamento. Continuar?')) { store.reset(); toast('Planejamento apagado.', 'success'); }
  };

  $('#btn-export').onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orlando-plano-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  $('#btn-import').onclick = () => $('#import-file').click();
  $('#import-file').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { store.importJSON(reader.result); toast('Planejamento importado!', 'success'); } catch { toast('Arquivo JSON inválido.', 'error'); } };
    reader.readAsText(file);
  };
}

function hydrateSettingsForm() {
  $('#cfg-proxy').value = store.state.settings.proxy || '';
  $('#cfg-autorefresh').checked = !!store.state.settings.autoRefresh;
}

function setupAutoRefresh() {
  clearInterval(autoRefreshTimer);
  if (store.state.settings.autoRefresh) {
    autoRefreshTimer = setInterval(() => {
      if (!$('#tab-queues').classList.contains('hidden')) renderQueuesTab();
    }, 5 * 60 * 1000);
  }
}

setInterval(() => renderCountdown(store.state.trip.start), 60 * 1000);

/* ========================= 8) PWA (Service Worker + Instalar) ========= */
function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller)
            toast('🔄 Nova versão disponível. Recarregue para atualizar.');
        });
      });
    } catch (e) { console.warn('Falha ao registrar o Service Worker.', e); }
  });
}

let deferredPrompt = null;
function setupInstallPrompt() {
  const btn = $('#btn-install');
  if (!btn) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.classList.remove('hidden');
  });
  btn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') toast('App instalado! 🎉', 'success');
    deferredPrompt = null;
    btn.classList.add('hidden');
  };
  window.addEventListener('appinstalled', () => { btn.classList.add('hidden'); toast('App instalado! 🎉', 'success'); });
}

/* ---------- Fallback mínimo (caso data/parks.json não carregue) -------- */
const FALLBACK_PARKS = {
  parks: [
    { id: 'mk', name: 'Magic Kingdom', type: 'Disney', queueTimesId: 6, coords: [28.4177, 81.5812], openingHours: { open: '09:00', close: '22:00' }, attractions: [
      { id: 'mk-1', name: 'Space Mountain', coords: [28.4189, 81.5776] },
      { id: 'mk-2', name: 'Seven Dwarfs Mine Train', coords: [28.4205, 81.5806] }
    ]},
    { id: 'usf', name: 'Universal Studios Florida', type: 'Universal', queueTimesId: 65, coords: [28.4754, 81.4685], openingHours: { open: '09:00', close: '21:00' }, attractions: [
      { id: 'usf-1', name: 'Revenge of the Mummy', coords: [28.4756, 81.4675] }
    ]}
  ],
  restaurants: [], shopping: [], characterSpots: []
};

/* ---------- START ------------------------------------------------------ */
boot();
registerPWA();
setupInstallPrompt();
