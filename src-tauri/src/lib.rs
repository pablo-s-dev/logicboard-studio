use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VhdlSource {
    name: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VhdlPort {
    id: String,
    name: String,
    direction: String,
    #[serde(rename = "type")]
    ty: String,
    bit: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulationResult {
    outputs: HashMap<String, bool>,
    diagnostics: Vec<String>,
}

fn safe_filename(name: &str) -> Option<&str> {
    let path = Path::new(name);
    if path.components().count() == 1
        && matches!(
            path.extension().and_then(|v| v.to_str()),
            Some("vhd" | "vhdl")
        )
    {
        path.file_name()?.to_str()
    } else {
        None
    }
}

fn ghdl_path() -> PathBuf {
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|p| p.join("resources/ghdl/bin/ghdl.exe")));
    if let Some(path) = bundled.filter(|path| path.exists()) {
        return path;
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let packages = PathBuf::from(local).join("Microsoft/WinGet/Packages");
        if let Ok(entries) = fs::read_dir(packages) {
            for entry in entries.flatten() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("ghdl.ghdl.")
                {
                    let candidate = entry.path().join("bin/ghdl.exe");
                    if candidate.exists() {
                        return candidate;
                    }
                }
            }
        }
    }
    PathBuf::from("ghdl")
}

fn safe_identifier(name: &str) -> Option<&str> {
    let mut chars = name.chars();
    let first = chars.next()?;
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return None;
    }
    if chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric()) {
        Some(name)
    } else {
        None
    }
}

fn run_ghdl(work: &Path, args: &[&str]) -> Result<Vec<String>, String> {
    let output = Command::new(ghdl_path())
        .current_dir(work)
        .args(args)
        .output()
        .map_err(|e| format!("GHDL is not available: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let messages: Vec<String> = stdout
        .lines()
        .chain(stderr.lines())
        .filter(|line| !line.trim().is_empty())
        .map(str::to_owned)
        .collect();
    if output.status.success() {
        Ok(messages)
    } else {
        Err(if messages.is_empty() {
            "GHDL failed.".into()
        } else {
            messages.join("\n")
        })
    }
}

fn report_value(line: &str) -> Option<(String, bool)> {
    let marker = "LB_SIGNAL ";
    let start = line.find(marker)? + marker.len();
    let payload = &line[start..];
    let (id, value) = payload.split_once('=')?;
    let normalized = value.trim().trim_matches('\'');
    match normalized {
        "1" => Some((id.trim().to_owned(), true)),
        "0" => Some((id.trim().to_owned(), false)),
        _ => None,
    }
}

fn testbench_source(
    top_entity: &str,
    ports: &[VhdlPort],
    inputs: &HashMap<String, bool>,
) -> Result<String, String> {
    safe_identifier(top_entity).ok_or_else(|| format!("Invalid top entity: {top_entity}"))?;
    let mut groups: BTreeMap<&str, (&str, &str)> = BTreeMap::new();
    for port in ports {
        safe_identifier(&port.name)
            .ok_or_else(|| format!("Invalid VHDL port name: {}", port.name))?;
        if port.direction != "in" && port.direction != "out" {
            return Err(format!("Unsupported port direction for {}", port.id));
        }
        groups
            .entry(&port.name)
            .or_insert((&port.direction, &port.ty));
    }

    let mut tb =
        String::from("library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n\n");
    tb.push_str("entity logicboard_tb is end entity;\n\narchitecture sim of logicboard_tb is\n");
    for (name, (_, ty)) in &groups {
        tb.push_str(&format!("  signal {name} : {ty} := "));
        if ty.to_ascii_lowercase().contains("vector")
            || ty.to_ascii_lowercase().contains("unsigned")
            || ty.to_ascii_lowercase().contains("signed")
        {
            tb.push_str("(others => '0');\n");
        } else {
            tb.push_str("'0';\n");
        }
    }
    tb.push_str("begin\n");
    tb.push_str(&format!("  uut: entity work.{top_entity} port map (\n"));
    for (index, name) in groups.keys().enumerate() {
        let suffix = if index + 1 == groups.len() { "" } else { "," };
        tb.push_str(&format!("    {name} => {name}{suffix}\n"));
    }
    tb.push_str("  );\n\n  stimulus: process\n  begin\n");
    for port in ports.iter().filter(|port| port.direction == "in") {
        let value = if *inputs.get(&port.id).unwrap_or(&false) {
            '1'
        } else {
            '0'
        };
        let target = match port.bit {
            Some(bit) => format!("{}({bit})", port.name),
            None => port.name.clone(),
        };
        tb.push_str(&format!("    {target} <= '{value}';\n"));
    }
    tb.push_str("    wait for 1 ns;\n");
    for port in ports.iter().filter(|port| port.direction == "out") {
        let target = match port.bit {
            Some(bit) => format!("{}({bit})", port.name),
            None => port.name.clone(),
        };
        tb.push_str(&format!(
            "    report \"LB_SIGNAL {}=\" & std_logic'image({target});\n",
            port.id
        ));
    }
    tb.push_str("    wait;\n  end process;\nend architecture;\n");
    Ok(tb)
}

#[tauri::command]
fn analyze_project(sources: Vec<VhdlSource>) -> Result<Vec<String>, String> {
    if sources.is_empty() {
        return Err("The project has no VHDL source files.".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let work = std::env::temp_dir().join(format!("logicboard-{stamp}"));
    fs::create_dir_all(&work).map_err(|e| format!("Could not create GHDL work directory: {e}"))?;

    let result = (|| {
        let mut files = Vec::with_capacity(sources.len());
        for source in sources {
            let filename = safe_filename(&source.name)
                .ok_or_else(|| format!("Invalid VHDL filename: {}", source.name))?;
            let path = work.join(filename);
            fs::write(&path, source.content)
                .map_err(|e| format!("Could not stage {filename}: {e}"))?;
            files.push(path);
        }
        let args: Vec<String> = std::iter::once("-a".to_owned())
            .chain(std::iter::once("--std=08".to_owned()))
            .chain(files.iter().map(|path| path.to_string_lossy().to_string()))
            .collect();
        run_ghdl(&work, &args.iter().map(String::as_str).collect::<Vec<_>>())
    })();
    let _ = fs::remove_dir_all(&work);
    result
}

#[tauri::command]
fn simulate_project(
    sources: Vec<VhdlSource>,
    top_entity: String,
    ports: Vec<VhdlPort>,
    inputs: HashMap<String, bool>,
) -> Result<SimulationResult, String> {
    if sources.is_empty() {
        return Err("The project has no VHDL source files.".into());
    }
    if ports.is_empty() {
        return Err("The top entity has no supported in/out ports.".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let work = std::env::temp_dir().join(format!("logicboard-sim-{stamp}"));
    fs::create_dir_all(&work).map_err(|e| format!("Could not create GHDL work directory: {e}"))?;

    let result = (|| {
        let mut files = Vec::with_capacity(sources.len());
        for source in sources {
            let filename = safe_filename(&source.name)
                .ok_or_else(|| format!("Invalid VHDL filename: {}", source.name))?;
            let path = work.join(filename);
            fs::write(&path, source.content)
                .map_err(|e| format!("Could not stage {filename}: {e}"))?;
            files.push(path);
        }
        let tb_path = work.join("logicboard_tb.vhd");
        fs::write(&tb_path, testbench_source(&top_entity, &ports, &inputs)?)
            .map_err(|e| format!("Could not stage generated testbench: {e}"))?;
        files.push(tb_path);

        let analyze_args: Vec<String> = std::iter::once("-a".to_owned())
            .chain(std::iter::once("--std=08".to_owned()))
            .chain(files.iter().map(|path| path.to_string_lossy().to_string()))
            .collect();
        let mut diagnostics = run_ghdl(
            &work,
            &analyze_args.iter().map(String::as_str).collect::<Vec<_>>(),
        )?;
        diagnostics.extend(run_ghdl(&work, &["-e", "--std=08", "logicboard_tb"])?);
        let run_messages = run_ghdl(
            &work,
            &["-r", "--std=08", "logicboard_tb", "--assert-level=error"],
        )?;
        let outputs = run_messages
            .iter()
            .filter_map(|line| report_value(line))
            .collect();
        diagnostics.extend(
            run_messages
                .into_iter()
                .filter(|line| !line.contains("LB_SIGNAL ")),
        );
        Ok(SimulationResult {
            outputs,
            diagnostics,
        })
    })();
    let _ = fs::remove_dir_all(&work);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![analyze_project, simulate_project])
        .run(tauri::generate_context!())
        .expect("error while running LogicBoard Studio");
}

#[cfg(test)]
mod tests {
    use super::{report_value, safe_filename, testbench_source, VhdlPort};
    use std::collections::HashMap;

    #[test]
    fn accepts_vhdl_files() {
        assert_eq!(safe_filename("top.vhd"), Some("top.vhd"));
    }
    #[test]
    fn rejects_paths() {
        assert_eq!(safe_filename("../top.vhd"), None);
    }
    #[test]
    fn parses_reported_values() {
        assert_eq!(
            report_value("logicboard_tb.vhd:18:5:@1ns:(report note): LB_SIGNAL LED[0]='1'"),
            Some(("LED[0]".into(), true))
        );
    }
    #[test]
    fn builds_testbench_from_ports() {
        let ports = vec![
            VhdlPort {
                id: "SW[0]".into(),
                name: "SW".into(),
                direction: "in".into(),
                ty: "std_logic_vector(1 downto 0)".into(),
                bit: Some(0),
            },
            VhdlPort {
                id: "LED".into(),
                name: "LED".into(),
                direction: "out".into(),
                ty: "std_logic".into(),
                bit: None,
            },
        ];
        let mut inputs = HashMap::new();
        inputs.insert("SW[0]".into(), true);
        let tb = testbench_source("top", &ports, &inputs).unwrap();
        assert!(tb.contains("uut: entity work.top"));
        assert!(tb.contains("SW(0) <= '1';"));
        assert!(tb.contains("report \"LB_SIGNAL LED=\""));
    }
}
