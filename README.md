# 🎢 Orlando Trip Planner

Organizador inteligente de viagens para os parques da **Disney World** e **Universal Orlando**, com filas em tempo real, otimização de roteiro, mapa interativo, previsão do tempo e guia de personagens/onde comer. 100% **HTML + CSS + JavaScript puro**, **PWA instalável** e pronto para o **GitHub Pages**.

> Powered by [Queue-Times.com](https://queue-times.com/) e [Open-Meteo.com](https://open-meteo.com/).

---

## 1. Arquitetura

Aplicação **estática, client-side e modular** (ES Modules), com estado centralizado e padrão *observer* para renderização reativa.

```
index.html (UI + abas + CDNs: Tailwind, Leaflet, SortableJS)
   └─ app.js  (orquestrador: render, eventos, abas, countdown, PWA)
        ├─ store.js     (estado + LocalStorage + import/export JSON)
        ├─ api.js       (Queue-Times, cache 5min, proxy CORS)
        ├─ weather.js   (Open-Meteo, 7 dias + alertas)
        ├─ maps.js      (Leaflet + deep links Google Maps)
        └─ optimizer.js (heurística fila + distância + horário + clima)
   └─ sw.js + manifest.webmanifest (PWA: offline + instalável)
```

---

## 2. Estrutura de pastas

```
orlando-planner/
├── index.html
├── manifest.webmanifest    # Metadados PWA
├── sw.js                   # Service Worker (offline + instalável)
├── README.md
├── css/style.css
├── js/{app,store,api,weather,maps,optimizer}.js
├── data/parks.json         # Atrações + restaurantes + personagens
└── assets/icon.svg
```

---

## 3. Funcionalidades

| Aba | Funcionalidades |
|-----|-----------------|
| 📊 **Dashboard** | Countdown, resumo do clima, nº de parques, próximas atrações |
| 🗓️ **Planejador** | Datas, gerar/adicionar dias, associar parque, adicionar atrações, **drag-and-drop** |
| ⏱️ **Filas** | Filas em tempo real (🟢🟡🔴), ordenação pela menor fila, auto-refresh |
| 🧭 **Otimizador** | Percurso sugerido (fila + distância + horário + clima) |
| 🎭 **Guia** | Lista navegável por parque: 🤳 personagens para foto e 🍽️ onde comer |
| 🗺️ **Mapa** | Leaflet, camadas (parques/onde comer/compras/personagens), rota, Google Maps |
| 🌤️ **Clima** | Temperatura, sensação, umidade, chuva, previsão 7 dias, alertas |
| ⚙️ **Ajustes** | Proxy CORS, auto-refresh, reset, export/import JSON |

---

## 4. Modelo de dados

Estado (LocalStorage `otp_state_v1`): `{ trip:{start,end}, days:[{id,date,parkId,items[]}], settings:{proxy,autoRefresh} }`.

`data/parks.json`: `parks[]` (com `attractions[]`), `restaurants[]` (com `parkId`), `characterSpots[]` (com `characters`, `location`, `parkId`), `shopping[]`. **Sem hotéis.**

---

## 5–7. Integrações

- **Queue-Times** — `GET /parks/{id}/queue_times.json`; resolução de ID por nome; cache 5 min; proxy CORS configurável; semáforo ≤20🟢/≤45🟡/>45🔴.
- **Google Maps** — Leaflet/OSM (mapa sem chave) + deep links `maps/dir/?api=1&destination=...` (navegação sem API key).
- **Open-Meteo** — `GET /v1/forecast` (sem chave, CORS OK); clima atual + 7 dias; alertas derivados.

---

## 8. Deploy no GitHub Pages

1. Suba a pasta para um repositório.
2. **Settings → Pages → Deploy from a branch → `main` → `/ (root)`**.
3. Acesse `https://SEU_USUARIO.github.io/orlando-planner/`.

> ⚠️ Não abra por `file://` (usa `fetch` + ES Modules + Service Worker). Teste local: `python -m http.server 8000`.

---

## 9. PWA (ATIVADO ✅)

O app já é um **PWA instalável e offline-capable**:
- **`registerPWA()`** em `app.js` registra o `sw.js` no `load`.
- **Botão "📲 Instalar"** aparece no cabeçalho quando o navegador dispara `beforeinstallprompt`.
- **`sw.js`**: *cache-first* para o app shell (abre offline) e *network-first* para filas/clima (dados frescos).
- Detecção de **nova versão** avisa o usuário para recarregar.

> Requer **HTTPS** — o GitHub Pages já fornece. Em `file://` o Service Worker não é registrado.

**Roadmap futuro:** notificações push (fila abaixo de X min), background sync, previsão de multidão com dados históricos, compartilhamento de roteiro por URL, i18n PT/EN e °C/°F.

---

## 10. Comentários no código

Cada arquivo tem cabeçalho e comentários explicando papel, regras de negócio, tratamento de CORS/erros, heurística do otimizador e decisões de arquitetura.

### Créditos
Queue-Times.com · Open-Meteo.com (CC BY 4.0) · Leaflet + OpenStreetMap · SortableJS · Tailwind CSS.
