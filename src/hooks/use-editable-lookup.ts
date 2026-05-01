import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  EditableStore,
  type EditableLookupConfig,
  type EffectiveRow,
  type Overlay,
  type RowId,
} from '@/lib/editable-store';

// Module-level singletons keyed by storageKey, plus subscriber map for
// cross-component reactivity. Because two tables (or chart + table) might
// read the same lookup, we want changes in one place to re-render the other.
const stores = new Map<string, EditableStore<unknown>>();
const overlays = new Map<string, Overlay<unknown>>();
const listeners = new Map<string, Set<() => void>>();
const storeSignatures = new Map<string, unknown>();

function getStore<T>(cfg: EditableLookupConfig<T>): EditableStore<T> {
  let s = stores.get(cfg.storageKey) as EditableStore<T> | undefined;
  const signature = cfg.baseline;
  if (!s || storeSignatures.get(cfg.storageKey) !== signature) {
    s = new EditableStore<T>(cfg);
    stores.set(cfg.storageKey, s as EditableStore<unknown>);
    storeSignatures.set(cfg.storageKey, signature);
    overlays.set(cfg.storageKey, s.load() as Overlay<unknown>);
  }
  return s;
}

function getOverlay<T>(key: string): Overlay<T> {
  return (overlays.get(key) ?? { edits: {}, added: {}, deleted: [] }) as Overlay<T>;
}

function setOverlay<T>(key: string, next: Overlay<T>) {
  overlays.set(key, next as Overlay<unknown>);
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, fn: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

export interface EditableLookupApi<T> {
  rows: EffectiveRow<T>[];
  modifiedCount: number;
  addedCount: number;
  deletedCount: number;
  hasChanges: boolean;
  update: (id: RowId, patch: Partial<T>) => void;
  add: (row?: Partial<T>) => RowId;
  remove: (id: RowId) => void;
  resetRow: (id: RowId) => void;
  resetAll: () => void;
  lastUpdatedAt?: string;
}

export function useEditableLookup<T>(cfg: EditableLookupConfig<T>): EditableLookupApi<T> {
  const store = getStore(cfg);
  const key = cfg.storageKey;

  const overlay = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    useCallback(() => getOverlay<T>(key), [key]),
    useCallback(() => getOverlay<T>(key), [key]),
  );

  const rows = useMemo(() => store.effective(overlay), [store, overlay]);

  return {
    rows,
    modifiedCount: rows.filter((r) => r.source === 'edited').length,
    addedCount: rows.filter((r) => r.source === 'added').length,
    deletedCount: overlay.deleted.length,
    hasChanges:
      Object.keys(overlay.edits).length > 0 ||
      Object.keys(overlay.added).length > 0 ||
      overlay.deleted.length > 0,
    lastUpdatedAt: overlay.updatedAt,
    update: (id, patch) => setOverlay(key, store.updateRow(overlay, id, patch)),
    add: (row) => {
      const r = store.addRow(overlay, row);
      setOverlay(key, r.overlay);
      return r.id;
    },
    remove: (id) => setOverlay(key, store.removeRow(overlay, id)),
    resetRow: (id) => setOverlay(key, store.resetRow(overlay, id)),
    resetAll: () => setOverlay(key, store.resetAll(overlay)),
  };
}
