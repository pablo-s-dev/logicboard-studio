import { FolderOpen, FolderPlus, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { BoardDefinition } from "../../types";
import type { ProjectTemplate } from "../../projects/model";
import { projectFolderName } from "../../projects/api";

export function ProjectMenu({ onNew, onOpen, onSaveAs, onSettings }: {
  onNew: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  onSettings: () => void;
}) {
  return <div className="project-menu" onClick={(event) => event.stopPropagation()}>
    <button onClick={onNew}><FolderPlus size={14} /><span><b>New Project</b><small>Blank or from a template</small></span></button>
    <button onClick={onOpen}><FolderOpen size={14} /><span><b>Open Project</b><small>Select a project folder</small></span></button>
    <button onClick={onSaveAs}><Save size={14} /><span><b>Save As</b><small>Create an independent project folder</small></span></button>
    <button onClick={onSettings}><Settings2 size={14} /><span><b>Project Settings</b><small>Name, board, and top entity</small></span></button>
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
  const available = templates.length ? templates : fallbackTemplates;
  const [name, setName] = useState("My LogicBoard Project");
  const [folderName, setFolderName] = useState(projectFolderName(name));
  const [templateId, setTemplateId] = useState(available[0].id);
  const [folderEdited, setFolderEdited] = useState(false);

  useEffect(() => {
    if (!folderEdited) setFolderName(projectFolderName(name));
  }, [folderEdited, name]);

  return <Modal title="New LogicBoard Project" onCancel={onCancel}>
    <label className="project-field">Project name<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
    <label className="project-field">Folder name<input value={folderName} maxLength={64} onChange={(event) => { setFolderEdited(true); setFolderName(event.target.value); }} /></label>
    <div className="template-grid">
      {available.map((template) => <button key={template.id} className={templateId === template.id ? "active" : ""} onClick={() => setTemplateId(template.id)}>
        <b>{template.name}</b><span>{template.description}</span>
      </button>)}
    </div>
    <div className="modal-actions"><button className="secondary" onClick={onOpen}>Open existing</button><span /><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" disabled={!name.trim() || !folderName.trim()} onClick={() => onCreate(name.trim(), folderName.trim(), templateId)}>Choose location…</button></div>
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
  const [nextName, setNextName] = useState(name);
  const [nextBoardId, setNextBoardId] = useState(boardId);
  const [nextTopEntity, setNextTopEntity] = useState(topEntity);
  return <Modal title="Project Settings" onCancel={onCancel}>
    <label className="project-field">Project name<input autoFocus value={nextName} maxLength={80} onChange={(event) => setNextName(event.target.value)} /></label>
    <label className="project-field">Target board<select value={nextBoardId} onChange={(event) => setNextBoardId(event.target.value)}>{boards.map((board) => <option key={board.id} value={board.id}>{board.name} — {board.device}</option>)}</select></label>
    <label className="project-field">Top entity<select value={nextTopEntity} onChange={(event) => setNextTopEntity(event.target.value)}>{entityNames.map((entity) => <option key={entity} value={entity}>{entity}</option>)}</select></label>
    <div className="modal-actions"><span /><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" disabled={!nextName.trim() || !nextTopEntity} onClick={() => onSave({ name: nextName.trim(), boardId: nextBoardId, topEntity: nextTopEntity })}>Apply</button></div>
  </Modal>;
}

export function UnsavedChangesDialog({ projectName, onSave, onDiscard, onCancel }: {
  projectName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return <Modal title="Unsaved changes" onCancel={onCancel}>
    <p className="modal-copy">Save changes to <b>{projectName}</b> before continuing?</p>
    <div className="modal-actions"><button className="danger" onClick={onDiscard}>Discard</button><span /><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={onSave}>Save</button></div>
  </Modal>;
}

function Modal({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section className="project-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>LOGICBOARD STUDIO</small><h2>{title}</h2></div><button aria-label="Close dialog" onClick={onCancel}>×</button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}
