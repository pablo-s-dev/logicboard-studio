use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(windows)]
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
#[cfg(windows)]
use windows_core::Interface;

mod projects;
use projects::{create_project, list_project_templates, open_project, resolve_project_parent, save_project, save_project_as};

const MAX_SESSION_STEP_NS: u64 = 250_000_000;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VhdlSource {
    name: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisResult {
    diagnostics: Vec<String>,
    duration_ms: u64,
    engine_version: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VhdlPort {
    id: String,
    name: String,
    direction: String,
    #[serde(rename = "type")]
    ty: String,
    bit: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimulationClock {
    port_id: String,
    half_period_ps: u64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InputEvent {
    time_ns: u64,
    port_id: String,
    value: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulationResult {
    outputs: HashMap<String, bool>,
    samples: Vec<SimulationSample>,
    diagnostics: Vec<String>,
    simulated_time_ns: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulationSample {
    time_ns: u64,
    outputs: HashMap<String, bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulationSessionResult {
    session_id: String,
    outputs: HashMap<String, bool>,
    samples: Vec<SimulationSample>,
    diagnostics: Vec<String>,
    simulated_time_ns: u64,
}

#[derive(Default)]
struct SimulationSessions(Mutex<HashMap<String, SimulationSession>>);

struct SimulationSession {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    work: PathBuf,
    input_indexes: HashMap<String, usize>,
    pending_events: Vec<InputEvent>,
    outputs: HashMap<String, bool>,
    simulated_time_ns: u64,
}

fn safe_source_path(name: &str) -> Option<PathBuf> {
    let path = Path::new(name);
    if !path.is_absolute()
        && path.components().all(|component| matches!(component, std::path::Component::Normal(_)))
        && matches!(
            path.extension().and_then(|v| v.to_str()),
            Some(extension) if extension.eq_ignore_ascii_case("vhd") || extension.eq_ignore_ascii_case("vhdl")
        )
    {
        Some(path.to_path_buf())
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

fn ghdl_command() -> Command {
    let mut command = Command::new(ghdl_path());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
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
    let output = ghdl_command()
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
        .map(|line| clean_ghdl_message(work, line))
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

fn clean_ghdl_message(work: &Path, line: &str) -> String {
    line.strip_prefix(work.to_string_lossy().as_ref())
        .unwrap_or(line)
        .trim_start_matches(['/', '\\'])
        .to_owned()
}

fn ghdl_version() -> Result<String, String> {
    let output = ghdl_command()
        .arg("--version")
        .output()
        .map_err(|e| format!("GHDL is not available: {e}"))?;
    if !output.status.success() {
        return Err("Could not determine the installed GHDL version.".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("GHDL")
        .trim()
        .to_owned())
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

fn report_sample_time(line: &str) -> Option<u64> {
    let marker = "LB_SAMPLE ";
    let start = line.find(marker)? + marker.len();
    line[start..].trim().parse().ok()
}

fn collect_samples(lines: &[String]) -> (HashMap<String, bool>, Vec<SimulationSample>) {
    let mut latest_outputs = HashMap::new();
    let mut current_sample: Option<SimulationSample> = None;
    let mut samples = Vec::new();

    for line in lines {
        if let Some(time_ns) = report_sample_time(line) {
            if let Some(sample) = current_sample.take() {
                samples.push(sample);
            }
            current_sample = Some(SimulationSample {
                time_ns,
                outputs: HashMap::new(),
            });
            continue;
        }

        if let Some((id, value)) = report_value(line) {
            latest_outputs.insert(id.clone(), value);
            if let Some(sample) = current_sample.as_mut() {
                sample.outputs.insert(id, value);
            }
        }
    }

    if let Some(sample) = current_sample {
        samples.push(sample);
    }
    (latest_outputs, samples)
}

fn port_target(port: &VhdlPort) -> String {
    match port.bit {
        Some(bit) => format!("{}({bit})", port.name),
        None => port.name.clone(),
    }
}

fn testbench_source(
    top_entity: &str,
    ports: &[VhdlPort],
    inputs: &HashMap<String, bool>,
    clocks: &[SimulationClock],
    input_events: &[InputEvent],
    duration_ns: u64,
    sample_interval_ns: u64,
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
    let ports_by_id: HashMap<&str, &VhdlPort> =
        ports.iter().map(|port| (port.id.as_str(), port)).collect();
    let clock_targets: HashMap<&str, (&VhdlPort, u64)> = clocks
        .iter()
        .filter_map(|clock| {
            ports_by_id
                .get(clock.port_id.as_str())
                .map(|port| (clock.port_id.as_str(), (*port, clock.half_period_ps)))
        })
        .collect();
    let mut events = input_events.to_vec();
    events.sort_by_key(|event| event.time_ns);

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
    tb.push_str("  );\n\n");
    for (index, (_, (port, half_period_ps))) in clock_targets.iter().enumerate() {
        let target = port_target(port);
        tb.push_str(&format!("  clock_driver_{index}: process\n  begin\n"));
        tb.push_str("    loop\n");
        tb.push_str(&format!("    {target} <= '0';\n"));
        tb.push_str(&format!("    wait for {half_period_ps} ps;\n"));
        tb.push_str(&format!("    {target} <= '1';\n"));
        tb.push_str(&format!("    wait for {half_period_ps} ps;\n"));
        tb.push_str("    end loop;\n");
        tb.push_str("  end process;\n\n");
    }

    tb.push_str("  stimulus: process\n  begin\n");
    for port in ports.iter().filter(|port| port.direction == "in") {
        if clock_targets.contains_key(port.id.as_str()) {
            continue;
        }
        let value = if *inputs.get(&port.id).unwrap_or(&false) {
            '1'
        } else {
            '0'
        };
        let target = port_target(port);
        tb.push_str(&format!("    {target} <= '{value}';\n"));
    }
    let mut current_time_ns = 0_u64;
    for event in events {
        let Some(port) = ports_by_id.get(event.port_id.as_str()) else {
            continue;
        };
        if port.direction != "in" || clock_targets.contains_key(port.id.as_str()) {
            continue;
        }
        if event.time_ns > current_time_ns {
            tb.push_str(&format!("    wait for {} ns;\n", event.time_ns - current_time_ns));
            current_time_ns = event.time_ns;
        } else {
            tb.push_str("    wait for 0 ns;\n");
        }
        let target = port_target(port);
        let value = if event.value { '1' } else { '0' };
        tb.push_str(&format!("    {target} <= '{value}';\n"));
    }
    tb.push_str("    wait;\n  end process;\n\n");

    tb.push_str("  sampler: process\n  begin\n");
    let mut current_sample_ns = 0_u64;
    let sample_step_ns = sample_interval_ns.clamp(1, duration_ns.max(1));
    while current_sample_ns < duration_ns {
        let next_sample_ns = (current_sample_ns + sample_step_ns).min(duration_ns);
        tb.push_str(&format!(
            "    wait for {} ns;\n",
            next_sample_ns - current_sample_ns
        ));
        current_sample_ns = next_sample_ns;
        tb.push_str(&format!("    report \"LB_SAMPLE {current_sample_ns}\";\n"));
        for port in ports {
            let target = port_target(port);
            tb.push_str(&format!(
                "    report \"LB_SIGNAL {}=\" & std_logic'image({target});\n",
                port.id
            ));
        }
    }
    tb.push_str("    wait;\n  end process;\nend architecture;\n");
    Ok(tb)
}

fn interactive_testbench_source(
    top_entity: &str,
    ports: &[VhdlPort],
    inputs: &HashMap<String, bool>,
    clocks: &[SimulationClock],
) -> Result<(String, HashMap<String, usize>), String> {
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
    let ports_by_id: HashMap<&str, &VhdlPort> =
        ports.iter().map(|port| (port.id.as_str(), port)).collect();
    let clock_targets: HashMap<&str, (&VhdlPort, u64)> = clocks
        .iter()
        .filter_map(|clock| {
            ports_by_id
                .get(clock.port_id.as_str())
                .map(|port| (clock.port_id.as_str(), (*port, clock.half_period_ps)))
        })
        .collect();
    let event_inputs: Vec<&VhdlPort> = ports
        .iter()
        .filter(|port| port.direction == "in" && !clock_targets.contains_key(port.id.as_str()))
        .collect();
    let input_indexes: HashMap<String, usize> = event_inputs
        .iter()
        .enumerate()
        .map(|(index, port)| (port.id.clone(), index))
        .collect();

    let mut tb =
        String::from("library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nuse std.textio.all;\n\n");
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
    tb.push_str("  );\n\n");
    for (index, (_, (port, half_period_ps))) in clock_targets.iter().enumerate() {
        let target = port_target(port);
        tb.push_str(&format!("  clock_driver_{index}: process\n  begin\n"));
        tb.push_str("    loop\n");
        tb.push_str(&format!("    {target} <= '0';\n"));
        tb.push_str(&format!("    wait for {half_period_ps} ps;\n"));
        tb.push_str(&format!("    {target} <= '1';\n"));
        tb.push_str(&format!("    wait for {half_period_ps} ps;\n"));
        tb.push_str("    end loop;\n");
        tb.push_str("  end process;\n\n");
    }

    tb.push_str("  interactive: process\n");
    tb.push_str("    variable command_line : line;\n");
    tb.push_str("    variable command_word : string(1 to 4);\n");
    tb.push_str("    variable step_delta_ns : integer;\n");
    tb.push_str("    variable event_count : integer;\n");
    tb.push_str("    variable event_delta_ns : integer;\n");
    tb.push_str("    variable event_index : integer;\n");
    tb.push_str("    variable event_value : integer;\n");
    tb.push_str("    variable current_time : time := 0 ns;\n");
    tb.push_str("    variable command_start_time : time;\n");
    tb.push_str("    variable target_time : time;\n");
    tb.push_str("    variable event_time : time;\n");
    tb.push_str("  begin\n");
    for port in &event_inputs {
        let value = if *inputs.get(&port.id).unwrap_or(&false) {
            '1'
        } else {
            '0'
        };
        tb.push_str(&format!("    {} <= '{value}';\n", port_target(port)));
    }
    tb.push_str("    loop\n");
    tb.push_str("      readline(input, command_line);\n");
    tb.push_str("      read(command_line, command_word);\n");
    tb.push_str("      read(command_line, step_delta_ns);\n");
    tb.push_str("      read(command_line, event_count);\n");
    tb.push_str("      command_start_time := current_time;\n");
    tb.push_str("      target_time := command_start_time + step_delta_ns * 1 ns;\n");
    tb.push_str("      for event_number in 1 to event_count loop\n");
    tb.push_str("        readline(input, command_line);\n");
    tb.push_str("        read(command_line, event_delta_ns);\n");
    tb.push_str("        read(command_line, event_index);\n");
    tb.push_str("        read(command_line, event_value);\n");
    tb.push_str("        event_time := command_start_time + event_delta_ns * 1 ns;\n");
    tb.push_str("        if event_time > current_time then\n");
    tb.push_str("          wait for event_time - current_time;\n");
    tb.push_str("          current_time := event_time;\n");
    tb.push_str("        end if;\n");
    tb.push_str("        case event_index is\n");
    for (index, port) in event_inputs.iter().enumerate() {
        let target = port_target(port);
        tb.push_str(&format!("          when {index} =>\n"));
        tb.push_str("            if event_value = 0 then\n");
        tb.push_str(&format!("              {target} <= '0';\n"));
        tb.push_str("            else\n");
        tb.push_str(&format!("              {target} <= '1';\n"));
        tb.push_str("            end if;\n");
    }
    tb.push_str("          when others => null;\n");
    tb.push_str("        end case;\n");
    tb.push_str("      end loop;\n");
    tb.push_str("      if target_time > current_time then\n");
    tb.push_str("        wait for target_time - current_time;\n");
    tb.push_str("        current_time := target_time;\n");
    tb.push_str("      end if;\n");
    for port in ports {
        let target = port_target(port);
        tb.push_str(&format!(
            "      report \"LB_SIGNAL {}=\" & std_logic'image({target});\n",
            port.id
        ));
    }
    tb.push_str("      report \"LB_DONE\";\n");
    tb.push_str("    end loop;\n");
    tb.push_str("  end process;\nend architecture;\n");
    Ok((tb, input_indexes))
}

#[tauri::command]
fn analyze_project(sources: Vec<VhdlSource>) -> Result<AnalysisResult, String> {
    if sources.is_empty() {
        return Err("The project has no VHDL source files.".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let work = std::env::temp_dir().join(format!("logicboard-{stamp}"));
    fs::create_dir_all(&work).map_err(|e| format!("Could not create GHDL work directory: {e}"))?;

    let started = Instant::now();
    let result = (|| {
        let engine_version = ghdl_version()?;
        let files = stage_sources(&work, sources)?;
        let args: Vec<String> = std::iter::once("-a".to_owned())
            .chain(std::iter::once("--std=08".to_owned()))
            .chain(files.iter().map(|path| path.to_string_lossy().to_string()))
            .collect();
        let diagnostics = run_ghdl(&work, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
        Ok(AnalysisResult {
            diagnostics,
            duration_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
            engine_version,
        })
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
    clocks: Vec<SimulationClock>,
    input_events: Vec<InputEvent>,
    duration_ns: u64,
    sample_interval_ns: Option<u64>,
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
        let mut files = stage_sources(&work, sources)?;
        let tb_path = work.join("logicboard_tb.vhd");
        let bounded_duration_ns = duration_ns.max(1);
        let bounded_sample_interval_ns = sample_interval_ns
            .unwrap_or(bounded_duration_ns)
            .clamp(1, bounded_duration_ns);
        fs::write(
            &tb_path,
            testbench_source(
                &top_entity,
                &ports,
                &inputs,
                &clocks,
                &input_events,
                bounded_duration_ns,
                bounded_sample_interval_ns,
            )?,
        )
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
        let stop_time = format!("--stop-time={}ns", bounded_duration_ns + 1);
        let run_messages = run_ghdl(
            &work,
            &[
                "-r",
                "--std=08",
                "logicboard_tb",
                "--assert-level=error",
                &stop_time,
            ],
        )?;
        let (outputs, samples) = collect_samples(&run_messages);
        diagnostics.extend(
            run_messages
                .into_iter()
                .filter(|line| !line.contains("LB_SIGNAL ") && !line.contains("LB_SAMPLE ")),
        );
        Ok(SimulationResult {
            outputs,
            samples,
            diagnostics,
            simulated_time_ns: bounded_duration_ns,
        })
    })();
    let _ = fs::remove_dir_all(&work);
    result
}

fn stage_sources(work: &Path, sources: Vec<VhdlSource>) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::with_capacity(sources.len());
    for source in sources {
        let relative = safe_source_path(&source.name)
            .ok_or_else(|| format!("Invalid VHDL source path: {}", source.name))?;
        let path = work.join(&relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Could not create staging folder {}: {e}", parent.display()))?;
        }
        fs::write(&path, source.content)
            .map_err(|e| format!("Could not stage {}: {e}", relative.display()))?;
        files.push(path);
    }
    Ok(files)
}

fn session_step(
    session: &mut SimulationSession,
    target_time_ns: u64,
    input_events: Vec<InputEvent>,
) -> Result<SimulationResult, String> {
    if target_time_ns <= session.simulated_time_ns
        && input_events.is_empty()
        && session.pending_events.is_empty()
    {
        return Ok(SimulationResult {
            outputs: session.outputs.clone(),
            samples: vec![SimulationSample {
                time_ns: session.simulated_time_ns,
                outputs: session.outputs.clone(),
            }],
            diagnostics: Vec::new(),
            simulated_time_ns: session.simulated_time_ns,
        });
    }

    let step_target = if session.simulated_time_ns < target_time_ns {
        (session.simulated_time_ns + MAX_SESSION_STEP_NS).min(target_time_ns)
    } else {
        session.simulated_time_ns
    };

    let mut events = Vec::new();
    events.append(&mut session.pending_events);
    events.extend(input_events);
    events.sort_by_key(|event| event.time_ns);
    let split_index = events.partition_point(|event| event.time_ns <= step_target);
    let future_events = events.split_off(split_index);
    let mut chunk_events = Vec::new();
    for event in events {
        if let Some(index) = session.input_indexes.get(&event.port_id) {
            chunk_events.push((event.time_ns, *index, event.value));
        }
    }
    session.pending_events = future_events;

    if step_target <= session.simulated_time_ns && chunk_events.is_empty() {
        return Ok(SimulationResult {
            outputs: session.outputs.clone(),
            samples: vec![SimulationSample {
                time_ns: session.simulated_time_ns,
                outputs: session.outputs.clone(),
            }],
            diagnostics: Vec::new(),
            simulated_time_ns: session.simulated_time_ns,
        });
    }

    let step_delta_ns = step_target.saturating_sub(session.simulated_time_ns);
    writeln!(session.stdin, "STEP {step_delta_ns} {}", chunk_events.len())
        .map_err(|e| format!("Could not write simulation step: {e}"))?;
    for (time_ns, index, value) in chunk_events {
        let event_delta_ns = time_ns.saturating_sub(session.simulated_time_ns);
        writeln!(
            session.stdin,
            "{event_delta_ns} {index} {}",
            if value { 1 } else { 0 }
        )
        .map_err(|e| format!("Could not write simulation input event: {e}"))?;
    }
    session
        .stdin
        .flush()
        .map_err(|e| format!("Could not flush simulation step: {e}"))?;

    let mut step_outputs = HashMap::new();
    let mut step_transcript = Vec::new();
    let mut diagnostics = Vec::new();
    loop {
        let mut line = String::new();
        let bytes = session
            .stdout
            .read_line(&mut line)
            .map_err(|e| format!("Could not read simulation output: {e}"))?;
        if bytes == 0 {
            let status = session
                .child
                .try_wait()
                .ok()
                .flatten()
                .map(|status| status.to_string())
                .unwrap_or_else(|| "status unavailable".to_owned());
            let recent_output = step_transcript
                .iter()
                .rev()
                .take(8)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n");
            let detail = if recent_output.is_empty() {
                "No simulator output was captured for this step.".to_owned()
            } else {
                format!("Recent simulator output:\n{recent_output}")
            };
            return Err(format!(
                "GHDL simulation session ended before LB_DONE while advancing to {step_target} ns ({status}). {detail}"
            ));
        }
        let trimmed = line.trim().to_owned();
        if trimmed.contains("LB_DONE") {
            break;
        }
        if !trimmed.is_empty() {
            step_transcript.push(trimmed.clone());
        }
        if let Some((id, value)) = report_value(&trimmed) {
            session.outputs.insert(id.clone(), value);
            step_outputs.insert(id, value);
        } else if !trimmed.is_empty() {
            diagnostics.push(trimmed);
        }
    }
    session.simulated_time_ns = step_target;

    Ok(SimulationResult {
        outputs: session.outputs.clone(),
        samples: vec![SimulationSample {
            time_ns: step_target,
            outputs: step_outputs,
        }],
        diagnostics,
        simulated_time_ns: session.simulated_time_ns,
    })
}

fn start_simulation_session_inner(
    sessions: &SimulationSessions,
    sources: Vec<VhdlSource>,
    top_entity: String,
    ports: Vec<VhdlPort>,
    inputs: HashMap<String, bool>,
    clocks: Vec<SimulationClock>,
) -> Result<SimulationSessionResult, String> {
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
    let session_id = format!("session-{stamp}");
    let work = std::env::temp_dir().join(format!("logicboard-session-{stamp}"));
    fs::create_dir_all(&work).map_err(|e| format!("Could not create GHDL work directory: {e}"))?;

    let result = (|| {
        let mut files = stage_sources(&work, sources)?;
        let (tb, input_indexes) = interactive_testbench_source(&top_entity, &ports, &inputs, &clocks)?;
        let tb_path = work.join("logicboard_tb.vhd");
        fs::write(&tb_path, tb)
            .map_err(|e| format!("Could not stage generated interactive testbench: {e}"))?;
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

        let mut child = ghdl_command()
            .current_dir(&work)
            .args(["-r", "--std=08", "logicboard_tb", "--assert-level=error"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not start GHDL simulation session: {e}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Could not open GHDL stdin.".to_owned())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Could not open GHDL stdout.".to_owned())?;
        let mut session = SimulationSession {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            work: work.clone(),
            input_indexes,
            pending_events: Vec::new(),
            outputs: HashMap::new(),
            simulated_time_ns: 0,
        };
        let initial = session_step(&mut session, 0, Vec::new())?;
        let outputs = initial.outputs.clone();
        let samples = initial.samples;
        diagnostics.extend(initial.diagnostics);

        sessions
            .0
            .lock()
            .map_err(|_| "Could not lock simulation session state.".to_owned())?
            .insert(session_id.clone(), session);
        Ok(SimulationSessionResult {
            session_id: session_id.clone(),
            outputs,
            samples,
            diagnostics,
            simulated_time_ns: 0,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&work);
    }
    result
}

fn step_simulation_session_inner(
    sessions: &SimulationSessions,
    session_id: String,
    target_time_ns: u64,
    input_events: Vec<InputEvent>,
) -> Result<SimulationResult, String> {
    let mut guard = sessions
        .0
        .lock()
        .map_err(|_| "Could not lock simulation session state.".to_owned())?;
    let session = guard
        .get_mut(&session_id)
        .ok_or_else(|| format!("Simulation session {session_id} is not running."))?;
    session_step(session, target_time_ns, input_events)
}

fn stop_simulation_session_inner(
    sessions: &SimulationSessions,
    session_id: String,
) -> Result<(), String> {
    let mut session = sessions
        .0
        .lock()
        .map_err(|_| "Could not lock simulation session state.".to_owned())?
        .remove(&session_id)
        .ok_or_else(|| format!("Simulation session {session_id} is not running."))?;
    let _ = session.child.kill();
    let _ = session.child.wait();
    let _ = fs::remove_dir_all(&session.work);
    Ok(())
}

#[tauri::command]
fn start_simulation_session(
    sessions: tauri::State<SimulationSessions>,
    sources: Vec<VhdlSource>,
    top_entity: String,
    ports: Vec<VhdlPort>,
    inputs: HashMap<String, bool>,
    clocks: Vec<SimulationClock>,
) -> Result<SimulationSessionResult, String> {
    start_simulation_session_inner(&sessions, sources, top_entity, ports, inputs, clocks)
}

#[tauri::command]
fn step_simulation_session(
    sessions: tauri::State<SimulationSessions>,
    session_id: String,
    target_time_ns: u64,
    input_events: Vec<InputEvent>,
) -> Result<SimulationResult, String> {
    step_simulation_session_inner(&sessions, session_id, target_time_ns, input_events)
}

#[tauri::command]
fn stop_simulation_session(
    sessions: tauri::State<SimulationSessions>,
    session_id: String,
) -> Result<(), String> {
    stop_simulation_session_inner(&sessions, session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(windows)]
            {
                use tauri::Manager;

                let main_window = app
                    .get_webview_window("main")
                    .ok_or("main webview window is unavailable")?;
                main_window.with_webview(|webview| unsafe {
                    let core_webview = webview
                        .controller()
                        .CoreWebView2()
                        .expect("WebView2 core is unavailable");
                    let settings = core_webview
                        .Settings()
                        .expect("WebView2 settings are unavailable");
                    if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
                        settings3
                            .SetAreBrowserAcceleratorKeysEnabled(false)
                            .expect("could not disable WebView2 browser accelerators");
                    }
                })?;
            }
            Ok(())
        })
        .manage(SimulationSessions::default())
        .invoke_handler(tauri::generate_handler![
            analyze_project,
            simulate_project,
            start_simulation_session,
            step_simulation_session,
            stop_simulation_session,
            list_project_templates,
            resolve_project_parent,
            open_project,
            create_project,
            save_project,
            save_project_as
        ])
        .run(tauri::generate_context!())
        .expect("error while running LogicBoard Studio");
}

#[cfg(test)]
mod tests {
    use super::{
        clean_ghdl_message, collect_samples, ghdl_command, interactive_testbench_source, report_value, safe_source_path,
        simulate_project, start_simulation_session_inner, step_simulation_session_inner,
        stop_simulation_session_inner, testbench_source, InputEvent, SimulationClock,
        SimulationSessions, VhdlPort, VhdlSource,
    };
    use std::collections::HashMap;
    use std::path::Path;

    #[test]
    fn removes_temporary_work_directory_from_ghdl_messages() {
        let work = Path::new(r"C:\Users\Pablo\AppData\Local\Temp\logicboard-123");
        let message = format!(r"{}/src/top.vhd:9:4:error: missing semicolon", work.display());
        assert_eq!(clean_ghdl_message(work, &message), "src/top.vhd:9:4:error: missing semicolon");
    }

    #[test]
    fn accepts_vhdl_files() {
        assert_eq!(safe_source_path("top.vhd"), Some(std::path::PathBuf::from("top.vhd")));
        assert_eq!(safe_source_path("src/pkg/top.vhdl"), Some(std::path::PathBuf::from("src/pkg/top.vhdl")));
    }
    #[test]
    fn rejects_paths() {
        assert_eq!(safe_source_path("../top.vhd"), None);
        assert_eq!(safe_source_path("top.txt"), None);
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
        let tb = testbench_source("top", &ports, &inputs, &[], &[], 1, 1).unwrap();
        assert!(tb.contains("uut: entity work.top"));
        assert!(tb.contains("SW(0) <= '1';"));
        assert!(tb.contains("report \"LB_SAMPLE 1\";"));
        assert!(tb.contains("report \"LB_SIGNAL LED=\""));
    }

    #[test]
    fn builds_realistic_clock_driver_from_board_clock() {
        let ports = vec![
            VhdlPort {
                id: "CLOCK_50".into(),
                name: "CLOCK_50".into(),
                direction: "in".into(),
                ty: "std_logic".into(),
                bit: None,
            },
            VhdlPort {
                id: "run_btn_n".into(),
                name: "run_btn_n".into(),
                direction: "in".into(),
                ty: "std_logic".into(),
                bit: None,
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
        inputs.insert("CLOCK_50".into(), false);
        inputs.insert("run_btn_n".into(), true);
        let clocks = vec![SimulationClock {
            port_id: "CLOCK_50".into(),
            half_period_ps: 10_000,
        }];
        let events = vec![
            InputEvent {
                time_ns: 100,
                port_id: "run_btn_n".into(),
                value: false,
            },
            InputEvent {
                time_ns: 140,
                port_id: "run_btn_n".into(),
                value: true,
            },
        ];
        let tb = testbench_source("top", &ports, &inputs, &clocks, &events, 1_000, 500).unwrap();
        assert!(tb.contains("CLOCK_50 <= '0';"));
        assert!(tb.contains("wait for 10000 ps;"));
        assert!(tb.contains("clock_driver_0: process\n  begin\n    loop\n"));
        assert!(tb.contains("    end loop;\n  end process;"));
        assert!(!tb.contains("CLOCK_50 <= '1';\n    run_btn_n"));
        assert!(tb.contains("wait for 100 ns;\n    run_btn_n <= '0';"));
        assert!(tb.contains("wait for 40 ns;\n    run_btn_n <= '1';"));
        assert!(tb.contains("report \"LB_SAMPLE 500\";"));
        assert!(tb.contains("report \"LB_SAMPLE 1000\";"));
    }

    #[test]
    fn builds_interactive_testbench_protocol() {
        let ports = vec![
            scalar_port("CLOCK_50", "in"),
            scalar_port("run_btn_n", "in"),
            scalar_port("LED", "out"),
        ];
        let mut inputs = HashMap::new();
        inputs.insert("run_btn_n".into(), true);
        let clocks = vec![SimulationClock {
            port_id: "CLOCK_50".into(),
            half_period_ps: 500_000_000,
        }];

        let (tb, input_indexes) =
            interactive_testbench_source("top", &ports, &inputs, &clocks).unwrap();

        assert_eq!(input_indexes.get("run_btn_n"), Some(&0));
        assert!(!input_indexes.contains_key("CLOCK_50"));
        assert!(tb.contains("clock_driver_0: process\n  begin\n    loop\n"));
        assert!(tb.contains("    end loop;\n  end process;"));
        assert!(tb.contains("readline(input, command_line);"));
        assert!(tb.contains("read(command_line, step_delta_ns);"));
        assert!(tb.contains("target_time := command_start_time + step_delta_ns * 1 ns;"));
        assert!(tb.contains("event_time := command_start_time + event_delta_ns * 1 ns;"));
        assert!(tb.contains("when 0 =>"));
        assert!(tb.contains("report \"LB_SIGNAL LED=\""));
        assert!(tb.contains("report \"LB_DONE\";"));
    }

    #[test]
    fn groups_reported_values_by_sample_marker() {
        let lines = vec![
            "logicboard_tb.vhd:18:5:@10ns:(report note): LB_SAMPLE 10".to_owned(),
            "logicboard_tb.vhd:19:5:@10ns:(report note): LB_SIGNAL LED='0'".to_owned(),
            "logicboard_tb.vhd:18:5:@20ns:(report note): LB_SAMPLE 20".to_owned(),
            "logicboard_tb.vhd:19:5:@20ns:(report note): LB_SIGNAL LED='1'".to_owned(),
        ];
        let (outputs, samples) = collect_samples(&lines);
        assert_eq!(outputs.get("LED"), Some(&true));
        assert_eq!(samples.len(), 2);
        assert_eq!(samples[0].time_ns, 10);
        assert_eq!(samples[0].outputs.get("LED"), Some(&false));
        assert_eq!(samples[1].time_ns, 20);
        assert_eq!(samples[1].outputs.get("LED"), Some(&true));
    }

    fn scalar_port(id: &str, direction: &str) -> VhdlPort {
        VhdlPort {
            id: id.into(),
            name: id.into(),
            direction: direction.into(),
            ty: "std_logic".into(),
            bit: None,
        }
    }

    fn vector_ports(name: &str, direction: &str, width: i32) -> Vec<VhdlPort> {
        (0..width)
            .map(|bit| VhdlPort {
                id: format!("{name}[{bit}]"),
                name: name.into(),
                direction: direction.into(),
                ty: format!("std_logic_vector({} downto 0)", width - 1),
                bit: Some(bit),
            })
            .collect()
    }

    fn timer_top_ports() -> Vec<VhdlPort> {
        let mut ports = vec![
            scalar_port("CLOCK_50", "in"),
            scalar_port("run_btn_n", "in"),
            scalar_port("reset_btn_n", "in"),
            scalar_port("mode_btn_n", "in"),
            scalar_port("increment_btn_n", "in"),
            scalar_port("count_down", "in"),
        ];
        for name in ["HEX0", "HEX1", "HEX2", "HEX3"] {
            ports.extend(vector_ports(name, "out", 7));
        }
        ports.extend(vector_ports("LEDG", "out", 8));
        ports.extend(vector_ports("LEDR", "out", 10));
        ports
    }

    #[test]
    fn simulates_timer_top_with_1khz_test_constant_when_ghdl_is_available() {
        if ghdl_command().arg("--version").output().is_err() {
            eprintln!("Skipping timer_top simulation test because ghdl is not available.");
            return;
        }

        let source = include_str!("../../src/fixtures/timer_top.vhd").replace(
            "constant CLOCK_FREQ_HZ                : natural := 50_000_000;",
            "constant CLOCK_FREQ_HZ                : natural := 1_000;",
        );
        let mut inputs = HashMap::new();
        for (id, value) in [
            ("CLOCK_50", false),
            ("run_btn_n", true),
            ("reset_btn_n", true),
            ("mode_btn_n", true),
            ("increment_btn_n", true),
            ("count_down", false),
        ] {
            inputs.insert(id.into(), value);
        }

        let result = simulate_project(
            vec![VhdlSource {
                name: "timer_top.vhd".into(),
                content: source,
            }],
            "timer_top".into(),
            timer_top_ports(),
            inputs,
            vec![SimulationClock {
                port_id: "CLOCK_50".into(),
                half_period_ps: 500_000_000,
            }],
            vec![
                InputEvent {
                    time_ns: 100_000,
                    port_id: "run_btn_n".into(),
                    value: false,
                },
                InputEvent {
                    time_ns: 2_100_000,
                    port_id: "run_btn_n".into(),
                    value: true,
                },
            ],
            1_200_000_000,
            Some(1_200_000_000),
        )
        .expect("timer_top should compile and run with the 1 kHz test constant");

        assert_eq!(result.samples.len(), 1);
        assert_eq!(result.simulated_time_ns, 1_200_000_000);
        assert!(
            result
                .outputs
                .iter()
                .any(|(id, value)| id.starts_with("LEDG[") && *value),
            "expected the seconds display LEDs to change after run_btn_n starts the timer"
        );
    }

    #[test]
    fn keeps_state_across_persistent_session_steps_when_ghdl_is_available() {
        if ghdl_command().arg("--version").output().is_err() {
            eprintln!("Skipping persistent session test because ghdl is not available.");
            return;
        }

        let sessions = SimulationSessions::default();
        let ports = vec![
            scalar_port("CLOCK_50", "in"),
            scalar_port("run_btn_n", "in"),
            scalar_port("LED", "out"),
        ];
        let mut inputs = HashMap::new();
        inputs.insert("CLOCK_50".into(), false);
        inputs.insert("run_btn_n".into(), true);

        let started = start_simulation_session_inner(
            &sessions,
            vec![VhdlSource {
                name: "session_counter.vhd".into(),
                content: r#"
library ieee;
use ieee.std_logic_1164.all;

entity session_counter is
  port (
    CLOCK_50 : in std_logic;
    run_btn_n : in std_logic;
    LED : out std_logic
  );
end entity;

architecture rtl of session_counter is
  signal count : natural := 0;
begin
  process(CLOCK_50)
  begin
    if rising_edge(CLOCK_50) then
      if run_btn_n = '0' then
        count <= count + 1;
      end if;
    end if;
  end process;

  LED <= '1' when count >= 3 else '0';
end architecture;
"#
                .into(),
            }],
            "session_counter".into(),
            ports,
            inputs,
            vec![SimulationClock {
                port_id: "CLOCK_50".into(),
                half_period_ps: 500_000,
            }],
        )
        .expect("session should start");

        let first = step_simulation_session_inner(
            &sessions,
            started.session_id.clone(),
            1_600,
            vec![InputEvent {
                time_ns: 100,
                port_id: "run_btn_n".into(),
                value: false,
            }],
        )
        .expect("first persistent step should run");
        assert_eq!(first.outputs.get("LED"), Some(&false));

        let second =
            step_simulation_session_inner(&sessions, started.session_id.clone(), 3_600, vec![])
                .expect("second persistent step should keep previous input and counter state");
        assert_eq!(second.outputs.get("LED"), Some(&true));

        stop_simulation_session_inner(&sessions, started.session_id)
            .expect("session cleanup should succeed");
    }

    #[test]
    fn persistent_session_has_no_total_time_cap_when_ghdl_is_available() {
        if ghdl_command().arg("--version").output().is_err() {
            eprintln!("Skipping no-cap persistent session test because ghdl is not available.");
            return;
        }

        let sessions = SimulationSessions::default();
        let started = start_simulation_session_inner(
            &sessions,
            vec![VhdlSource {
                name: "long_running_counter.vhd".into(),
                content: r#"
library ieee;
use ieee.std_logic_1164.all;

entity long_running_counter is
  port (
    CLOCK_50 : in std_logic;
    LED : out std_logic
  );
end entity;

architecture rtl of long_running_counter is
  signal count : natural := 0;
begin
  process(CLOCK_50)
  begin
    if rising_edge(CLOCK_50) then
      count <= count + 1;
    end if;
  end process;

  LED <= '1' when count >= 100 else '0';
end architecture;
"#
                .into(),
            }],
            "long_running_counter".into(),
            vec![scalar_port("CLOCK_50", "in"), scalar_port("LED", "out")],
            HashMap::new(),
            vec![SimulationClock {
                port_id: "CLOCK_50".into(),
                half_period_ps: 500_000_000,
            }],
        )
        .expect("session should start");

        let target_time_ns = 120_000_000_000;
        let mut current_time_ns = 0;
        while current_time_ns < target_time_ns {
            let result = step_simulation_session_inner(
                &sessions,
                started.session_id.clone(),
                target_time_ns,
                Vec::new(),
            )
            .expect("persistent session should keep advancing beyond 8 seconds");
            assert!(result.simulated_time_ns > current_time_ns);
            assert!(result.simulated_time_ns <= target_time_ns);
            current_time_ns = result.simulated_time_ns;
        }

        assert_eq!(current_time_ns, target_time_ns);
        let final_sample =
            step_simulation_session_inner(&sessions, started.session_id.clone(), target_time_ns, Vec::new())
                .expect("session should remain alive after long run");
        assert_eq!(final_sample.outputs.get("LED"), Some(&true));
        stop_simulation_session_inner(&sessions, started.session_id)
            .expect("session cleanup should succeed");
    }
}
