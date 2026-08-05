import { Check, FolderOpen, FolderPlus, LayoutTemplate, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { BoardDefinition } from "../../types";
import type { ProjectTemplate } from "../../projects/model";
import { projectFolderName } from "../../projects/api";
import { useI18n } from "../../i18n";
import type { RecentProject } from "../../projects/recent";
import { isBrowserProjectPath } from "../../projects/browser";

export function ProjectSwitcher({ currentPath, recentProjects, templates, onSelect, onTemplate }: {
  currentPath: string | null;
  recentProjects: RecentProject[];
  templates: ProjectTemplate[];
  onSelect: (path: string) => void;
  onTemplate: (templateId: string) => void;
}) {
  const { t } = useI18n();
  const available = templates.length ? templates : fallbackTemplates;
  return <div className="project-switcher" onClick={(event) => event.stopPropagation()}>
    <div className="project-switcher-heading">{t("project.recent")}</div>
    {recentProjects.length ? recentProjects.map((project) => <button key={project.rootPath} className={currentPath?.toLocaleLowerCase() === project.rootPath.toLocaleLowerCase() ? "current" : ""} onClick={() => onSelect(project.rootPath)}>
      <span>{currentPath?.toLocaleLowerCase() === project.rootPath.toLocaleLowerCase() ? <Check size={13} /> : <FolderOpen size={13} />}</span>
      <div><b>{project.name}</b><small>{projectLocation(project.rootPath, t("project.browserStorage"))}</small></div>
    </button>) : <p>{t("project.recent.empty")}</p>}
    <div className="project-switcher-heading project-switcher-template-heading">{t("project.templates")}</div>
    {available.map((template) => <button key={template.id} onClick={() => onTemplate(template.id)}>
      <span><LayoutTemplate size={13} /></span><div><b>{t(`template.${template.id}.name`)}</b><small>{t(`template.${template.id}.description`)}</small></div>
    </button>)}
  </div>;
}

export function ProjectMenu({ onNew, onOpen, onTemplates, onSaveAs, onSettings, hasProject, browserStorage = false }: {
  onNew: () => void;
  onOpen: () => void;
  onTemplates: () => void;
  onSaveAs: () => void;
  onSettings: () => void;
  hasProject: boolean;
  browserStorage?: boolean;
}) {
  const { t } = useI18n();
  return <div className="project-menu project-actions-menu" onClick={(event) => event.stopPropagation()}>
    <button onClick={onNew}><FolderPlus size={14} /><span><b>{t("project.new")}</b><small>{t("project.new.help")}</small></span></button>
    <button onClick={onOpen}><FolderOpen size={14} /><span><b>{t("project.open")}</b><small>{t(browserStorage ? "project.open.browserHelp" : "project.open.help")}</small></span></button>
    <button onClick={onTemplates}><LayoutTemplate size={14} /><span><b>{t("project.templates")}</b><small>{t("project.templates.help")}</small></span></button>
    <button disabled={!hasProject} onClick={onSaveAs}><Save size={14} /><span><b>{t("project.saveAs")}</b><small>{t(browserStorage ? "project.saveAs.browserHelp" : "project.saveAs.help")}</small></span></button>
    <button disabled={!hasProject} onClick={onSettings}><Settings2 size={14} /><span><b>{t("project.settings")}</b><small>{t("project.settings.help")}</small></span></button>
  </div>;
}

const fallbackTemplates: ProjectTemplate[] = [
  { id: "blank", name: "Blank project", description: "A minimal top-level VHDL entity ready for editing." },
  { id: "led-switch-mirror", name: "LED and switch mirror", description: "Introductory combinational logic mapping switches to red LEDs." },
  { id: "button-seven-segment", name: "Buttons and seven-segment", description: "Active-low buttons select digits and status LEDs." },
  { id: "four-digit-timer", name: "Four-digit timer", description: "Clocked timer with buttons, LEDs, and four seven-segment displays." }
];

export function NewProjectDialog({ templates, parentPath, initialTemplateId, browserStorage = false, onCancel, onBrowse, onCreate }: {
  templates: ProjectTemplate[];
  parentPath: string;
  initialTemplateId?: string;
  browserStorage?: boolean;
  onCancel: () => void;
  onBrowse: () => void;
  onCreate: (name: string, folderName: string, templateId: string, parentPath: string) => void;
}) {
  const { t } = useI18n();
  const available = templates.length ? templates : fallbackTemplates;
  const [name, setName] = useState("Meu projeto LogicBoard");
  const [folderName, setFolderName] = useState(projectFolderName(name));
  const [templateId, setTemplateId] = useState(available.some((template) => template.id === initialTemplateId) ? initialTemplateId! : available[0].id);
  const [folderEdited, setFolderEdited] = useState(false);

  useEffect(() => {
    if (!folderEdited) setFolderName(projectFolderName(name));
  }, [folderEdited, name]);

  const displayedParent = parentPath || t("project.location.defaultValue");
  return <Modal title={t("project.new.title")} onCancel={onCancel} footer={<div className="modal-actions"><span /><button className="secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" disabled={!name.trim() || (!browserStorage && (!folderName.trim() || !parentPath))} onClick={() => onCreate(name.trim(), folderName.trim(), templateId, parentPath)}>{t("project.create")}</button></div>}>
    <label className="project-field">{t("project.name")}<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
    {browserStorage ? <div className="project-storage-note"><Save size={15} /><span><b>{t("project.browserStorage")}</b><small>{t("project.browserStorage.help")}</small></span></div> : <>
      <label className="project-field">{t("project.folderName")}<input value={folderName} maxLength={64} onChange={(event) => { setFolderEdited(true); setFolderName(event.target.value); }} /></label>
      <label className="project-field">{t("project.location")}<div className="project-location"><input readOnly value={displayedParent} /><button type="button" className="secondary" onClick={onBrowse}>{t("project.browse")}</button></div></label>
      <p className="project-location-help">{t("project.location.defaultHelp", { path: displayedParent })}</p>
      <div className="project-destination"><small>{t("project.destination")}</small><b>{joinDisplayPath(displayedParent, folderName)}</b></div>
    </>}
    <div className="template-section-label">{t("project.templates")}</div>
    <div className="template-grid">
      {available.map((template) => <button key={template.id} className={templateId === template.id ? "active" : ""} onClick={() => setTemplateId(template.id)}>
        <b>{t(`template.${template.id}.name`)}</b><span>{t(`template.${template.id}.description`)}</span>
      </button>)}
    </div>
  </Modal>;
}

export function ProjectHub({ hasProject, projectName, projectPath, recentProjects, templates, onNew, onOpen, onTemplate, onRecent }: {
  hasProject: boolean;
  projectName: string;
  projectPath: string | null;
  recentProjects: RecentProject[];
  templates: ProjectTemplate[];
  onNew: () => void;
  onOpen: () => void;
  onTemplate: (templateId: string) => void;
  onRecent: (path: string) => void;
}) {
  const { t } = useI18n();
  return <div className="project-hub">
    {hasProject && <div className="project-hub-current"><small>{t("project.current")}</small><b>{projectName}</b><span>{projectPath ? projectLocation(projectPath, t("project.browserStorage")) : t("project.unsaved")}</span></div>}
    <div className="project-hub-actions"><button onClick={onNew}><FolderPlus size={15} />{t("project.new")}</button><button onClick={onOpen}><FolderOpen size={15} />{t("project.open")}</button></div>
    <h3>{t("project.recent")}</h3>
    {recentProjects.length ? recentProjects.map((recent) => <button className="project-hub-item" key={recent.rootPath} onClick={() => onRecent(recent.rootPath)}><FolderOpen size={14} /><span><b>{recent.name}</b><small>{projectLocation(recent.rootPath, t("project.browserStorage"))}</small></span></button>) : <p>{t("project.recent.empty")}</p>}
    <h3>{t("project.templates")}</h3>
    {templates.map((template) => <button className="project-hub-item" key={template.id} onClick={() => onTemplate(template.id)}><LayoutTemplate size={14} /><span><b>{t(`template.${template.id}.name`)}</b><small>{t(`template.${template.id}.description`)}</small></span></button>)}
  </div>;
}

export function ProjectWelcome({ templates, browserStorage = false, onNew, onOpen, onTemplate }: {
  templates: ProjectTemplate[];
  browserStorage?: boolean;
  onNew: () => void;
  onOpen: () => void;
  onTemplate: (templateId: string) => void;
}) {
  const { t } = useI18n();
  return <section className="project-welcome">
    <div className="welcome-mark"><LayoutTemplate size={30} /></div>
    <small>LOGICBOARD STUDIO</small><h1>{t("welcome.title")}</h1><p>{t(browserStorage ? "welcome.copy.browser" : "welcome.copy")}</p>
    <div className="welcome-actions"><button className="primary" onClick={onNew}><FolderPlus size={16} />{t("project.new")}</button><button onClick={onOpen}><FolderOpen size={16} />{t("project.open")}</button></div>
    <div className="welcome-templates">{templates.map((template) => <button key={template.id} onClick={() => onTemplate(template.id)}><LayoutTemplate size={15} /><span><b>{t(`template.${template.id}.name`)}</b><small>{t(`template.${template.id}.description`)}</small></span></button>)}</div>
  </section>;
}

function joinDisplayPath(parentPath: string, folderName: string) {
  if (!parentPath) return folderName;
  const separator = parentPath.includes("\\") ? "\\" : "/";
  return `${parentPath.replace(/[\\/]+$/, "")}${separator}${folderName}`;
}

function projectLocation(path: string, browserStorageLabel: string) {
  return isBrowserProjectPath(path) ? browserStorageLabel : path;
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

function Modal({ title, children, footer, onCancel }: { title: string; children: React.ReactNode; footer?: React.ReactNode; onCancel: () => void }) {
  const { t } = useI18n();
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section className="project-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>LOGICBOARD STUDIO</small><h2>{title}</h2></div><button aria-label={t("common.close")} onClick={onCancel}>×</button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>;
}
