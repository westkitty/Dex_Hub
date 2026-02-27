import { invoke } from '@tauri-apps/api/core';

export interface ProjectConfig {
  name: string;
  cwd: string;
  command: string;
  args: string[];
  port: number;
  icon_path: string | null;
  icon_data: string | null;  // data:image/png;base64,… for webview display
  workspace: string;          // parent dir name for grouping
}

export const listProjects = (): Promise<ProjectConfig[]> =>
  invoke('list_projects');

export const getRunningServers = (): Promise<string[]> =>
  invoke('get_running_servers');

export const startServer = (name: string): Promise<void> =>
  invoke('start_server_cmd', { name });

export const stopServer = (name: string): Promise<void> =>
  invoke('stop_server_cmd', { name });

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

export const getTailscaleAddress = (): Promise<string> =>
  invoke('get_tailscale_address');

export const getFavoritesFromRust = (): Promise<string[]> =>
  invoke('get_favorites');

export const saveFavoritesToRust = (names: string[]): Promise<void> =>
  invoke('set_favorites', { names });

export const refreshProjects = (): Promise<ProjectConfig[]> =>
  invoke('refresh_projects_cmd');
