import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import App from './App';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
  // Default mocks for ServersView (default view)
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case 'list_projects':         return Promise.resolve([]);
      case 'get_running_servers':   return Promise.resolve([]);
      case 'get_favorites':         return Promise.resolve([]);
      case 'get_tailscale_address': return Promise.resolve('localhost');
      case 'check_server_health':   return Promise.resolve(false);
      case 'get_cards':             return Promise.resolve('[]');
      case 'scan_external_servers': return Promise.resolve([]);
      case 'get_autostart_enabled': return Promise.resolve(false);
      case 'get_server_logs':       return Promise.resolve([]);
      case 'get_server_uptime':     return Promise.resolve(null);
      case 'get_server_latency':    return Promise.resolve(null);
      case 'get_env_overrides':     return Promise.resolve({});
      case 'get_project_readme':    return Promise.resolve(null);
      default:                      return Promise.resolve(undefined);
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  it('renders the sidebar', async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Dev Servers')).toBeInTheDocument();
    expect(screen.getByText('Omni-View')).toBeInTheDocument();
  });

  it('defaults to the Dev Servers view', async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByPlaceholderText('Search servers…')).toBeInTheDocument();
  });

  it('switches to kanban view when Omni-View is clicked', async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole('button', { name: /Omni-View/ }));
    await act(async () => { await Promise.resolve(); });

    // Kanban h2 heading confirms view switched
    expect(screen.getByRole('heading', { name: 'Omni-View' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search servers…')).not.toBeInTheDocument();
  });

  it('does not render MicrophoneButton in any view', async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    // MicrophoneButton has been removed — no microphone-related elements
    expect(document.querySelector('[data-testid="mic-button"]')).toBeNull();
  });

  it('switches back to servers view from kanban', async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole('button', { name: /Omni-View/ }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByPlaceholderText('Search servers…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Dev Servers/ }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByPlaceholderText('Search servers…')).toBeInTheDocument();
  });
});
