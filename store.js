/* =========================================================================
   store.js — Camada de estado + persistência (LocalStorage)
   Mantém o estado único (single source of truth), persiste em LocalStorage,
   notifica assinantes (observer) para re-render e faz import/export JSON.
   ========================================================================= */

const STORAGE_KEY = 'otp_state_v1';

const defaultState = () => ({
  trip: { start: '', end: '' },
  days: [],                       // [{ id, date, parkId, items:[{id,name,coords}] }]
  settings: { proxy: '', autoRefresh: false }
});

class Store {
  constructor() {
    this.state = this._load();
    this._subs = new Set();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return { ...defaultState(), ...JSON.parse(raw) };
    } catch (e) {
      console.warn('Falha ao ler estado, usando padrão.', e);
      return defaultState();
    }
  }
  _save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  _notify() { this._subs.forEach(fn => fn(this.state)); }
  commit() { this._save(); this._notify(); }

  setTripDates(start, end) { this.state.trip = { start, end }; this.commit(); }

  generateDays(start, end) {
    if (!start || !end) return;
    const days = [];
    const d = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');
    while (d <= last) {
      const iso = d.toISOString().slice(0, 10);
      const existing = this.state.days.find(x => x.date === iso);
      days.push(existing || { id: crypto.randomUUID(), date: iso, parkId: '', items: [] });
      d.setDate(d.getDate() + 1);
    }
    this.state.days = days;
    this.commit();
  }

  addDay() {
    const base = this.state.days.length
      ? new Date(this.state.days[this.state.days.length - 1].date + 'T00:00:00')
      : new Date();
    base.setDate(base.getDate() + (this.state.days.length ? 1 : 0));
    this.state.days.push({ id: crypto.randomUUID(), date: base.toISOString().slice(0, 10), parkId: '', items: [] });
    this.commit();
  }

  removeDay(dayId) { this.state.days = this.state.days.filter(d => d.id !== dayId); this.commit(); }

  setDayPark(dayId, parkId) {
    const day = this.state.days.find(d => d.id === dayId);
    if (day) { day.parkId = parkId; day.items = []; this.commit(); }
  }

  addAttraction(dayId, attraction) {
    const day = this.state.days.find(d => d.id === dayId);
    if (!day) return;
    if (day.items.some(i => i.id === attraction.id)) return;
    day.items.push({ ...attraction });
    this.commit();
  }

  removeAttraction(dayId, attractionId) {
    const day = this.state.days.find(d => d.id === dayId);
    if (day) { day.items = day.items.filter(i => i.id !== attractionId); this.commit(); }
  }

  reorderAttractions(dayId, orderedIds) {
    const day = this.state.days.find(d => d.id === dayId);
    if (!day) return;
    day.items = orderedIds.map(id => day.items.find(i => i.id === id)).filter(Boolean);
    this.commit();
  }

  setSettings(patch) { this.state.settings = { ...this.state.settings, ...patch }; this.commit(); }
  reset() { this.state = defaultState(); this.commit(); }

  exportJSON() { return JSON.stringify(this.state, null, 2); }
  importJSON(text) {
    const parsed = JSON.parse(text);
    this.state = { ...defaultState(), ...parsed };
    this.commit();
  }
}

export const store = new Store();
