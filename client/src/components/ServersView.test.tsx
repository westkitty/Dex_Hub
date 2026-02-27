import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { ServersView } from './ServersView';
import type { ProjectConfig } from '../lib/servers';

const mockInvoke = vi.mocked(invoke);

const makeProject = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  name: 'test-app',
  cwd: '/Users/andrew/Projects/test-app',
  command: 'npm',
  args: ['run', 'dev'],
  port: 5173,
  default_port: 5173,
  extra_ports: [],
  icon_path: null,
  icon_data: null,
  workspace: 'Root',
  ...overrides,
});

function setupDefaultMocks(projects: ProjectConfig[] = []) {
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case 'list_projects':         return Promise.resolve(projects);
      case 'get_running_servers':   return Promise.resolve([]);
      case 'get_favorites':         return Promise.resolve([]);
      case 'get_tailscale_address': return Promise.resolve('localhost');
      case 'check_server_health':   return Promise.resolve(false);
      case 'scan_external_servers':   return Promise.resolve([]);
      case 'get_autostart_enabled':   return Promise.resolve(false);
      case 'get_server_logs':         return Promise.resolve([]);
      case 'get_server_uptime':       return Promise.resolve(null);
      case 'get_server_latency':      return Promise.resolve(null);
      case 'get_env_overrides':       return Promise.resolve({});
      case 'get_project_readme':      return Promise.resolve(null);
      case 'restart_server_cmd':      return Promise.resolve(undefined);
      default:                        return Promise.resolve(undefined);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear sessionStorage so search state doesn't leak between tests
  sessionStorage.clear();
  setupDefaultMocks();
});

// Flush pending microtasks so React state updates from async effects apply
async function flushAll() {
  await act(async () => { await Promise.resolve(); });
}

describe('ServersView', () => {
  describe('initial render', () => {
    it('shows search bar', async () => {
      render(<ServersView />);
      await flushAll();
      expect(screen.getByPlaceholderText('Search servers…')).toBeInTheDocument();
    });

    it('shows Tailscale offline when host is localhost', async () => {
      render(<ServersView />);
      await flushAll();
      expect(screen.getByText("localhost")).toBeInTheDocument();
    });

    it('shows Tailscale hostname when connected', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_tailscale_address') return Promise.resolve('host.tailnet.ts.net');
        if (cmd === 'list_projects') return Promise.resolve([]);
        if (cmd === 'get_running_servers') return Promise.resolve([]);
        if (cmd === 'get_favorites') return Promise.resolve([]);
        return Promise.resolve(false);
      });
      render(<ServersView />);
      await flushAll();
      await waitFor(() => {
        expect(screen.getByText('host.tailnet.ts.net')).toBeInTheDocument();
      });
    });

    it('shows empty state when no projects', async () => {
      render(<ServersView />);
      await flushAll();
      await waitFor(() => {
        expect(screen.getByText(/No projects found/i)).toBeInTheDocument();
      });
    });
  });

  describe('project listing', () => {
    it('renders a project card', async () => {
      setupDefaultMocks([makeProject({ name: 'my-project' })]);
      render(<ServersView />);
      await flushAll();
      await waitFor(() => {
        expect(screen.getByText('my-project')).toBeInTheDocument();
      });
    });

    it('groups projects by workspace', async () => {
      setupDefaultMocks([
        makeProject({ name: 'app-a', workspace: 'Root' }),
        makeProject({ name: 'app-b', workspace: 'Workspace1' }),
      ]);
      render(<ServersView />);
      await flushAll();
      await waitFor(() => {
        // Section headings are rendered with uppercase CSS but DOM text is original case.
        // Each workspace name appears both as a heading and as a card subtitle, so use getAllByText.
        expect(screen.getAllByText('Root').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Workspace1').length).toBeGreaterThan(0);
      });
    });

    it('shows favorites section when favorites exist', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'list_projects') return Promise.resolve([makeProject({ name: 'fav-app' })]);
        if (cmd === 'get_favorites') return Promise.resolve(['fav-app']);
        if (cmd === 'get_running_servers') return Promise.resolve([]);
        if (cmd === 'get_tailscale_address') return Promise.resolve('localhost');
        return Promise.resolve(false);
      });
      render(<ServersView />);
      await flushAll();
      await waitFor(() => {
        expect(screen.getByText('Favorites')).toBeInTheDocument();
      });
    });
  });

  describe('search', () => {
    it('filters projects by search query', async () => {
      setupDefaultMocks([
        makeProject({ name: 'alpha-app' }),
        makeProject({ name: 'beta-server' }),
      ]);
      render(<ServersView />);
      await flushAll();
      await waitFor(() => { expect(screen.getByText('alpha-app')).toBeInTheDocument(); });

      fireEvent.change(screen.getByPlaceholderText('Search servers…'), {
        target: { value: 'alpha' },
      });

      expect(screen.getByText('alpha-app')).toBeInTheDocument();
      expect(screen.queryByText('beta-server')).not.toBeInTheDocument();
    });

    it('shows "no match" message when search finds nothing', async () => {
      setupDefaultMocks([makeProject({ name: 'alpha-app' })]);
      render(<ServersView />);
      await flushAll();
      await waitFor(() => { expect(screen.getByText('alpha-app')).toBeInTheDocument(); });

      fireEvent.change(screen.getByPlaceholderText('Search servers…'), {
        target: { value: 'zzz' },
      });
      expect(screen.getByText(/No servers match your search/i)).toBeInTheDocument();
    });
  });

  describe('toolbar actions', () => {
    it('Stop All button is disabled when nothing running', async () => {
      render(<ServersView />);
      await flushAll();
      const stopAll = screen.getByTitle('Stop all servers');
      expect(stopAll).toBeDisabled();
    });

    it('Refresh button calls refresh_projects_cmd', async () => {
      mockInvoke.mockResolvedValue([]);
      render(<ServersView />);
      await flushAll();

      fireEvent.click(screen.getByTitle('Refresh projects (⌘R)'));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('refresh_projects_cmd');
      });
    });

    it('toggles between grid and compact view', async () => {
      setupDefaultMocks([makeProject()]);
      render(<ServersView />);
      await flushAll();
      await waitFor(() => { expect(screen.getByText('test-app')).toBeInTheDocument(); });

      const toggleBtn = screen.getByTitle('Compact list view');
      fireEvent.click(toggleBtn);
      // After toggle, title changes
      expect(screen.getByTitle('Grid view')).toBeInTheDocument();
    });
  });

  describe('QR modal', () => {
    it('closes QR modal on dismiss', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'list_projects') return Promise.resolve([makeProject()]);
        if (cmd === 'get_running_servers') return Promise.resolve(['test-app']);
        if (cmd === 'get_favorites') return Promise.resolve([]);
        if (cmd === 'get_tailscale_address') return Promise.resolve('localhost');
        if (cmd === 'check_server_health') return Promise.resolve(true);
        if (cmd === 'get_server_url') return Promise.resolve('http://localhost:5173');
        if (cmd === 'scan_external_servers') return Promise.resolve([]);
        return Promise.resolve(undefined);
      });
      render(<ServersView />);
      await flushAll();
      await waitFor(() => { expect(screen.getByText('QR')).toBeInTheDocument(); });

      fireEvent.click(screen.getByText('QR'));
      await waitFor(() => { expect(screen.getByText('Dismiss')).toBeInTheDocument(); });
      fireEvent.click(screen.getByText('Dismiss'));
      expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });
  });

  describe('running count', () => {
    it('shows running count in tailscale bar', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'list_projects') return Promise.resolve([makeProject()]);
        if (cmd === 'get_running_servers') return Promise.resolve(['test-app']);
        if (cmd === 'get_favorites') return Promise.resolve([]);
        if (cmd === 'get_tailscale_address') return Promise.resolve('localhost');
        if (cmd === 'check_server_health') return Promise.resolve(true);
        if (cmd === 'scan_external_servers') return Promise.resolve([]);
        return Promise.resolve(undefined);
      });
      render(<ServersView />);
      await flushAll();
      await waitFor(() => {
        expect(screen.getByText('1 running')).toBeInTheDocument();
      });
    });
  });
});
