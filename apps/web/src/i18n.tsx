import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dictionaryA, type DictionaryEntry } from "./i18n-dictionary-a";
import { dictionaryB } from "./i18n-dictionary-b";
import { dictionaryC } from "./i18n-dictionary-c";
import { dictionaryD } from "./i18n-dictionary-d";
import { dictionaryE } from "./i18n-dictionary-e";
import { dictionaryF } from "./i18n-dictionary-f";
import { dictionaryG } from "./i18n-dictionary-g";

/**
 * Display language of the interface chrome only: page names, buttons, labels,
 * hints and system messages. It never touches what a person types, saved
 * records, document names, or anything an AI answers (those keep their own
 * language, and an AI answers in English only when asked to).
 *
 * `legacy` (no provider mounted, as in unit tests) shows every string exactly
 * as written in the component.
 */
export type UiLanguage = "vi" | "en";
type Mode = UiLanguage | "legacy";
export type TranslateParams = Record<
  string,
  string | number | null | undefined
>;
export type Translate = (text: string, params?: TranslateParams) => string;

export const LANGUAGE_STORAGE_KEY = "examate-ui-language";
export const DEFAULT_LANGUAGE: UiLanguage = "vi";

const index = new Map<string, { en: string; vi: string }>();
export const dictionaryEntries: readonly DictionaryEntry[] = [
  ...dictionaryA,
  ...dictionaryB,
  ...dictionaryC,
  ...dictionaryD,
  ...dictionaryE,
  ...dictionaryF,
  ...dictionaryG,
];
for (const [en, vi, ...aliases] of dictionaryEntries) {
  const entry = { en, vi };
  // The first entry for a spelling wins, so the preferred wording is listed first.
  for (const key of [en, vi, ...aliases])
    if (!index.has(key)) index.set(key, entry);
}

function fill(text: string, params?: TranslateParams) {
  return params
    ? text.replace(/\{(\w+)\}/g, (whole, key: string) =>
        key in params ? String(params[key] ?? "") : whole,
      )
    : text;
}

// API errors carry " (Request ID: …)" after the sentence; the sentence is what
// the dictionary knows, the identifier is kept as it is.
const REQUEST_ID_SUFFIX = /^([\s\S]*?)( \(Request ID: [^)]*\))$/;

export function translate(
  text: string,
  mode: Mode,
  params?: TranslateParams,
): string {
  if (mode === "legacy") return fill(text, params);
  const entry = index.get(text);
  if (entry) return fill(entry[mode], params);
  const suffixed = REQUEST_ID_SUFFIX.exec(text);
  const base = suffixed ? index.get(suffixed[1]) : undefined;
  return fill(base ? base[mode] + suffixed![2] : text, params);
}

/** True when the dictionary knows this exact wording. */
export function hasTranslation(text: string) {
  return index.has(text);
}

let activeMode: Mode = "legacy";

/**
 * Translate outside a component (hooks, helpers) using the language that is
 * active right now. Components should prefer `useTr`, which also re-renders
 * them when the language changes.
 */
export const tl: Translate = (text, params) =>
  translate(text, activeMode, params);

/**
 * A fixed table of interface labels (module level, so it cannot call a hook).
 * Each read translates into the language active at that moment.
 */
export function lazyLabels<K extends string>(
  labels: Record<K, string>,
): Record<K, string> {
  const result = {} as Record<K, string>;
  for (const key of Object.keys(labels) as K[])
    Object.defineProperty(result, key, {
      enumerable: true,
      get: () => tl(labels[key]),
    });
  return result;
}

interface LanguageValue {
  mode: Mode;
  setLanguage: (language: UiLanguage) => void;
}
const LanguageContext = createContext<LanguageValue>({
  mode: "legacy",
  setLanguage: () => {},
});

function storedLanguage(): UiLanguage {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (value === "vi" || value === "en") return value;
  } catch {
    /* storage unavailable: use the default */
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: UiLanguage;
}) {
  const [language, setLanguageState] = useState<UiLanguage>(
    () => initial ?? storedLanguage(),
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const setLanguage = useCallback((next: UiLanguage) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this visit */
    }
  }, []);
  activeMode = language;
  const value = useMemo(
    () => ({ mode: language, setLanguage }),
    [language, setLanguage],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** The translate function for the current display language. */
export function useTr(): Translate {
  const { mode } = useContext(LanguageContext);
  return useCallback(
    (text: string, params?: TranslateParams) => translate(text, mode, params),
    [mode],
  );
}
