"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserArea } from "./civic";
import type { UserPersona } from "./types";

// ============================================================================
// usePersona — the user's own saved persona, persisted to localStorage.
//
// Privacy by design: the persona never leaves the browser except as a minimal
// feature vector POSTed to /api/impact when the user explicitly tests a policy.
// We hydrate after mount (no blocking script needed — there's nothing to paint
// before interaction) and expose a `hydrated` flag so the UI can avoid a flash
// of the empty state before storage is read.
// ============================================================================

const KEY = "pp-persona";

export interface StoredPersona {
  persona: UserPersona;
  area: UserArea | null;
}

function read(): StoredPersona | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPersona;
    if (parsed && typeof parsed === "object" && parsed.persona) return parsed;
  } catch {
    /* corrupted / disabled storage — treat as no persona */
  }
  return null;
}

export function usePersona() {
  const [stored, setStored] = useState<StoredPersona | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStored(read());
    setHydrated(true);
  }, []);

  const save = useCallback((persona: UserPersona, area: UserArea | null) => {
    const next: StoredPersona = { persona, area };
    setStored(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage disabled — still live for the session via React state */
    }
  }, []);

  const clear = useCallback(() => {
    setStored(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    persona: stored?.persona ?? null,
    area: stored?.area ?? null,
    hydrated,
    save,
    clear,
  };
}
