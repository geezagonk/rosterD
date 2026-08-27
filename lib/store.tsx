"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppData, DEFAULT_SETTINGS, ReminderStatus } from "./types";
import { seedData } from "./seed";
import { toISO, today } from "./calc";

const STORAGE_KEY = "rostered.v1";
const DATA_VERSION = 2;

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    vendors: [],
    projects: [],
    rateCard: [],
    contractors: [],
    approvals: [],
    variations: [],
    invoices: [],
    comms: [],
    reminders: [],
    derivedState: {},
  };
}

function migrate(raw: unknown): AppData | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<AppData>;
  if (!Array.isArray(candidate.contractors)) return null;
  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(candidate.settings ?? {}) },
    vendors: candidate.vendors ?? [],
    projects: candidate.projects ?? [],
    rateCard: candidate.rateCard ?? [],
    approvals: candidate.approvals ?? [],
    variations: candidate.variations ?? [],
    invoices: candidate.invoices ?? [],
    contractors: candidate.contractors ?? [],
    comms: candidate.comms ?? [],
    reminders: candidate.reminders ?? [],
    derivedState: candidate.derivedState ?? {},
  };
}

interface StoreValue {
  data: AppData;
  ready: boolean;
  update: (fn: (draft: AppData) => AppData) => void;
  replace: (next: AppData) => void;
  resetToSeed: () => void;
  resetToEmpty: () => void;
  setDerivedState: (key: string, status: ReminderStatus) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = migrate(JSON.parse(raw));
        setData(parsed ?? seedData());
      } else {
        setData(seedData());
      }
    } catch {
      setData(seedData());
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked. The session still works, it just will not persist.
    }
  }, [data, ready]);

  const update = useCallback((fn: (draft: AppData) => AppData) => {
    setData((prev) => fn(structuredClone(prev)));
  }, []);

  const replace = useCallback((next: AppData) => {
    const migrated = migrate(next);
    if (migrated) setData(migrated);
  }, []);

  const resetToSeed = useCallback(() => setData(seedData()), []);
  const resetToEmpty = useCallback(() => setData(emptyData()), []);

  const setDerivedState = useCallback(
    (key: string, status: ReminderStatus) => {
      setData((prev) => {
        const next = structuredClone(prev);
        if (status === "open") delete next.derivedState[key];
        else next.derivedState[key] = { status, actionedOn: toISO(today()) };
        return next;
      });
    },
    []
  );

  const value = useMemo<StoreValue>(
    () => ({ data, ready, update, replace, resetToSeed, resetToEmpty, setDerivedState }),
    [data, ready, update, replace, resetToSeed, resetToEmpty, setDerivedState]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}
