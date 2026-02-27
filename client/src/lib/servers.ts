import { invoke } from '@tauri-apps/api/core';

export interface ProjectConfig {
  name: string;
  cwd: string;
  command: string;
  args: string[];
  port: number;
  default_port: number;        // original port before user override
  extra_ports: number[];       // additional ports from dexhub.ports in package.json
  icon_path: string | null;
  icon_data: string | null;    // data:image/png;base64,… for webview display
  workspace: string;           // parent dir name for grouping
}

// ─── Core project/server commands ────────────────────────────────────────────

export const listProjects = (): Promise<ProjectConfig[]> =>
  invoke('list_projects');

export const getRunningServers = (): Promise<string[]> =>
  invoke('get_running_servers');

export const startServer = (name: string): Promise<void> =>
  invoke('start_server_cmd', { name });

export const stopServer = (name: string): Promise<void> =>
  invoke('stop_server_cmd', { name });

export const restartServer = (name: string): Promise<void> =>
  invoke('restart_server_cmd', { name });

export const stopAllServers = (): Promise<void> =>
  invoke('stop_all_servers_cmd');

export const updateServerPort = (name: string, port: number): Promise<void> =>
  invoke('update_server_port', { name, port });

export const openTerminalHere = (name: string): Promise<void> =>
  invoke('open_terminal_here', { name });

export const getServerUrl = (name: string): Promise<string> =>
  invoke('get_server_url', { name });

export const checkServerHealth = (name: string): Promise<boolean> =>
  invoke('check_server_health', { name });

// ─── Health & diagnostics ────────────────────────────────────────────────────

/** Last measured TCP connect latency in ms (populated by checkServerHealth) */
export const getServerLatency = (name: string): Promise<number | null> =>
  invoke('get_server_latency', { name });

/** Seconds since the server was started by DexHub (null if not running) */
export const getServerUptime = (name: string): Promise<number | null> =>
  invoke('get_server_uptime', { name });

/** Captured stdout/stderr lines (last 500) — available even after crash */
export const getServerLogs = (name: string): Promise<string[]> =>
  invoke('get_server_logs', { name });

// ─── Network / Tailscale ─────────────────────────────────────────────────────

export const getTailscaleAddress = (): Promise<string> =>
  invoke('get_tailscale_address');

/** Scan well-known dev ports for servers not managed by DexHub */
export const scanExternalServers = (): Promise<number[]> =>
  invoke('scan_external_servers');

// ─── Favorites ───────────────────────────────────────────────────────────────

export const getFavoritesFromRust = (): Promise<string[]> =>
  invoke('get_favorites');

export const saveFavoritesToRust = (names: string[]): Promise<void> =>
  invoke('set_favorites', { names });

// ─── Projects ────────────────────────────────────────────────────────────────

export const refreshProjects = (): Promise<ProjectConfig[]> =>
  invoke('refresh_projects_cmd');

/** Return first ~8 lines of the project README.md, or null if none exists */
export const getProjectReadme = (name: string): Promise<string | null> =>
  invoke('get_project_readme', { name });

// ─── Env overrides ───────────────────────────────────────────────────────────

export const getEnvOverrides = (name: string): Promise<Record<string, string>> =>
  invoke('get_env_overrides', { name });

export const setEnvOverrides = (name: string, vars: Record<string, string>): Promise<void> =>
  invoke('set_env_overrides', { name, vars });

// ─── Window ──────────────────────────────────────────────────────────────────

export const setPin = (pinned: boolean): Promise<void> =>
  invoke('set_pin', { pinned });

// ─── Autostart ───────────────────────────────────────────────────────────────

export const getAutostartEnabled = (): Promise<boolean> =>
  invoke('get_autostart_enabled');

export const setAutostartEnabled = (enabled: boolean): Promise<void> =>
  invoke('set_autostart_enabled', { enabled });
