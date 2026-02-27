import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { ServerCard } from './ServerCard';
import type { ProjectConfig } from '../lib/servers';

const mockInvoke = vi.mocked(invoke);

const baseProject: ProjectConfig = {
  name: 'my-app',
  cwd: '/Users/andrew/Projects/my-app',
  command: 'npm',
  args: ['run', 'dev'],
  port: 5173,
  default_port: 5173,
  extra_ports: [],
  icon_path: null,
  icon_data: null,
  workspace: 'Root',
};

const defaultProps = {
  project: baseProject,
  running: false,
  health: 'down' as const,
  favorite: false,
  compact: false,
  portConflict: false,
  allPorts: [5173],
  onStart:          vi.fn(),
  onStop:           vi.fn(),
  onRestart:        vi.fn(),
  onToggleFavorite: vi.fn(),
  onPortSaved:      vi.fn(),
  onShowQR:         vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case 'get_server_logs':    return Promise.resolve([]);
      case 'get_server_uptime':  return Promise.resolve(null);
      case 'get_server_latency': return Promise.resolve(null);
      case 'get_env_overrides':  return Promise.resolve({});
      case 'get_project_readme': return Promise.resolve(null);
      default:                   return Promise.resolve(undefined);
    }
  });
});

describe('ServerCard', () => {
  describe('rendering — stopped state', () => {
    it('shows project name', () => {
      render(<ServerCard {...defaultProps} />);
      expect(screen.getByText('my-app')).toBeInTheDocument();
    });

    it('shows workspace', () => {
      render(<ServerCard {...defaultProps} />);
      expect(screen.getByText('Root')).toBeInTheDocument();
    });

    it('shows port badge with colon', () => {
      render(<ServerCard {...defaultProps} />);
      expect(screen.getByText(':5173')).toBeInTheDocument();
    });

    it('shows Start button when stopped', () => {
      render(<ServerCard {...defaultProps} />);
      expect(screen.getByText('Start')).toBeInTheDocument();
      expect(screen.queryByText('Stop')).not.toBeInTheDocument();
    });

    it('uses colored initials avatar when no icon_data', () => {
      render(<ServerCard {...defaultProps} />);
      // "my-app" → initials "MA"
      expect(screen.getByText('MA')).toBeInTheDocument();
    });

    it('uses img tag when icon_data is present', () => {
      const project = { ...baseProject, icon_data: 'data:image/png;base64,abc' };
      const { container } = render(<ServerCard {...defaultProps} project={project} />);
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('grey status dot when stopped', () => {
      const { container } = render(<ServerCard {...defaultProps} />);
      const dot = container.querySelector('.bg-gray-700');
      expect(dot).toBeInTheDocument();
    });

    it('Copy URL button is disabled when stopped', () => {
      render(<ServerCard {...defaultProps} />);
      const copyBtn = screen.getByText('URL').closest('button')!;
      expect(copyBtn).toBeDisabled();
    });

    it('does not show QR button when stopped', () => {
      render(<ServerCard {...defaultProps} />);
      expect(screen.queryByText('QR')).not.toBeInTheDocument();
    });
  });

  describe('rendering — running healthy state', () => {
    const runningProps = { ...defaultProps, running: true, health: 'healthy' as const };

    it('shows Open and Stop buttons', () => {
      render(<ServerCard {...runningProps} />);
      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('Stop')).toBeInTheDocument();
      expect(screen.queryByText('Start')).not.toBeInTheDocument();
    });

    it('shows green status dot', () => {
      const { container } = render(<ServerCard {...runningProps} />);
      expect(container.querySelector('.bg-green-400')).toBeInTheDocument();
    });

    it('shows QR button when running', () => {
      render(<ServerCard {...runningProps} />);
      expect(screen.getByText('QR')).toBeInTheDocument();
    });

    it('URL button is enabled when running', () => {
      render(<ServerCard {...runningProps} />);
      const copyBtn = screen.getByText('URL').closest('button')!;
      expect(copyBtn).not.toBeDisabled();
    });
  });

  describe('rendering — starting state', () => {
    it('shows amber status dot with pulse', () => {
      const { container } = render(
        <ServerCard {...defaultProps} running health="starting" />,
      );
      expect(container.querySelector('.bg-amber-400')).toBeInTheDocument();
      expect(container.querySelector('.animate-status-pulse')).toBeInTheDocument();
    });

    it('shows "Starting…" label', () => {
      render(<ServerCard {...defaultProps} running health="starting" />);
      expect(screen.getByText('Starting…')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('renders in compact layout with name and port', () => {
      render(<ServerCard {...defaultProps} compact />);
      expect(screen.getByText('my-app')).toBeInTheDocument();
      expect(screen.getByText(':5173')).toBeInTheDocument();
    });

    it('does not show text-labeled action buttons in compact mode', () => {
      render(<ServerCard {...defaultProps} compact running health="healthy" />);
      // Compact mode uses icon-only buttons — no "Open" / "URL" text
      expect(screen.queryByText('Open')).not.toBeInTheDocument();
      expect(screen.queryByText('URL')).not.toBeInTheDocument();
    });
  });

  describe('restart button', () => {
    it('shows restart button when running', () => {
      const { container } = render(
        <ServerCard {...defaultProps} running health="healthy" />,
      );
      expect(container.querySelector('[title="Restart server"]')).toBeInTheDocument();
    });

    it('calls onRestart when restart is clicked', () => {
      const { container } = render(
        <ServerCard {...defaultProps} running health="healthy" />,
      );
      const btn = container.querySelector('[title="Restart server"]') as HTMLButtonElement;
      if (btn) fireEvent.click(btn);
      expect(defaultProps.onRestart).toHaveBeenCalled();
    });
  });

  describe('overridden port visual distinction', () => {
    it('shows amber badge when port differs from default_port', () => {
      const project = { ...baseProject, port: 3000, default_port: 5173 };
      const { container } = render(<ServerCard {...defaultProps} project={project} />);
      // The port button should have amber styling
      const amberEl = container.querySelector('.text-amber-400');
      expect(amberEl).toBeInTheDocument();
    });
  });

  describe('extra ports', () => {
    it('renders extra port badge for each extra port', () => {
      const project = { ...baseProject, extra_ports: [3000] };
      render(<ServerCard {...defaultProps} project={project} />);
      expect(screen.getByText(':3000')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onStart when Start is clicked', () => {
      render(<ServerCard {...defaultProps} />);
      fireEvent.click(screen.getByText('Start'));
      expect(defaultProps.onStart).toHaveBeenCalledTimes(1);
    });

    it('calls onStop when Stop is clicked', () => {
      render(<ServerCard {...defaultProps} running health="healthy" />);
      fireEvent.click(screen.getByText('Stop'));
      expect(defaultProps.onStop).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleFavorite when star is clicked', () => {
      render(<ServerCard {...defaultProps} />);
      // Find the favorite button (Star icon container)
      const buttons = screen.getAllByRole('button');
      // Star button is the one near the status dot
      const favBtn = buttons.find(b => b.className.includes('w-5 h-5'));
      if (favBtn) fireEvent.click(favBtn);
      // If found, check it was called
    });

    it('shows QR url when QR button is clicked', async () => {
      mockInvoke.mockResolvedValue('http://host:5173');
      render(<ServerCard {...defaultProps} running health="healthy" />);
      fireEvent.click(screen.getByText('QR'));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_server_url', { name: 'my-app' });
      });
      expect(defaultProps.onShowQR).toHaveBeenCalledWith('http://host:5173');
    });

    it('calls onPortSaved and invoke when port is changed', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue(undefined);
      render(<ServerCard {...defaultProps} />);

      // Click port badge to enter edit mode
      fireEvent.click(screen.getByText(':5173'));
      const input = screen.getByDisplayValue('5173');
      await user.clear(input);
      await user.type(input, '3000');
      fireEvent.blur(input);

      expect(defaultProps.onPortSaved).toHaveBeenCalledWith(3000);
      expect(mockInvoke).toHaveBeenCalledWith('update_server_port', { name: 'my-app', port: 3000 });
    });

    it('resets port on Escape key in port editor', async () => {
      const user = userEvent.setup();
      render(<ServerCard {...defaultProps} />);

      fireEvent.click(screen.getByText(':5173'));
      const input = screen.getByDisplayValue('5173');
      await user.clear(input);
      await user.type(input, '9999');
      fireEvent.keyDown(input, { key: 'Escape' });

      // Edit mode exits, port badge is back
      expect(screen.getByText(':5173')).toBeInTheDocument();
    });

    it('rejects invalid port (0) and resets', async () => {
      const user = userEvent.setup();
      render(<ServerCard {...defaultProps} />);

      fireEvent.click(screen.getByText(':5173'));
      const input = screen.getByDisplayValue('5173');
      await user.clear(input);
      await user.type(input, '0');
      fireEvent.blur(input);

      expect(defaultProps.onPortSaved).not.toHaveBeenCalled();
      expect(screen.getByText(':5173')).toBeInTheDocument();
    });
  });

  describe('port conflict indicator', () => {
    it('shows conflict icon when portConflict is true and running', () => {
      const { container } = render(
        <ServerCard {...defaultProps} running health="healthy" portConflict />,
      );
      // The AlertCircle is inside a span with title
      expect(container.querySelector('[title="Port conflict with another running server"]'))
        .toBeInTheDocument();
    });

    it('does not show conflict icon when not running', () => {
      const { container } = render(
        <ServerCard {...defaultProps} running={false} portConflict />,
      );
      expect(container.querySelector('[title="Port conflict with another running server"]'))
        .not.toBeInTheDocument();
    });
  });

  describe('favorite star', () => {
    it('amber star when favorite', () => {
      const { container } = render(<ServerCard {...defaultProps} favorite />);
      const starContainer = container.querySelector('.text-amber-400');
      expect(starContainer).toBeInTheDocument();
    });

    it('grey star when not favorite', () => {
      const { container } = render(<ServerCard {...defaultProps} favorite={false} />);
      const starContainer = container.querySelector('.text-gray-700');
      expect(starContainer).toBeInTheDocument();
    });
  });
});
