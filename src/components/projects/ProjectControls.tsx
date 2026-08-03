import { Check, FolderOpen, FolderPlus, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { BoardDefinition } from "../../types";
import type { ProjectTemplate } from "../../projects/model";
import { projectFolderName } from "../../projects/api";
import { useI18n } from "../../i18n";
import type { RecentProject } from "../../projects/recent";

export function ProjectSwitcher({ currentPath, recentProjects, onSelect }: {
  currentPath: string | null;
  recentProjects: RecentProject[];
  onSelect: (path: string) => void;
}) {
  const { t } = useI18n();
  return <div className="project-switcher" onClick={(event) => event.stopPropagation()}>
    <div className="project-switcher-heading">{t("project.recent")}</div>
    {recentProjects.length ? recentProjects.map((project) => <button key={project.rootPath} className={currentPath?.toLocaleLowerCase() === project.rootPath.toLocaleLowerCase() ? "current" : ""} onClick={() => onSelect(project.rootPath)}>
      <span>{currentPath?.toLocaleLowerCase() === project.rootPath.toLocaleLowerCase() ? <Check size={13} /> : <FolderOpen size={13} />}</span>
      <div><b>{project.name}</b><small>{project.rootPath}</small></div>
    </button>) : <p>{t("project.recent.empty")}</p>}
  </div>;
}

export function ProjectMenu({ onNew, onOpen, onSaveAs, onSettings }: {
  onNew: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  onSettings: () => void;
}) {
  const { t } = useI18n();
  return <div className="project-menu project-actions-menu" onClick={(event) => event.stopPropagation()}>
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

export function NewProjectDialog({ templates, parentPath, onCancel, onBrowse, onCreate }: {
  templates: ProjectTemplate[];
  parentPath: string;
  onCancel: () => void;
  onBrowse: () => void;
  onCreate: (name: string, folderName: string, templateId: string, parentPath: string) => void;
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
    <label className="project-field">{t("project.location")}<div className="project-location"><input readOnly value={parentPath} /><button type="button" className="secondary" onClick={onBrowse}>{t("project.browse")}</button></div></label>
    <p className="project-location-help">{t("project.location.help")}</p>
    <div className="project-destination"><small>{t("project.destination")}</small><b>{joinDisplayPath(parentPath, folderName)}</b></div>
    <div className="template-grid">
      {available.map((template) => <button key={template.id} className={templateId === template.id ? "active" : ""} onClick={() => setTemplateId(template.id)}>
        <b>{t(`template.${template.id}.name`)}</b><span>{t(`template.${template.id}.description`)}</span>
      </button>)}
    </div>
    <div className="modal-actions"><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" disabled={!name.trim() || !folderName.trim() || !parentPath} onClick={() => onCreate(name.trim(), folderName.trim(), templateId, parentPath)}>{t("project.create")}</button></div>
  </Modal>;
}

function joinDisplayPath(parentPath: string, folderName: string) {
  if (!parentPath) return folderName;
  const separator = parentPath.includes("\\") ? "\\" : "/";
  return `${parentPath.replace(/[\\/]+$/, "")}${separator}${folderName}`;
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

export function UnsavedChangesDialog({ projectName, saveAs, onSave, onDiscard, onCancel }: {
  projectName: string;
  saveAs?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return <Modal title={t("project.unsaved.title")} onCancel={onCancel}>
    <p className="modal-copy">{t("project.unsaved.question", { name: projectName })}</p>
    <div className="modal-actions"><button className="danger" onClick={onDiscard}>{t("project.discard")}</button><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" onClick={onSave}>{saveAs ? t("project.saveAs") : t("common.save")}</button></div>
  </Modal>;
}

export function RemoveAssignmentDialog({ label, onConfirm, onCancel }: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return <Modal title={t("assignment.remove.title")} onCancel={onCancel}>
    <p className="modal-copy">{t("assignment.remove.question", { label })}</p>
    <div className="modal-actions"><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="danger" onClick={onConfirm}>{t("assignment.remove.confirm")}</button></div>
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
