import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  listProjects,
  getRunningServers,
  startServer,
  stopServer,
  stopAllServers,
  updateServerPort,
  openTerminalHere,
  getServerUrl,
  checkServerHealth,
  getTailscaleAddress,
  getFavoritesFromRust,
  saveFavoritesToRust,
  refreshProjects,
} from './servers';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('servers.ts — invoke wrappers', () => {
  describe('listProjects', () => {
    it('calls list_projects with no extra args', async () => {
      mockInvoke.mockResolvedValue([]);
      await listProjects();
      expect(mockInvoke).toHaveBeenCalledWith('list_projects');
    });

    it('returns the resolved project array', async () => {
      const projects = [
        { name: 'my-app', cwd: '/tmp/my-app', command: 'npm', args: ['run', 'dev'],
          port: 5173, icon_path: null, icon_data: null, workspace: 'Root' },
      ];
      mockInvoke.mockResolvedValue(projects);
      const result = await listProjects();
      expect(result).toEqual(projects);
    });
  });

  describe('getRunningServers', () => {
    it('calls get_running_servers', async () => {
      mockInvoke.mockResolvedValue([]);
      await getRunningServers();
      expect(mockInvoke).toHaveBeenCalledWith('get_running_servers');
    });

    it('returns running server names', async () => {
      mockInvoke.mockResolvedValue(['app-a', 'app-b']);
      expect(await getRunningServers()).toEqual(['app-a', 'app-b']);
    });
  });

  describe('startServer', () => {
    it('calls start_server_cmd with { name }', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await startServer('my-app');
      expect(mockInvoke).toHaveBeenCalledWith('start_server_cmd', { name: 'my-app' });
    });
  });

  describe('stopServer', () => {
    it('calls stop_server_cmd with { name }', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await stopServer('my-app');
      expect(mockInvoke).toHaveBeenCalledWith('stop_server_cmd', { name: 'my-app' });
    });
  });

  describe('stopAllServers', () => {
    it('calls stop_all_servers_cmd with no args', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await stopAllServers();
      expect(mockInvoke).toHaveBeenCalledWith('stop_all_servers_cmd');
    });
  });

  describe('updateServerPort', () => {
    it('calls update_server_port with { name, port }', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await updateServerPort('my-app', 3000);
      expect(mockInvoke).toHaveBeenCalledWith('update_server_port', { name: 'my-app', port: 3000 });
    });
  });

  describe('openTerminalHere', () => {
    it('calls open_terminal_here with { name }', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await openTerminalHere('my-app');
      expect(mockInvoke).toHaveBeenCalledWith('open_terminal_here', { name: 'my-app' });
    });
  });

  describe('getServerUrl', () => {
    it('calls get_server_url with { name }', async () => {
      mockInvoke.mockResolvedValue('http://example.ts.net:5173');
      const url = await getServerUrl('my-app');
      expect(mockInvoke).toHaveBeenCalledWith('get_server_url', { name: 'my-app' });
      expect(url).toBe('http://example.ts.net:5173');
    });
  });

  describe('checkServerHealth', () => {
    it('calls check_server_health with { name } and returns boolean', async () => {
      mockInvoke.mockResolvedValue(true);
      const result = await checkServerHealth('my-app');
      expect(mockInvoke).toHaveBeenCalledWith('check_server_health', { name: 'my-app' });
      expect(result).toBe(true);
    });
  });

  describe('getTailscaleAddress', () => {
    it('calls get_tailscale_address with no args', async () => {
      mockInvoke.mockResolvedValue('andrews-macbook-air.tailafb7e8.ts.net');
      const addr = await getTailscaleAddress();
      expect(mockInvoke).toHaveBeenCalledWith('get_tailscale_address');
      expect(addr).toBe('andrews-macbook-air.tailafb7e8.ts.net');
    });
  });

  describe('getFavoritesFromRust', () => {
    it('calls get_favorites', async () => {
      mockInvoke.mockResolvedValue(['app-a']);
      const favs = await getFavoritesFromRust();
      expect(mockInvoke).toHaveBeenCalledWith('get_favorites');
      expect(favs).toEqual(['app-a']);
    });
  });

  describe('saveFavoritesToRust', () => {
    it('calls set_favorites with { names }', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await saveFavoritesToRust(['app-a', 'app-b']);
      expect(mockInvoke).toHaveBeenCalledWith('set_favorites', { names: ['app-a', 'app-b'] });
    });
  });

  describe('refreshProjects', () => {
    it('calls refresh_projects_cmd', async () => {
      mockInvoke.mockResolvedValue([]);
      await refreshProjects();
      expect(mockInvoke).toHaveBeenCalledWith('refresh_projects_cmd');
    });
  });
});
