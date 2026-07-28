/* =========================================================================
   maps.js — Mapa interativo (Leaflet + OpenStreetMap) e integração Google Maps
   Usamos Leaflet/OSM (grátis, sem chave) + deep links do Google Maps para
   navegação/rotas (esses links não exigem chave paga — ideal p/ GitHub Pages).
   ========================================================================= */

let map = null;
const layers = { parks: null, restaurants: null, shopping: null, characters: null };

/* Ícones por categoria (pin colorido com emoji) */
const PIN = {
  parks:       { color: '#6d28d9', emoji: '🎢' },
  restaurants: { color: '#f59e0b', emoji: '🍽️' },
  shopping:    { color: '#16a34a', emoji: '🛍️' },
  characters:  { color: '#db2777', emoji: '🤳' }
};

function makeIcon(kind) {
  const p = PIN[kind];
  return L.divIcon({
    className: '',
    html: `<div class="map-pin" style="background:${p.color}"><span>${p.emoji}</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28]
  });
}

/* Deep link universal do Google Maps para navegação até um ponto */
export function googleMapsDir(lat, lon, label = '') {
  const q = encodeURIComponent(label);
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving${q ? `&query=${q}` : ''}`;
}

function popupHTML(name, lat, lon) {
  return `
    <div style="min-width:180px">
      <strong>${name}</strong><br>
      <a href="${googleMapsDir(lat, lon, name)}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:600">🧭 Navegar no Google Maps</a>
    </div>`;
}

/* Popup específico de ponto de personagem (meet & greet) */
function characterPopupHTML(c) {
  const lat = c.coords[0], lon = -Math.abs(c.coords[1]);
  return `
    <div style="min-width:200px">
      <strong>🤳 ${c.characters}</strong><br>
      <span style="color:#6b7280">📍 ${c.location}</span><br>
      <a href="${googleMapsDir(lat, lon, c.characters)}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:600">🧭 Navegar no Google Maps</a>
      <p style="font-size:11px;color:#9aa0b5;margin:6px 0 0">⚠️ ${c.note || 'Horários mudam com frequência — confirme no app oficial.'}</p>
    </div>`;
}

export function initMap(data) {
  if (typeof L === 'undefined') return;   // Leaflet ausente (ex.: prévia offline)
  if (map) { setTimeout(() => map.invalidateSize(), 100); return; }

  map = L.map('map', { scrollWheelZoom: true }).setView([28.42, -81.52], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

  Object.keys(layers).forEach(k => layers[k] = L.layerGroup().addTo(map));

  // Parques
  data.parks.forEach(p => {
    L.marker([p.coords[0], -Math.abs(p.coords[1])], { icon: makeIcon('parks') })
      .bindPopup(popupHTML(`${p.name} (${p.type})`, p.coords[0], -Math.abs(p.coords[1])))
      .addTo(layers.parks);
  });

  // Restaurantes (onde comer dentro dos parques) + compras
  const cats = { restaurants: data.restaurants, shopping: data.shopping };
  Object.entries(cats).forEach(([kind, arr]) => {
    (arr || []).forEach(item => {
      L.marker([item.coords[0], -Math.abs(item.coords[1])], { icon: makeIcon(kind) })
        .bindPopup(popupHTML(item.name, item.coords[0], -Math.abs(item.coords[1])))
        .addTo(layers[kind]);
    });
  });

  // Personagens para foto
  (data.characterSpots || []).forEach(c => {
    L.marker([c.coords[0], -Math.abs(c.coords[1])], { icon: makeIcon('characters') })
      .bindPopup(characterPopupHTML(c))
      .addTo(layers.characters);
  });

  setTimeout(() => map.invalidateSize(), 200);
}

export function toggleLayer(kind, visible) {
  if (!map || !layers[kind]) return;
  if (visible) layers[kind].addTo(map);
  else map.removeLayer(layers[kind]);
}

let routeLine = null;
export function drawRoute(points) {
  if (!map) return;
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(points.map(p => [p[0], -Math.abs(p[1])]), { color: '#2563eb', weight: 4, opacity: .8, dashArray: '6 8' }).addTo(map);
  map.fitBounds(routeLine.getBounds().pad(0.2));
}
