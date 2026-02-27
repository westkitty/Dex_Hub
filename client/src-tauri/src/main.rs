use base64::{engine::general_purpose, Engine as _};
use std::collections::HashMap;
use std::net::TcpStream;
use std::path::Path;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{IconMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_positioner::Position;
use walkdir::WalkDir;

const PROJECTS_DIR: &str = "/Users/andrew/Projects";

// ─── Project / Server State ───────────────────────────────────────────────────

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct ProjectConfig {
    name: String,
    cwd: String,
    command: String,
    args: Vec<String>,
    port: u16,
    icon_path: Option<String>,
    icon_data: Option<String>,
    workspace: String,
}

struct ServerState {
    processes: Mutex<HashMap<String, Child>>,
    projects: Mutex<Vec<ProjectConfig>>,
    tailscale_host: String,
}

struct TrayHandle(Mutex<Option<tauri::tray::TrayIcon<tauri::Wry>>>);

// ─── Tailscale Detection ──────────────────────────────────────────────────────

fn get_tailscale_host() -> String {
    if let Ok(output) = std::process::Command::new("tailscale")
        .args(["status", "--json"])
        .output()
    {
        if let Ok(text) = String::from_utf8(output.stdout) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(dns) = val["Self"]["DNSName"].as_str() {
                    let host = dns.trim_end_matches('.');
                    if !host.is_empty() {
                        return host.to_string();
                    }
                }
            }
        }
    }
    if let Ok(output) = std::process::Command::new("tailscale")
        .args(["ip", "-4"])
        .output()
    {
        let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !ip.is_empty() {
            return ip;
        }
    }
    "localhost".to_string()
}

// ─── Port Extraction ──────────────────────────────────────────────────────────

fn extract_port_after(text: &str, key: &str) -> Option<u16> {
    let idx = text.find(key)?;
    let after = text[idx + key.len()..]
        .trim_start_matches(|c: char| c == ':' || c.is_whitespace());
    let end = after
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(after.len());
    if end == 0 {
        return None;
    }
    after[..end].parse().ok()
}

fn extract_port(project_dir: &Path) -> u16 {
    for cfg in &["vite.config.ts", "vite.config.js", "vite.config.mts"] {
        if let Ok(content) = std::fs::read_to_string(project_dir.join(cfg)) {
            if let Some(p) = extract_port_after(&content, "port:") {
                return p;
            }
        }
    }
    if let Ok(content) = std::fs::read_to_string(project_dir.join("package.json")) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(script) = val["scripts"]["dev"].as_str() {
                if let Some(p) = extract_port_after(script, "--port") {
                    return p;
                }
            }
        }
    }
    5173
}

// ─── Workspace Extraction ─────────────────────────────────────────────────────

fn extract_workspace(cwd: &str) -> String {
    let base = PROJECTS_DIR.trim_end_matches('/');
    let rest = cwd
        .strip_prefix(base)
        .unwrap_or("")
        .trim_start_matches('/');
    let parts: Vec<&str> = rest.splitn(2, '/').collect();
    if parts.len() >= 2 && !parts[1].is_empty() {
        parts[0].to_string()
    } else {
        "Root".to_string()
    }
}

// ─── Icon Helpers ─────────────────────────────────────────────────────────────

fn load_icon_image(path: &str) -> Option<tauri::image::Image<'static>> {
    let img = image::open(path).ok()?.to_rgba8();
    let (w, h) = img.dimensions();
    Some(tauri::image::Image::new_owned(img.into_raw(), w, h))
}

fn icon_to_base64(path: &str) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(&data)
    ))
}

fn find_icon(project_dir: &Path) -> Option<String> {
    let candidates = [
        "public/icon.png",
        "public/icons/icon-192.png",
        "assets/icon.png",
        "icon.png",
    ];
    for candidate in &candidates {
        let p = project_dir.join(candidate);
        if p.exists() {
            return Some(p.to_string_lossy().into_owned());
        }
    }
    if let Ok(entries) = std::fs::read_dir(project_dir.join("public")) {
        let mut logos: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let n = e.file_name();
                let s = n.to_string_lossy();
                s.ends_with("Logo.png") && !s.contains("vite") && !s.contains("react")
            })
            .map(|e| e.path().to_string_lossy().into_owned())
            .collect();
        logos.sort();
        if let Some(p) = logos.into_iter().next() {
            return Some(p);
        }
    }
    None
}

// ─── Port Override Helpers ────────────────────────────────────────────────────

fn port_overrides_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join("port_overrides.json")
}

fn load_port_overrides(app_data_dir: &Path) -> HashMap<String, u16> {
    let path = port_overrides_path(app_data_dir);
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, u16>>(&content) {
            return map;
        }
    }
    HashMap::new()
}

fn save_port_overrides(app_data_dir: &Path, overrides: &HashMap<String, u16>) {
    let _ = std::fs::create_dir_all(app_data_dir);
    if let Ok(json) = serde_json::to_string_pretty(overrides) {
        let _ = std::fs::write(port_overrides_path(app_data_dir), json);
    }
}

// ─── Favorites Helpers ────────────────────────────────────────────────────────

fn favorites_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join("favorites.json")
}

fn load_favorites_from_disk(app_data_dir: &Path) -> Vec<String> {
    let path = favorites_path(app_data_dir);
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&content) {
            return list;
        }
    }
    Vec::new()
}

fn save_favorites_to_disk(app_data_dir: &Path, names: &[String]) {
    let _ = std::fs::create_dir_all(app_data_dir);
    if let Ok(json) = serde_json::to_string_pretty(names) {
        let _ = std::fs::write(favorites_path(app_data_dir), json);
    }
}

// ─── Project Scanner ──────────────────────────────────────────────────────────

fn scan_projects(base_dir: &Path, port_overrides: &HashMap<String, u16>) -> Vec<ProjectConfig> {
    let mut projects = Vec::new();

    let walker = WalkDir::new(base_dir)
        .min_depth(1)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let s = e.path().to_string_lossy();
            !s.contains("node_modules")
                && !s.contains("/.git")
                && !s.contains("/.cache")
                && !s.contains("/.claude")
                && !s.contains("/dist/")
                && !s.contains("/build/")
                && !s.contains("/.next")
                && !s.contains("/target/")
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_name() != "package.json" {
            continue;
        }

        let pkg_path = entry.path();
        let project_dir = match pkg_path.parent() {
            Some(d) => d,
            None => continue,
        };

        // Skip Tauri apps — launching them as a dev server would conflict with the host app
        if project_dir
            .join("src-tauri")
            .join("tauri.conf.json")
            .exists()
        {
            continue;
        }

        let content = match std::fs::read_to_string(pkg_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let val: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let dev_script = match val["scripts"]["dev"].as_str() {
            Some(s) if !s.trim().is_empty() => s.to_string(),
            _ => continue,
        };

        let name = val["name"]
            .as_str()
            .unwrap_or_else(|| {
                project_dir
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
            })
            .to_string();

        if name.trim().is_empty() {
            continue;
        }

        let (command, args) = if dev_script.trim_start().starts_with("pnpm") {
            let rest = dev_script.trim_start_matches("pnpm").trim().to_string();
            let pnpm_args: Vec<String> = if rest.is_empty() {
                vec!["dev".to_string()]
            } else {
                rest.split_whitespace().map(|s| s.to_string()).collect()
            };
            ("pnpm".to_string(), pnpm_args)
        } else {
            ("npm".to_string(), vec!["run".to_string(), "dev".to_string()])
        };

        let mut port = extract_port(project_dir);
        if let Some(&override_port) = port_overrides.get(&name) {
            port = override_port;
        }

        let icon_path = find_icon(project_dir);
        let icon_data = icon_path.as_ref().and_then(|p| icon_to_base64(p));
        let workspace = extract_workspace(&project_dir.to_string_lossy());

        projects.push(ProjectConfig {
            name,
            cwd: project_dir.to_string_lossy().into_owned(),
            command,
            args,
            port,
            icon_path,
            icon_data,
            workspace,
        });
    }

    projects.sort_by(|a, b| a.name.cmp(&b.name));
    projects
}

// ─── Tray Menu Builder ────────────────────────────────────────────────────────

fn build_tray_menu<M: tauri::Manager<tauri::Wry>>(
    manager: &M,
    projects: &[ProjectConfig],
    running_names: &[String],
    tailscale_host: &str,
) -> Menu<tauri::Wry> {
    let menu = Menu::new(manager).expect("menu");
    menu.append(&PredefinedMenuItem::separator(manager).expect("sep")).ok();
    menu.append(
        &MenuItem::with_id(manager, "_header_", "─── Servers ───", false, None::<&str>)
            .expect("header"),
    )
    .ok();

    for project in projects {
        let is_running = running_names.iter().any(|n| n == &project.name);
        if is_running {
            let url = format!("http://{}:{}", tailscale_host, project.port);
            let label = format!("● {}", project.name);
            let sub = Submenu::new(manager, &label, true).expect("submenu");
            sub.append(
                &MenuItem::with_id(
                    manager,
                    format!("open__{}", project.name),
                    "Open in Browser",
                    true,
                    None::<&str>,
                )
                .expect("open"),
            )
            .ok();
            sub.append(
                &MenuItem::with_id(
                    manager,
                    format!("url__{}", project.name),
                    &url,
                    true,
                    None::<&str>,
                )
                .expect("url"),
            )
            .ok();
            sub.append(
                &MenuItem::with_id(
                    manager,
                    format!("stop__{}", project.name),
                    "Stop",
                    true,
                    None::<&str>,
                )
                .expect("stop"),
            )
            .ok();
            menu.append(&sub).ok();
        } else {
            let start_id = format!("start__{}", project.name);
            let mut added = false;
            if let Some(icon_path) = &project.icon_path {
                if let Some(icon) = load_icon_image(icon_path) {
                    if let Ok(item) = IconMenuItem::with_id(
                        manager,
                        &start_id,
                        &project.name,
                        true,
                        Some(icon),
                        None::<&str>,
                    ) {
                        menu.append(&item).ok();
                        added = true;
                    }
                }
            }
            if !added {
                menu.append(
                    &MenuItem::with_id(manager, &start_id, &project.name, true, None::<&str>)
                        .expect("start"),
                )
                .ok();
            }
        }
    }

    menu.append(&PredefinedMenuItem::separator(manager).expect("sep")).ok();
    menu.append(
        &MenuItem::with_id(manager, "refresh", "Refresh", true, None::<&str>).expect("refresh"),
    )
    .ok();
    menu.append(&PredefinedMenuItem::separator(manager).expect("sep")).ok();
    menu.append(
        &MenuItem::with_id(manager, "quit", "Quit DexHub", true, None::<&str>).expect("quit"),
    )
    .ok();
    menu
}

fn rebuild_tray(app: &tauri::AppHandle) {
    let server_state = app.state::<ServerState>();
    let tray_handle = app.state::<TrayHandle>();
    let running: Vec<String> = server_state
        .processes
        .lock()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    let projects: Vec<ProjectConfig> = server_state.projects.lock().unwrap().clone();
    let ts_host = server_state.tailscale_host.clone();
    let new_menu = build_tray_menu(app, &projects, &running, &ts_host);
    let guard = tray_handle.0.lock().unwrap();
    if let Some(tray) = guard.as_ref() {
        let _ = tray.set_menu(Some(new_menu));
    }
}

// ─── Menu Event Handler ───────────────────────────────────────────────────────

fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    if id == "quit" {
        let state = app.state::<ServerState>();
        let mut procs = state.processes.lock().unwrap();
        for (_, child) in procs.iter_mut() {
            let _ = child.kill();
        }
        drop(procs);
        app.exit(0);
    } else if id == "refresh" {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"));
        let overrides = load_port_overrides(&app_data_dir);
        let state = app.state::<ServerState>();
        *state.projects.lock().unwrap() =
            scan_projects(Path::new(PROJECTS_DIR), &overrides);
        rebuild_tray(app);
    } else if let Some(name) = id.strip_prefix("start__") {
        start_server(app, name.to_string());
    } else if let Some(name) = id.strip_prefix("stop__") {
        stop_server(app, name.to_string());
    } else if let Some(name) = id.strip_prefix("open__") {
        open_in_browser(app, name.to_string());
    } else if let Some(name) = id.strip_prefix("url__") {
        copy_url(app, name.to_string());
    }
}

fn start_server(app: &tauri::AppHandle, name: String) {
    let state = app.state::<ServerState>();
    let projects = state.projects.lock().unwrap().clone();
    let project = match projects.iter().find(|p| p.name == name) {
        Some(p) => p.clone(),
        None => return,
    };
    let cmd_str = format!("{} {}", project.command, project.args.join(" "));
    match std::process::Command::new("/bin/zsh")
        .args(["-lc", &cmd_str])
        .current_dir(&project.cwd)
        .spawn()
    {
        Ok(child) => {
            state.processes.lock().unwrap().insert(name, child);
            rebuild_tray(app);
        }
        Err(e) => eprintln!("[DexHub] Failed to start '{}': {}", name, e),
    }
}

fn stop_server(app: &tauri::AppHandle, name: String) {
    let state = app.state::<ServerState>();
    if let Some(mut child) = state.processes.lock().unwrap().remove(&name) {
        let _ = child.kill();
    }
    rebuild_tray(app);
}

fn open_in_browser(app: &tauri::AppHandle, name: String) {
    let state = app.state::<ServerState>();
    let projects = state.projects.lock().unwrap().clone();
    if let Some(project) = projects.iter().find(|p| p.name == name) {
        let url = format!("http://{}:{}", state.tailscale_host, project.port);
        let _ = std::process::Command::new("open").arg(&url).spawn();
    }
}

fn copy_url(app: &tauri::AppHandle, name: String) {
    let state = app.state::<ServerState>();
    let projects = state.projects.lock().unwrap().clone();
    if let Some(project) = projects.iter().find(|p| p.name == name) {
        let url = format!("http://{}:{}", state.tailscale_host, project.port);
        let _ = std::process::Command::new("bash")
            .args(["-c", &format!("echo -n '{}' | pbcopy", url)])
            .spawn();
    }
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn list_projects(state: tauri::State<'_, ServerState>) -> Vec<ProjectConfig> {
    state.projects.lock().unwrap().clone()
}

#[tauri::command]
fn get_running_servers(app: tauri::AppHandle) -> Vec<String> {
    let state = app.state::<ServerState>();
    let (names, had_dead) = {
        let mut procs = state.processes.lock().unwrap();
        let before = procs.len();
        // Remove any processes that have already exited so crashed servers
        // don't stay stuck in the "starting" state indefinitely.
        procs.retain(|_, child| child.try_wait().map(|s| s.is_none()).unwrap_or(true));
        let had_dead = procs.len() < before;
        let names = procs.keys().cloned().collect::<Vec<String>>();
        (names, had_dead)
    };
    if had_dead {
        rebuild_tray(&app);
    }
    names
}

#[tauri::command]
fn start_server_cmd(app: tauri::AppHandle, name: String) -> Result<(), String> {
    start_server(&app, name);
    Ok(())
}

#[tauri::command]
fn stop_server_cmd(app: tauri::AppHandle, name: String) -> Result<(), String> {
    stop_server(&app, name);
    Ok(())
}

#[tauri::command]
fn stop_all_servers_cmd(app: tauri::AppHandle) -> Result<(), String> {
    {
        let state = app.state::<ServerState>();
        let mut procs = state.processes.lock().unwrap();
        for (_, child) in procs.iter_mut() {
            let _ = child.kill();
        }
        procs.clear();
    }
    rebuild_tray(&app);
    Ok(())
}

#[tauri::command]
fn update_server_port(app: tauri::AppHandle, name: String, port: u16) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut overrides = load_port_overrides(&app_data_dir);
    overrides.insert(name.clone(), port);
    save_port_overrides(&app_data_dir, &overrides);
    let state = app.state::<ServerState>();
    let mut projects = state.projects.lock().unwrap();
    if let Some(p) = projects.iter_mut().find(|p| p.name == name) {
        p.port = port;
    }
    Ok(())
}

#[tauri::command]
fn open_terminal_here(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let state = app.state::<ServerState>();
    let projects = state.projects.lock().unwrap().clone();
    if let Some(project) = projects.iter().find(|p| p.name == name) {
        std::process::Command::new("open")
            .args(["-a", "Terminal", &project.cwd])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_server_url(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let state = app.state::<ServerState>();
    let projects = state.projects.lock().unwrap().clone();
    match projects.iter().find(|p| p.name == name) {
        Some(project) => Ok(format!("http://{}:{}", state.tailscale_host, project.port)),
        None => Err(format!("Project '{}' not found", name)),
    }
}

#[tauri::command]
fn check_server_health(app: tauri::AppHandle, name: String) -> bool {
    let state = app.state::<ServerState>();
    let port = {
        let projects = state.projects.lock().unwrap();
        projects.iter().find(|p| p.name == name).map(|p| p.port)
    };
    port.map(|p| {
        TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], p)),
            Duration::from_millis(200),
        )
        .is_ok()
    })
    .unwrap_or(false)
}

#[tauri::command]
fn get_tailscale_address(state: tauri::State<'_, ServerState>) -> String {
    state.tailscale_host.clone()
}

#[tauri::command]
fn get_favorites(app: tauri::AppHandle) -> Vec<String> {
    match app.path().app_data_dir() {
        Ok(d) => load_favorites_from_disk(&d),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
fn set_favorites(app: tauri::AppHandle, names: Vec<String>) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    save_favorites_to_disk(&app_data_dir, &names);
    Ok(())
}

#[tauri::command]
fn refresh_projects_cmd(app: tauri::AppHandle) -> Vec<ProjectConfig> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"));
    let overrides = load_port_overrides(&app_data_dir);
    let new_projects = scan_projects(Path::new(PROJECTS_DIR), &overrides);
    {
        let state = app.state::<ServerState>();
        *state.projects.lock().unwrap() = new_projects.clone();
    }
    rebuild_tray(&app);
    new_projects
}

// ─── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_data_dir = app.path().app_data_dir().expect("path failed");
            let port_overrides = load_port_overrides(&app_data_dir);
            let tailscale_host = get_tailscale_host();
            let projects = scan_projects(Path::new(PROJECTS_DIR), &port_overrides);
            let initial_menu = build_tray_menu(app, &projects, &[], &tailscale_host);

            app.manage(ServerState {
                processes: Mutex::new(HashMap::new()),
                projects: Mutex::new(projects),
                tailscale_host,
            });

            let tray = TrayIconBuilder::new()
                .menu(&initial_menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app: &tauri::AppHandle, event: tauri::menu::MenuEvent| {
                    handle_menu_event(app, event.id().as_ref());
                })
                .on_tray_icon_event(
                    |tray: &tauri::tray::TrayIcon<tauri::Wry>, event: TrayIconEvent| {
                        tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            ..
                        } = event
                        {
                            if let Some(win) = tray.app_handle().get_webview_window("main") {
                                let _ = tauri_plugin_positioner::WindowExt::move_window(
                                    &win,
                                    Position::TrayCenter,
                                );
                                if win.is_visible().unwrap_or(false) {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        }
                    },
                )
                .build(app)?;

            app.manage(TrayHandle(Mutex::new(Some(tray))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            get_running_servers,
            start_server_cmd,
            stop_server_cmd,
            stop_all_servers_cmd,
            update_server_port,
            open_terminal_here,
            get_server_url,
            check_server_health,
            get_tailscale_address,
            get_favorites,
            set_favorites,
            refresh_projects_cmd,
        ])
        .build(tauri::generate_context!())
        .expect("error building tauri")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerState>() {
                    let mut procs = state.processes.lock().unwrap();
                    for (_, child) in procs.iter_mut() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
