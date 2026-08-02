import { FolderOpen, FolderPlus, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { BoardDefinition } from "../../types";
import type { ProjectTemplate } from "../../projects/model";
import { projectFolderName } from "../../projects/api";
import { useI18n } from "../../i18n";

export function ProjectMenu({ onNew, onOpen, onSaveAs, onSettings }: {
  onNew: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  onSettings: () => void;
}) {
  const { t } = useI18n();
  return <div className="project-menu" onClick={(event) => event.stopPropagation()}>
    <button onClick={onNew}><FolderPlus size={14} /><span><b>{t("project.new")}</b><small>{t("project.new.help")}</small></span></button>
    <button onClick={onOpen}><FolderOpen size={14} /><span><b>{t("project.open")}</b><small>{t("project.open.help")}</small></span></button>
    <button onClick={onSaveAs}><Save size={14} /><span><b>{t("project.saveAs")}</b><small>{t("project.saveAs.help")}</small></span></button>
    <button onClick={onSettings}><Settings2 size={14} /><span><b>{t("project.settings")}</b><small>{t("project.settings.help")}</small></span></button>
  </div>;
}

const fallbackTemplates: ProjectTemplate[] = [
  { id: "blank", name: "Blank project", description: "A minimal top-level VHDL entity ready for editing." },
  { id: "led-switch-mirror", name: "LED and switch mirror", description: "Introductory combinational logic mapping switches to red LEDs." },
  { id: "button-seven-segment", name: "Buttons and seven-segment", description: "Active-low buttons select digits and status LEDs." },
  { id: "four-digit-timer", name: "Four-digit timer", description: "Clocked timer with buttons, LEDs, and four seven-segment displays." }
];

export function NewProjectDialog({ templates, onCancel, onOpen, onCreate }: {
  templates: ProjectTemplate[];
  onCancel: () => void;
  onOpen: () => void;
  onCreate: (name: string, folderName: string, templateId: string) => void;
}) {
  const { t } = useI18n();
  const available = templates.length ? templates : fallbackTemplates;
  const [name, setName] = useState("Meu projeto LogicBoard");
  const [folderName, setFolderName] = useState(projectFolderName(name));
  const [templateId, setTemplateId] = useState(available[0].id);
  const [folderEdited, setFolderEdited] = useState(false);

  useEffect(() => {
    if (!folderEdited) setFolderName(projectFolderName(name));
  }, [folderEdited, name]);

  return <Modal title={t("project.new.title")} onCancel={onCancel}>
    <label className="project-field">{t("project.name")}<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
    <label className="project-field">{t("project.folderName")}<input value={folderName} maxLength={64} onChange={(event) => { setFolderEdited(true); setFolderName(event.target.value); }} /></label>
    <div className="template-grid">
      {available.map((template) => <button key={template.id} className={templateId === template.id ? "active" : ""} onClick={() => setTemplateId(template.id)}>
        <b>{t(`template.${template.id}.name`)}</b><span>{t(`template.${template.id}.description`)}</span>
      </button>)}
    </div>
    <div className="modal-actions"><button className="secondary" onClick={onOpen}>{t("project.openExisting")}</button><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" disabled={!name.trim() || !folderName.trim()} onClick={() => onCreate(name.trim(), folderName.trim(), templateId)}>{t("project.chooseLocation")}</button></div>
  </Modal>;
}

export function ProjectSettingsDialog({ name, boardId, topEntity, boards, entityNames, onCancel, onSave }: {
  name: string;
  boardId: string;
  topEntity: string;
  boards: BoardDefinition[];
  entityNames: string[];
  onCancel: () => void;
  onSave: (settings: { name: string; boardId: string; topEntity: string }) => void;
}) {
  const { t } = useI18n();
  const [nextName, setNextName] = useState(name);
  const [nextBoardId, setNextBoardId] = useState(boardId);
  const [nextTopEntity, setNextTopEntity] = useState(topEntity);
  return <Modal title={t("project.settings")} onCancel={onCancel}>
    <label className="project-field">{t("project.name")}<input autoFocus value={nextName} maxLength={80} onChange={(event) => setNextName(event.target.value)} /></label>
    <label className="project-field">{t("project.targetBoard")}<select value={nextBoardId} onChange={(event) => setNextBoardId(event.target.value)}>{boards.map((board) => <option key={board.id} value={board.id}>{t(`board.name.${board.id}`)} — {board.device}</option>)}</select></label>
    <label className="project-field">{t("project.topEntity")}<select value={nextTopEntity} onChange={(event) => setNextTopEntity(event.target.value)}>{entityNames.map((entity) => <option key={entity} value={entity}>{entity}</option>)}</select></label>
    <div className="modal-actions"><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" disabled={!nextName.trim() || !nextTopEntity} onClick={() => onSave({ name: nextName.trim(), boardId: nextBoardId, topEntity: nextTopEntity })}>{t("settings.apply")}</button></div>
  </Modal>;
}

export function UnsavedChangesDialog({ projectName, onSave, onDiscard, onCancel }: {
  projectName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return <Modal title={t("project.unsaved.title")} onCancel={onCancel}>
    <p className="modal-copy">{t("project.unsaved.question", { name: projectName })}</p>
    <div className="modal-actions"><button className="danger" onClick={onDiscard}>{t("project.discard")}</button><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" onClick={onSave}>{t("common.save")}</button></div>
  </Modal>;
}

function Modal({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  const { t } = useI18n();
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section className="project-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>LOGICBOARD STUDIO</small><h2>{title}</h2></div><button aria-label={t("common.close")} onClick={onCancel}>×</button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}
