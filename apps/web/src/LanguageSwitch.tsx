import { useLanguage, useTr, type UiLanguage } from "./i18n";
import "./language-switch.css";

const OPTIONS: ReadonlyArray<{
  value: UiLanguage;
  short: string;
  name: string;
}> = [
  { value: "vi", short: "VI", name: "Tiếng Việt" },
  { value: "en", short: "EN", name: "English" },
];

/**
 * Chooses the language of the interface chrome (page names, buttons, hints).
 * It never changes what people type, saved records or AI answers. Hidden when
 * no LanguageProvider is mounted.
 */
export function LanguageSwitch() {
  const tr = useTr();
  const { mode, setLanguage } = useLanguage();
  if (mode === "legacy") return null;
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={tr("Display language")}
      title={tr(
        "Changes the interface language only. Your input and AI answers keep their own language.",
      )}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          lang={option.value}
          aria-pressed={mode === option.value}
          aria-label={option.name}
          onClick={() => setLanguage(option.value)}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
