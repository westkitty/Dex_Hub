import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue(false); // get_autostart_enabled returns false
});

describe('Sidebar', () => {
  const onViewChange = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all nav items', () => {
    render(<Sidebar activeView="servers" onViewChange={onViewChange} />);
    expect(screen.getByText('Dev Servers')).toBeInTheDocument();
    expect(screen.getByText('Omni-View')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does NOT render DexDictate', () => {
    render(<Sidebar activeView="servers" onViewChange={onViewChange} />);
    expect(screen.queryByText('DexDictate')).not.toBeInTheDocument();
  });

  it('highlights the active view', () => {
    const { rerender } = render(<Sidebar activeView="servers" onViewChange={onViewChange} />);
    const serversBtn = screen.getByText('Dev Servers').closest('button')!;
    expect(serversBtn.className).toContain('text-accent-primary');

    rerender(<Sidebar activeView="kanban" onViewChange={onViewChange} />);
    const kanbanBtn = screen.getByText('Omni-View').closest('button')!;
    expect(kanbanBtn.className).toContain('text-accent-primary');
  });

  it('calls onViewChange with "servers" when Dev Servers is clicked', () => {
    render(<Sidebar activeView="kanban" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByText('Dev Servers'));
    expect(onViewChange).toHaveBeenCalledWith('servers');
  });

  it('calls onViewChange with "kanban" when Omni-View is clicked', () => {
    render(<Sidebar activeView="servers" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByText('Omni-View'));
    expect(onViewChange).toHaveBeenCalledWith('kanban');
  });

  it('does not call onViewChange when disabled Settings item is clicked', () => {
    render(<Sidebar activeView="servers" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByText('Settings'));
    expect(onViewChange).not.toHaveBeenCalled();
  });
});
