import { ExternalLink } from "lucide-react";
import { useI18n } from "../../i18n";

export function CreditsPanel() {
  const { t } = useI18n();
  return <div className="credits-panel sidebar-credits">
    <div className="credits-mark">LB</div>
    <small>{t("credits.createdBy")}</small>
    <strong>Pablo Santana de Oliveira</strong>
    <a href="https://pablosan.netlify.app" target="_blank" rel="noreferrer">pablosan.netlify.app <ExternalLink size={13} /></a>
  </div>;
}
