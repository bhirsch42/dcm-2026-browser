import { create } from 'zustand';
import type { Filters, PerformersIndex, Show } from './types';

const STORAGE_KEY = 'dcm26-saved-v2';

function loadSaved(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function persistSaved(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage may be unavailable (private browsing); ignore.
  }
}

interface AppState {
  shows: Show[];
  performers: PerformersIndex | null;
  saved: Set<string>;
  filters: Filters;
  loaded: boolean;

  // Exactly one hover card may be visible at a time.
  activeCardId: string | null;
  openCard: (id: string) => void;
  closeCardIfActive: (id: string) => void;
  closeCard: () => void;

  setShows: (shows: Show[]) => void;
  setPerformers: (p: PerformersIndex | null) => void;
  setLoaded: (v: boolean) => void;

  toggleSaved: (id: string) => void;
  saveMany: (ids: string[]) => void;
  setSaved: (ids: string[]) => void;
  clearSaved: () => void;

  setSearch: (q: string) => void;
  toggleFilter: (kind: 'days' | 'venues' | 'categories' | 'performers', value: string) => void;
  clearPerformers: () => void;
  setFiltersFromQuery: (q: {
    search?: string;
    venues?: string[];
    categories?: string[];
    performers?: string[];
  }) => void;
  resetFilters: () => void;
}

const emptyFilters = (): Filters => ({
  search: '',
  days: new Set(),
  venues: new Set(),
  categories: new Set(),
  performers: new Set(),
});

export const useStore = create<AppState>((set) => ({
  shows: [],
  performers: null,
  saved: loadSaved(),
  filters: emptyFilters(),
  loaded: false,

  activeCardId: null,
  openCard: (id) => set({ activeCardId: id }),
  closeCardIfActive: (id) =>
    set((s) => (s.activeCardId === id ? { activeCardId: null } : s)),
  closeCard: () => set({ activeCardId: null }),

  setShows: (shows) => set({ shows }),
  setPerformers: (p) => set({ performers: p }),
  setLoaded: (v) => set({ loaded: v }),

  toggleSaved: (id) =>
    set((s) => {
      const next = new Set(s.saved);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistSaved(next);
      return { saved: next };
    }),
  saveMany: (ids) =>
    set((s) => {
      const next = new Set(s.saved);
      for (const id of ids) next.add(String(id));
      persistSaved(next);
      return { saved: next };
    }),
  setSaved: (ids) =>
    set(() => {
      const next = new Set(ids.map(String));
      persistSaved(next);
      return { saved: next };
    }),
  clearSaved: () =>
    set(() => {
      persistSaved(new Set());
      return { saved: new Set() };
    }),

  setSearch: (q) => set((s) => ({ filters: { ...s.filters, search: q } })),
  toggleFilter: (kind, value) =>
    set((s) => {
      const next = new Set(s.filters[kind]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { filters: { ...s.filters, [kind]: next } };
    }),
  clearPerformers: () =>
    set((s) => ({ filters: { ...s.filters, performers: new Set() } })),
  setFiltersFromQuery: (q) =>
    set((s) => ({
      filters: {
        ...s.filters,
        ...(q.search !== undefined ? { search: q.search } : {}),
        ...(q.venues ? { venues: new Set(q.venues) } : {}),
        ...(q.categories ? { categories: new Set(q.categories) } : {}),
        ...(q.performers ? { performers: new Set(q.performers) } : {}),
      },
    })),
  resetFilters: () => set({ filters: emptyFilters() }),
}));
