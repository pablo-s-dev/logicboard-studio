import { useState } from "react";
import { useI18n } from "../../i18n";
import type { Language } from "../../i18n";

export function ApplicationSettingsDialog({ onCancel }: { onCancel: () => void }) {
  const { language, setLanguage, t } = useI18n();
  const [nextLanguage, setNextLanguage] = useState<Language>(language);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section className="project-modal settings-modal" role="dialog" aria-modal="true" aria-label={t("settings.title")} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>LOGICBOARD STUDIO</small><h2>{t("settings.title")}</h2></div><button aria-label={t("common.close")} onClick={onCancel}>×</button></header>
      <div className="modal-body">
        <label className="project-field">{t("settings.language")}
          <select value={nextLanguage} onChange={(event) => setNextLanguage(event.target.value as Language)}>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en-US">English (United States)</option>
          </select>
          <small className="field-help">{t("settings.language.help")}</small>
        </label>
        <div className="modal-actions"><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" onClick={() => { setLanguage(nextLanguage); onCancel(); }}>{t("settings.apply")}</button></div>
      </div>
    </section>
  </div>;
}
