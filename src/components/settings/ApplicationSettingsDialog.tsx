import { ExternalLink, FolderOpen, Info, Settings2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { Language } from "../../i18n";

type SettingsTab = "general" | "credits";

export function ApplicationSettingsDialog({ projectParent, onBrowse, onApplyProjectParent, onCancel }: {
  projectParent: string;
  onBrowse: (currentPath: string) => Promise<string | null>;
  onApplyProjectParent: (path: string) => void;
  onCancel: () => void;
}) {
  const { language, setLanguage, t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [nextLanguage, setNextLanguage] = useState<Language>(language);
  const [nextProjectParent, setNextProjectParent] = useState(projectParent);
  const [browsing, setBrowsing] = useState(false);
  const displayedParent = nextProjectParent || t("project.location.defaultValue");

  const browse = async () => {
    setBrowsing(true);
    try {
      const selected = await onBrowse(nextProjectParent);
      if (selected) setNextProjectParent(selected);
    } finally {
      setBrowsing(false);
    }
  };

  const apply = () => {
    setLanguage(nextLanguage);
    if (nextProjectParent) onApplyProjectParent(nextProjectParent);
    onCancel();
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section className="project-modal settings-modal" role="dialog" aria-modal="true" aria-label={t("settings.title")} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>LOGICBOARD STUDIO</small><h2>{t("settings.title")}</h2></div><button aria-label={t("common.close")} onClick={onCancel}>×</button></header>
      <nav className="settings-tabs">
        <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}><Settings2 size={14} />{t("settings.general")}</button>
        <button className={tab === "credits" ? "active" : ""} onClick={() => setTab("credits")}><Info size={14} />{t("settings.credits")}</button>
      </nav>
      <div className="modal-body settings-body">
        {tab === "general" ? <>
          <label className="project-field">{t("settings.language")}
            <select value={nextLanguage} onChange={(event) => setNextLanguage(event.target.value as Language)}>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en-US">English (United States)</option>
            </select>
            <small className="field-help">{t("settings.language.help")}</small>
          </label>
          <label className="project-field">{t("settings.projectDirectory")}
            <div className="project-location"><input readOnly value={displayedParent} /><button type="button" className="secondary" disabled={browsing} onClick={() => void browse()}><FolderOpen size={14} />{t("project.browse")}</button></div>
            <small className="field-help">{t("settings.projectDirectory.help")}</small>
          </label>
        </> : <div className="credits-panel">
          <div className="credits-mark">LB</div>
          <small>{t("settings.credits.createdBy")}</small>
          <strong>Pablo Santana de Oliveira</strong>
          <a href="https://pablosdev.portfolio.app" target="_blank" rel="noreferrer">pablosdev.portfolio.app <ExternalLink size={13} /></a>
        </div>}
      </div>
      <footer className="modal-footer"><div className="modal-actions"><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button>{tab === "general" && <button className="primary" onClick={apply}>{t("settings.apply")}</button>}</div></footer>
    </section>
  </div>;
}
