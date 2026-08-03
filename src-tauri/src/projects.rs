use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MANIFEST_NAME: &str = "logicboard.project.json";
const SUPPORTED_BOARD_ID: &str = "ep2c20f484c7";
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SOURCES: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectAssignment {
    pub id: String,
    pub kind: String,
    pub endpoint_id: String,
    pub port_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub name: String,
    pub board_id: String,
    pub top_entity: String,
    pub sources: Vec<String>,
    pub assignments: Vec<ProjectAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectSource {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspaceDefaults {
    pub parent_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectSaveRequest {
    pub manifest: ProjectManifest,
    pub sources: Vec<ProjectSource>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedProject {
    pub root_path: String,
    pub manifest: ProjectManifest,
    pub sources: Vec<ProjectSource>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTemplate {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

const PROJECT_TEMPLATES: [ProjectTemplate; 4] = [
    ProjectTemplate { id: "blank", name: "Blank project", description: "A minimal top-level VHDL entity ready for editing." },
    ProjectTemplate { id: "led-switch-mirror", name: "LED and switch mirror", description: "Introductory combinational logic mapping switches to red LEDs." },
    ProjectTemplate { id: "button-seven-segment", name: "Buttons and seven-segment", description: "Active-low buttons select digits and status LEDs." },
    ProjectTemplate { id: "four-digit-timer", name: "Four-digit timer", description: "Clocked timer with buttons, LEDs, and four seven-segment displays." },
];

fn timestamp() -> Result<u128, String> {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_nanos()).map_err(|error| error.to_string())
}

fn path_for_frontend(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(network_path) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{network_path}");
    }
    value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
}

fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(first) if first == '_' || first.is_ascii_alphabetic())
        && chars.all(|character| character == '_' || character.is_ascii_alphanumeric())
}

fn validate_folder_name(value: &str) -> Result<(), String> {
    let path = Path::new(value);
    if value.trim().is_empty()
        || value.ends_with([' ', '.'])
        || value.chars().any(|character| r#"<>:"/\|?*"#.contains(character))
        || path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err("Project folder name must be a single valid directory name.".into());
    }
    Ok(())
}

fn source_relative_path(value: &str) -> Result<PathBuf, String> {
    if value.contains('\\') || value.chars().any(|character| r#"<>:\"|?*"#.contains(character)) {
        return Err(format!("Project source paths must use forward slashes: {value}"));
    }
    let path = Path::new(value);
    let components: Vec<_> = path.components().collect();
    if components.len() < 2
        || !matches!(components.first(), Some(Component::Normal(first)) if *first == "src")
        || components.iter().any(|component| !matches!(component, Component::Normal(_)))
        || !matches!(path.extension().and_then(|value| value.to_str()), Some(extension) if extension.eq_ignore_ascii_case("vhd") || extension.eq_ignore_ascii_case("vhdl"))
    {
        return Err(format!("Invalid project source path: {value}"));
    }
    Ok(path.to_path_buf())
}

fn validate_manifest(manifest: &ProjectManifest) -> Result<Vec<PathBuf>, String> {
    if manifest.schema_version != 1 {
        return Err(format!("Unsupported project schema version: {}", manifest.schema_version));
    }
    if manifest.name.trim().is_empty() || manifest.name.chars().count() > 80 {
        return Err("Project name must contain between 1 and 80 characters.".into());
    }
    if manifest.board_id != SUPPORTED_BOARD_ID {
        return Err(format!("Unknown target board: {}", manifest.board_id));
    }
    if !is_identifier(&manifest.top_entity) {
        return Err(format!("Invalid top entity: {}", manifest.top_entity));
    }
    if manifest.sources.is_empty() || manifest.sources.len() > MAX_SOURCES {
        return Err(format!("Projects must contain between 1 and {MAX_SOURCES} VHDL sources."));
    }

    let mut source_keys = HashSet::new();
    let mut source_paths = Vec::with_capacity(manifest.sources.len());
    for source in &manifest.sources {
        let path = source_relative_path(source)?;
        if !source_keys.insert(source.to_lowercase()) {
            return Err(format!("Duplicate project source path: {source}"));
        }
        source_paths.push(path);
    }

    let mut assignment_ids = HashSet::new();
    for assignment in &manifest.assignments {
        if assignment.id.trim().is_empty() || assignment.endpoint_id.trim().is_empty() || assignment.port_id.trim().is_empty() {
            return Err("Project assignments must have non-empty id, endpointId, and portId values.".into());
        }
        if assignment.kind != "granular" && assignment.kind != "vector" {
            return Err(format!("Invalid assignment kind: {}", assignment.kind));
        }
        if !assignment_ids.insert(assignment.id.to_lowercase()) {
            return Err(format!("Duplicate project assignment id: {}", assignment.id));
        }
    }
    Ok(source_paths)
}

fn read_utf8_limited(path: &Path, limit: u64, label: &str) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("Could not read {label} metadata: {error}"))?;
    if !metadata.is_file() {
        return Err(format!("Expected {label} to be a file: {}", path.display()));
    }
    if metadata.len() > limit {
        return Err(format!("{label} exceeds the {limit} byte limit: {}", path.display()));
    }
    fs::read_to_string(path).map_err(|error| format!("Could not read UTF-8 {label} {}: {error}", path.display()))
}

fn canonical_project_root(path: &Path) -> Result<PathBuf, String> {
    let root = path.canonicalize().map_err(|error| format!("Could not open project folder {}: {error}", path.display()))?;
    if !root.is_dir() {
        return Err(format!("Project path is not a directory: {}", root.display()));
    }
    Ok(root)
}

fn checked_existing_source(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let source = root.join(relative).canonicalize().map_err(|error| format!("Could not open project source {}: {error}", relative.display()))?;
    if !source.starts_with(root) {
        return Err(format!("Project source escapes the project folder: {}", relative.display()));
    }
    Ok(source)
}

fn load_project_root(root: &Path) -> Result<LoadedProject, String> {
    let root = canonical_project_root(root)?;
    let manifest_text = read_utf8_limited(&root.join(MANIFEST_NAME), MAX_MANIFEST_BYTES, "project manifest")?;
    let manifest: ProjectManifest = serde_json::from_str(&manifest_text).map_err(|error| format!("Invalid {MANIFEST_NAME}: {error}"))?;
    let source_paths = validate_manifest(&manifest)?;
    let mut sources = Vec::with_capacity(source_paths.len());
    for (relative, path) in manifest.sources.iter().zip(source_paths) {
        let checked = checked_existing_source(&root, &path)?;
        sources.push(ProjectSource { path: relative.clone(), content: read_utf8_limited(&checked, MAX_SOURCE_BYTES, "VHDL source")? });
    }
    validate_top_entity(&manifest, &sources)?;
    Ok(LoadedProject { root_path: path_for_frontend(&root), manifest, sources })
}

fn validate_top_entity(manifest: &ProjectManifest, sources: &[ProjectSource]) -> Result<(), String> {
    let target = manifest.top_entity.to_ascii_lowercase();
    let found = sources.iter().any(|source| {
        let tokens: Vec<String> = source.content
            .split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
            .filter(|token| !token.is_empty())
            .map(str::to_ascii_lowercase)
            .collect();
        tokens.windows(3).any(|tokens| tokens[0] == "entity" && tokens[1] == target && tokens[2] == "is")
    });
    if found { Ok(()) } else { Err(format!("Top entity {} was not found in the project sources.", manifest.top_entity)) }
}

fn validate_save_request(request: &ProjectSaveRequest) -> Result<Vec<PathBuf>, String> {
    let paths = validate_manifest(&request.manifest)?;
    if request.sources.len() != request.manifest.sources.len() {
        return Err("The save payload does not match the manifest source list.".into());
    }
    for (expected, source) in request.manifest.sources.iter().zip(&request.sources) {
        if source.path != *expected {
            return Err(format!("Expected source {expected}, received {}.", source.path));
        }
        if source.content.len() as u64 > MAX_SOURCE_BYTES {
            return Err(format!("VHDL source exceeds the {MAX_SOURCE_BYTES} byte limit: {}", source.path));
        }
    }
    validate_top_entity(&request.manifest, &request.sources)?;
    Ok(paths)
}

struct PendingWrite {
    target: PathBuf,
    temporary: PathBuf,
    backup: Option<PathBuf>,
    applied: bool,
}

fn rollback_writes(writes: &mut [PendingWrite]) {
    for write in writes.iter_mut().rev() {
        if write.applied {
            let _ = fs::remove_file(&write.target);
        }
        if let Some(backup) = &write.backup {
            let _ = fs::rename(backup, &write.target);
        }
        let _ = fs::remove_file(&write.temporary);
    }
}

fn transactional_write(root: &Path, request: &ProjectSaveRequest) -> Result<(), String> {
    transactional_write_inner(root, request, None)
}

fn transactional_write_inner(root: &Path, request: &ProjectSaveRequest, fail_before_apply: Option<usize>) -> Result<(), String> {
    let source_paths = validate_save_request(request)?;
    let root = canonical_project_root(root)?;
    let stamp = timestamp()?;
    let manifest_bytes = serde_json::to_vec_pretty(&request.manifest).map_err(|error| error.to_string())?;
    let mut values: Vec<(PathBuf, &[u8])> = source_paths.into_iter().zip(request.sources.iter().map(|source| source.content.as_bytes())).collect();
    values.push((PathBuf::from(MANIFEST_NAME), &manifest_bytes));

    let mut writes = Vec::with_capacity(values.len());
    for (index, (relative, contents)) in values.into_iter().enumerate() {
        let staged = (|| -> Result<PendingWrite, String> {
            let target = root.join(relative);
            let parent = target.parent().ok_or_else(|| format!("Invalid project target: {}", target.display()))?;
            fs::create_dir_all(parent).map_err(|error| format!("Could not create project source folder {}: {error}", parent.display()))?;
            let checked_parent = parent.canonicalize().map_err(|error| format!("Could not validate project source folder {}: {error}", parent.display()))?;
            if !checked_parent.starts_with(&root) {
                return Err(format!("Project target escapes the project folder: {}", target.display()));
            }
            if target.exists() {
                let checked_target = target.canonicalize().map_err(|error| format!("Could not validate project target {}: {error}", target.display()))?;
                if !checked_target.starts_with(&root) || !checked_target.is_file() {
                    return Err(format!("Refusing to replace unsafe project target: {}", target.display()));
                }
            }
            let temporary = parent.join(format!(".logicboard-{stamp}-{index}.tmp"));
            fs::write(&temporary, contents).map_err(|error| format!("Could not stage project file {}: {error}", target.display()))?;
            Ok(PendingWrite { target, temporary, backup: None, applied: false })
        })();
        match staged {
            Ok(write) => writes.push(write),
            Err(error) => {
                rollback_writes(&mut writes);
                return Err(error);
            }
        }
    }

    for index in 0..writes.len() {
        if fail_before_apply == Some(index) {
            rollback_writes(&mut writes);
            return Err("Injected transactional write failure.".into());
        }
        if writes[index].target.exists() {
            let backup = writes[index].target.with_file_name(format!(".logicboard-{stamp}-{index}.bak"));
            if let Err(error) = fs::rename(&writes[index].target, &backup) {
                rollback_writes(&mut writes);
                return Err(format!("Could not back up project file: {error}"));
            }
            writes[index].backup = Some(backup);
        }
        if let Err(error) = fs::rename(&writes[index].temporary, &writes[index].target) {
            rollback_writes(&mut writes);
            return Err(format!("Could not replace project file: {error}"));
        }
        writes[index].applied = true;
    }

    for write in writes {
        if let Some(backup) = write.backup {
            fs::remove_file(&backup).map_err(|error| format!("Could not remove project backup {}: {error}", backup.display()))?;
        }
    }
    Ok(())
}

fn create_destination(parent: &Path, folder_name: &str) -> Result<PathBuf, String> {
    validate_folder_name(folder_name)?;
    let parent = canonical_project_root(parent)?;
    let destination = parent.join(folder_name);
    if destination.exists() {
        return Err(format!("Project destination already exists: {}", destination.display()));
    }
    fs::create_dir(&destination).map_err(|error| format!("Could not create project folder {}: {error}", destination.display()))?;
    destination.canonicalize().map_err(|error| format!("Could not validate project folder {}: {error}", destination.display()))
}

fn create_from_request(parent: &Path, folder_name: &str, request: &ProjectSaveRequest) -> Result<LoadedProject, String> {
    let destination = create_destination(parent, folder_name)?;
    if let Err(error) = transactional_write(&destination, request) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }
    load_project_root(&destination)
}

fn template_root(app: &tauri::AppHandle, template_id: &str) -> Result<PathBuf, String> {
    if !PROJECT_TEMPLATES.iter().any(|template| template.id == template_id) {
        return Err(format!("Unknown project template: {template_id}"));
    }
    app.path().resource_dir().map_err(|error| error.to_string()).map(|root| root.join("templates").join(template_id))
}

fn resolve_project_parent_path(preferred: Option<&Path>, default: &Path) -> Result<PathBuf, String> {
    if let Some(preferred) = preferred {
        if let Ok(canonical) = preferred.canonicalize() {
            if canonical.is_dir() {
                return Ok(canonical);
            }
        }
    }
    fs::create_dir_all(default).map_err(|error| format!("Could not create default projects folder {}: {error}", default.display()))?;
    default.canonicalize().map_err(|error| format!("Could not validate default projects folder {}: {error}", default.display()))
}

#[tauri::command]
pub fn list_project_templates() -> Vec<ProjectTemplate> {
    PROJECT_TEMPLATES.to_vec()
}

#[tauri::command]
pub fn resolve_project_parent(app: tauri::AppHandle, preferred_path: Option<String>) -> Result<ProjectWorkspaceDefaults, String> {
    let documents = app.path().document_dir().map_err(|error| format!("Could not locate the Documents folder: {error}"))?;
    let parent = resolve_project_parent_path(preferred_path.as_deref().map(Path::new), &documents.join("LogicBoard Projects"))?;
    Ok(ProjectWorkspaceDefaults { parent_path: path_for_frontend(&parent) })
}

#[tauri::command]
pub fn open_project(project_path: String) -> Result<LoadedProject, String> {
    load_project_root(Path::new(&project_path))
}

#[tauri::command]
pub fn save_project(project_path: String, project: ProjectSaveRequest) -> Result<LoadedProject, String> {
    let root = canonical_project_root(Path::new(&project_path))?;
    load_project_root(&root)?;
    transactional_write(&root, &project)?;
    load_project_root(&root)
}

#[tauri::command]
pub fn save_project_as(parent_path: String, folder_name: String, project: ProjectSaveRequest) -> Result<LoadedProject, String> {
    create_from_request(Path::new(&parent_path), &folder_name, &project)
}

#[tauri::command]
pub fn create_project(app: tauri::AppHandle, parent_path: String, folder_name: String, template_id: String, project_name: String) -> Result<LoadedProject, String> {
    let template = load_project_root(&template_root(&app, &template_id)?)?;
    let mut manifest = template.manifest;
    manifest.name = project_name;
    let request = ProjectSaveRequest { manifest, sources: template.sources };
    create_from_request(Path::new(&parent_path), &folder_name, &request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_windows_verbatim_prefixes_from_frontend_paths() {
        assert_eq!(path_for_frontend(Path::new(r"\\?\C:\Users\Pablo\Documents")), r"C:\Users\Pablo\Documents");
        assert_eq!(path_for_frontend(Path::new(r"\\?\UNC\server\projects")), r"\\server\projects");
    }

    struct TestDir(PathBuf);

    impl TestDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!("logicboard-{label}-{}", timestamp().unwrap()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn request(content: &str) -> ProjectSaveRequest {
        ProjectSaveRequest {
            manifest: ProjectManifest {
                schema_version: 1,
                name: "Test project".into(),
                board_id: SUPPORTED_BOARD_ID.into(),
                top_entity: "top".into(),
                sources: vec!["src/top.vhd".into()],
                assignments: vec![],
            },
            sources: vec![ProjectSource { path: "src/top.vhd".into(), content: format!("entity top is end entity;\n-- {content}") }],
        }
    }

    #[test]
    fn validates_schema_paths_boards_and_assignments() {
        let mut value = request("entity top is end entity;");
        assert!(validate_save_request(&value).is_ok());
        value.manifest.sources[0] = "../top.vhd".into();
        assert!(validate_save_request(&value).unwrap_err().contains("Invalid project source"));
        value = request("");
        value.manifest.sources.push("src/TOP.vhd".into());
        value.sources.push(ProjectSource { path: "src/TOP.vhd".into(), content: String::new() });
        assert!(validate_save_request(&value).unwrap_err().contains("Duplicate"));
        value = request("");
        value.manifest.board_id = "unknown".into();
        assert!(validate_save_request(&value).unwrap_err().contains("Unknown target board"));
        value = request("");
        value.manifest.assignments.push(ProjectAssignment { id: "a".into(), kind: "bad".into(), endpoint_id: "SW".into(), port_id: "SW".into() });
        assert!(validate_save_request(&value).unwrap_err().contains("Invalid assignment kind"));
    }

    #[test]
    fn creates_opens_saves_and_saves_as_projects() {
        let parent = TestDir::new("roundtrip");
        let created = create_from_request(&parent.0, "first", &request("old")).unwrap();
        assert!(created.sources[0].content.contains("old"));
        let root = PathBuf::from(&created.root_path);
        transactional_write(&root, &request("new")).unwrap();
        assert!(load_project_root(&root).unwrap().sources[0].content.contains("new"));
        let copied = create_from_request(&parent.0, "second", &request("copy")).unwrap();
        assert!(copied.sources[0].content.contains("copy"));
        assert_ne!(created.root_path, copied.root_path);
    }

    #[test]
    fn rejects_missing_and_oversized_sources() {
        let root = TestDir::new("limits");
        fs::write(root.0.join(MANIFEST_NAME), serde_json::to_vec(&request("").manifest).unwrap()).unwrap();
        assert!(load_project_root(&root.0).unwrap_err().contains("Could not open project source"));
        let oversized = "x".repeat(MAX_SOURCE_BYTES as usize + 1);
        assert!(validate_save_request(&request(&oversized)).unwrap_err().contains("exceeds"));
    }

    #[test]
    fn restores_replaced_files_when_a_transaction_fails() {
        let root = TestDir::new("rollback");
        transactional_write(&root.0, &request("original")).unwrap();
        assert!(transactional_write_inner(&root.0, &request("replacement"), Some(1)).is_err());
        let loaded = load_project_root(&root.0).unwrap();
        assert!(loaded.sources[0].content.contains("original"));
        assert!(!loaded.sources[0].content.contains("replacement"));
        assert_eq!(loaded.manifest.name, "Test project");
    }

    #[test]
    fn bundled_templates_load_and_copies_are_independent() {
        let templates = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("templates");
        for template in PROJECT_TEMPLATES {
            load_project_root(&templates.join(template.id)).unwrap();
        }
        let parent = TestDir::new("templates");
        let template = load_project_root(&templates.join("led-switch-mirror")).unwrap();
        let template_request = ProjectSaveRequest { manifest: template.manifest, sources: template.sources };
        let first = create_from_request(&parent.0, "first", &template_request).unwrap();
        let second = create_from_request(&parent.0, "second", &template_request).unwrap();
        transactional_write(Path::new(&first.root_path), &request("changed")).unwrap();
        assert_ne!(load_project_root(Path::new(&first.root_path)).unwrap().sources[0].content, load_project_root(Path::new(&second.root_path)).unwrap().sources[0].content);
    }

    #[test]
    fn resolves_a_preferred_parent_or_creates_the_default() {
        let root = TestDir::new("parent-default");
        let preferred = root.0.join("preferred");
        fs::create_dir(&preferred).unwrap();
        let default = root.0.join("Documents").join("LogicBoard Projects");
        assert_eq!(resolve_project_parent_path(Some(&preferred), &default).unwrap(), preferred.canonicalize().unwrap());

        let missing = root.0.join("missing");
        let resolved_default = resolve_project_parent_path(Some(&missing), &default).unwrap();
        assert!(resolved_default.is_dir());
        assert_eq!(resolved_default, default.canonicalize().unwrap());
    }

    #[test]
    fn rejects_symlinks_that_escape_the_project_root() {
        let root = TestDir::new("symlink-root");
        let outside = TestDir::new("symlink-outside");
        fs::write(outside.0.join("top.vhd"), "entity top is end entity;").unwrap();
        fs::create_dir(root.0.join("src")).unwrap();
        #[cfg(windows)]
        if std::os::windows::fs::symlink_file(outside.0.join("top.vhd"), root.0.join("src/top.vhd")).is_err() { return; }
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.0.join("top.vhd"), root.0.join("src/top.vhd")).unwrap();
        fs::write(root.0.join(MANIFEST_NAME), serde_json::to_vec(&request("").manifest).unwrap()).unwrap();
        assert!(load_project_root(&root.0).unwrap_err().contains("escapes"));
    }
}
