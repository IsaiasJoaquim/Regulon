import { useEffect, useState } from "react";
import { databases, DATABASE_ID, CORPUS_COLLECTION, EVIDENCE_COLLECTION, account } from "./appwrite";
import { ID, Query } from "appwrite";
import { toast } from "sonner";

export type Obligation = {
  id: string;
  title: string;
  description: string;
  intermediary: "stockbroker" | "investment_adviser" | "both";
  category: string;
  frequency: string;
  severity: "low" | "medium" | "high" | "critical";
  evidence_examples: string[];
  source_excerpt: string;
};

export type Circular = {
  id: string;
  title: string;
  intermediary: "stockbroker" | "investment_adviser" | "both";
  ingestedAt: string;
  obligations: Obligation[];
};

export type EvidenceStatus = "pending" | "in_progress" | "compliant" | "gap";

export type EvidenceRecord = {
  status: EvidenceStatus;
  note?: string;
  fileUrl?: string;
  updatedAt?: string;
};

// In-memory cache to maintain synchronous-like interface for the rest of the app
let corpusCache: Circular[] = [];
let evidenceCache: Record<string, EvidenceRecord> = {};
let isInitialized = false;
let useLocalFallback = false;

// LocalStorage helpers for Fallback Mode
const CORPUS_KEY = "ac.corpus.v1";
const EVIDENCE_KEY = "ac.evidence.v1";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal<T>(key: string, val: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(val));
}

export async function fetchFromAppwrite() {
  try {
    const cRes = await databases.listDocuments(DATABASE_ID, CORPUS_COLLECTION, [Query.limit(100)]);
    corpusCache = cRes.documents.map(d => ({
      id: d.$id,
      title: d.title,
      intermediary: d.intermediary,
      ingestedAt: d.ingestedAt,
      obligations: JSON.parse(d.obligations)
    }));

    const eRes = await databases.listDocuments(DATABASE_ID, EVIDENCE_COLLECTION, [Query.limit(500)]);
    const ev: Record<string, EvidenceRecord> = {};
    for (const d of eRes.documents) {
      ev[d.$id] = {
        status: d.status as EvidenceStatus,
        note: d.note,
        fileUrl: d.fileUrl,
        updatedAt: d.updatedAt
      };
    }
    evidenceCache = ev;
    useLocalFallback = false;
  } catch (e) {
    console.warn("Appwrite not configured properly, falling back to LocalStorage.", e);
    useLocalFallback = true;
    corpusCache = readLocal<Circular[]>(CORPUS_KEY, []);
    evidenceCache = readLocal<Record<string, EvidenceRecord>>(EVIDENCE_KEY, {});
  } finally {
    isInitialized = true;
    window.dispatchEvent(new CustomEvent("ac-store-change"));
  }
}

export function getCorpus(): Circular[] {
  return corpusCache;
}

export async function addCircular(c: Circular) {
  corpusCache = [c, ...corpusCache.filter((x) => x.id !== c.id)];
  
  if (useLocalFallback) {
    writeLocal(CORPUS_KEY, corpusCache);
    window.dispatchEvent(new CustomEvent("ac-store-change"));
    return;
  }

  window.dispatchEvent(new CustomEvent("ac-store-change"));
  
  try {
    await databases.createDocument(DATABASE_ID, CORPUS_COLLECTION, c.id, {
      title: c.title,
      intermediary: c.intermediary,
      ingestedAt: c.ingestedAt,
      obligations: JSON.stringify(c.obligations)
    });
  } catch (e) {
    toast.error("Failed to sync circular to Appwrite");
    console.error(e);
  }
}

export async function removeCircular(id: string) {
  corpusCache = corpusCache.filter((c) => c.id !== id);
  Object.keys(evidenceCache).forEach((k) => {
    if (k.startsWith(id + "::")) delete evidenceCache[k];
  });
  
  if (useLocalFallback) {
    writeLocal(CORPUS_KEY, corpusCache);
    writeLocal(EVIDENCE_KEY, evidenceCache);
    window.dispatchEvent(new CustomEvent("ac-store-change"));
    return;
  }

  window.dispatchEvent(new CustomEvent("ac-store-change"));

  try {
    await databases.deleteDocument(DATABASE_ID, CORPUS_COLLECTION, id);
    const eRes = await databases.listDocuments(DATABASE_ID, EVIDENCE_COLLECTION, [Query.startsWith("$id", id + "::")]);
    for (const doc of eRes.documents) {
      await databases.deleteDocument(DATABASE_ID, EVIDENCE_COLLECTION, doc.$id);
    }
  } catch (e) {
    console.error(e);
  }
}

export function getEvidence(): Record<string, EvidenceRecord> {
  return evidenceCache;
}

export function evidenceKey(circularId: string, obligationId: string) {
  const key = `${circularId}::${obligationId}`;
  return key.length > 36 ? key.slice(0, 36) : key;
}

export async function updateEvidence(
  circularId: string,
  obligationId: string,
  patch: Partial<EvidenceRecord>,
) {
  const key = evidenceKey(circularId, obligationId);
  const existing: EvidenceRecord = evidenceCache[key] ?? { status: "pending" };
  const updated = {
    ...existing,
    ...patch,
    status: patch.status ?? existing.status,
    updatedAt: new Date().toISOString(),
  };
  
  evidenceCache[key] = updated;

  if (useLocalFallback) {
    writeLocal(EVIDENCE_KEY, evidenceCache);
    window.dispatchEvent(new CustomEvent("ac-store-change"));
    return;
  }

  window.dispatchEvent(new CustomEvent("ac-store-change"));

  try {
    try {
      await databases.getDocument(DATABASE_ID, EVIDENCE_COLLECTION, key);
      await databases.updateDocument(DATABASE_ID, EVIDENCE_COLLECTION, key, updated);
    } catch {
      await databases.createDocument(DATABASE_ID, EVIDENCE_COLLECTION, key, updated);
    }
  } catch (e) {
    toast.error("Failed to sync evidence to Appwrite");
    console.error(e);
  }
}

export function useStore() {
  const [tick, setTick] = useState(0);
  const [isLoading, setIsLoading] = useState(!isInitialized);

  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("ac-store-change", h);
    
    if (!isInitialized) {
      fetchFromAppwrite().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }

    return () => {
      window.removeEventListener("ac-store-change", h);
    };
  }, []);

  return {
    tick,
    corpus: getCorpus(),
    evidence: getEvidence(),
    isLoading
  };
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}
