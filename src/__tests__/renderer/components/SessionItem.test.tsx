/**
 * @fileoverview Tests for SessionItem component VCS badge display
 *
 * SessionItem renders session entries in the sidebar list. These tests focus on
 * the Location Indicator Pills (VCS badge area) which display GIT, JJ, LOCAL,
 * or REMOTE badges depending on the session's vcsType, isGitRepo, and SSH config.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionItem } from '../../../renderer/components/SessionItem';
import type { Session, Theme } from '../../../renderer/types';

// Minimal mock theme with the colors referenced by SessionItem
const mockTheme: Theme = {
	id: 'test-theme' as any,
	name: 'Test Theme',
	mode: 'dark',
	colors: {
		accent: '#e94560',
		warning: '#f0ad4e',
		textDim: '#a0a0a0',
		bgMain: '#1a1a2e',
		bgActivity: '#2a2a4a',
		textMain: '#eaeaea',
		error: '#ff4444',
		bgSidebar: '#16213e',
		border: '#2a2a4a',
		accentDim: '#e9456080',
		accentText: '#ffffff',
		accentForeground: '#ffffff',
		success: '#28a745',
	},
};

/**
 * Creates a minimal Session object with sensible defaults.
 * Only the fields relevant to badge display need to be overridden per test.
 */
function createMockSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'test-session-1',
		name: 'Test Session',
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/home/user/project',
		fullPath: '/home/user/project',
		projectRoot: '/home/user/project',
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		executionQueue: [],
		activeTimeMs: 0,
		aiTabs: [
			{
				id: 'tab-1',
				agentSessionId: null,
				name: null,
				starred: false,
				logs: [],
				inputValue: '',
				stagedImages: [],
				createdAt: Date.now(),
				state: 'idle',
				hasUnread: false,
			},
		],
		activeTabId: 'tab-1',
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [{ type: 'ai', id: 'tab-1' }],
		unifiedClosedTabHistory: [],
		...overrides,
	} as Session;
}

/** Default props for SessionItem with vi.fn() handlers */
function createDefaultProps(overrides: Partial<React.ComponentProps<typeof SessionItem>> = {}) {
	return {
		session: createMockSession(),
		variant: 'flat' as const,
		theme: mockTheme,
		isActive: false,
		isKeyboardSelected: false,
		isDragging: false,
		isEditing: false,
		leftSidebarOpen: true,
		onSelect: vi.fn(),
		onDragStart: vi.fn(),
		onContextMenu: vi.fn(),
		onFinishRename: vi.fn(),
		onStartRename: vi.fn(),
		onToggleBookmark: vi.fn(),
		...overrides,
	};
}

describe('SessionItem VCS badge display', () => {
	describe('vcsType-based badges', () => {
		it('should show "GIT" badge when vcsType is "git"', () => {
			const props = createDefaultProps({
				session: createMockSession({ vcsType: 'git', isGitRepo: true }),
			});

			render(<SessionItem {...props} />);

			const badge = screen.getByText('GIT');
			expect(badge).toBeInTheDocument();
			expect(badge).toHaveAttribute('title', 'Git repository');
		});

		it('should show "JJ" badge when vcsType is "jj"', () => {
			const props = createDefaultProps({
				session: createMockSession({ vcsType: 'jj', isGitRepo: true }),
			});

			render(<SessionItem {...props} />);

			const badge = screen.getByText('JJ');
			expect(badge).toBeInTheDocument();
			expect(badge).toHaveAttribute('title', 'Jujutsu repository');
		});
	});

	describe('no VCS detected (vcsType undefined)', () => {
		it('should show "LOCAL" badge when vcsType is undefined', () => {
			const props = createDefaultProps({
				session: createMockSession({ vcsType: undefined, isGitRepo: false }),
			});

			render(<SessionItem {...props} />);

			const badge = screen.getByText('LOCAL');
			expect(badge).toBeInTheDocument();
			expect(badge).toHaveAttribute('title', 'Local directory (not a git repo)');
		});
	});

	describe('SSH remote badges', () => {
		it('should show "REMOTE" badge when vcsType is undefined, isGitRepo is false, and SSH is enabled', () => {
			const props = createDefaultProps({
				session: createMockSession({
					vcsType: undefined,
					isGitRepo: false,
					sessionSshRemoteConfig: { enabled: true, remoteId: 'remote-1' },
				}),
			});

			render(<SessionItem {...props} />);

			const badge = screen.getByText('REMOTE');
			expect(badge).toBeInTheDocument();
			expect(badge).toHaveAttribute('title', 'Running on remote host via SSH');
		});

		it('should show Server icon and "GIT" badge when vcsType is "git" and SSH is enabled', () => {
			const props = createDefaultProps({
				session: createMockSession({
					vcsType: 'git',
					isGitRepo: true,
					sessionSshRemoteConfig: { enabled: true, remoteId: 'remote-1' },
				}),
			});

			render(<SessionItem {...props} />);

			// Server icon rendered as mock SVG by test setup
			const serverIcon = screen.getByTestId('server-icon');
			expect(serverIcon).toBeInTheDocument();

			const gitBadge = screen.getByText('GIT');
			expect(gitBadge).toBeInTheDocument();
		});

		it('should show Server icon and "JJ" badge when vcsType is "jj" and SSH is enabled', () => {
			const props = createDefaultProps({
				session: createMockSession({
					vcsType: 'jj',
					isGitRepo: true,
					sessionSshRemoteConfig: { enabled: true, remoteId: 'remote-1' },
				}),
			});

			render(<SessionItem {...props} />);

			const serverIcon = screen.getByTestId('server-icon');
			expect(serverIcon).toBeInTheDocument();

			const jjBadge = screen.getByText('JJ');
			expect(jjBadge).toBeInTheDocument();
			expect(jjBadge).toHaveAttribute('title', 'Jujutsu repository');
		});
	});

	describe('badge suppression', () => {
		it('should not show any VCS badge in bookmark variant', () => {
			const props = createDefaultProps({
				variant: 'bookmark',
				session: createMockSession({ vcsType: 'git', isGitRepo: true, bookmarked: true }),
			});

			render(<SessionItem {...props} />);

			expect(screen.queryByText('GIT')).not.toBeInTheDocument();
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
			expect(screen.queryByText('LOCAL')).not.toBeInTheDocument();
			expect(screen.queryByText('REMOTE')).not.toBeInTheDocument();
		});

		it('should not show any VCS badge for terminal sessions', () => {
			const props = createDefaultProps({
				session: createMockSession({
					toolType: 'terminal',
					vcsType: 'git',
					isGitRepo: true,
				}),
			});

			render(<SessionItem {...props} />);

			expect(screen.queryByText('GIT')).not.toBeInTheDocument();
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
			expect(screen.queryByText('LOCAL')).not.toBeInTheDocument();
			expect(screen.queryByText('REMOTE')).not.toBeInTheDocument();
		});

		it('should not show any VCS badge in worktree variant', () => {
			const props = createDefaultProps({
				variant: 'worktree',
				session: createMockSession({ vcsType: 'jj', isGitRepo: true }),
			});

			render(<SessionItem {...props} />);

			expect(screen.queryByText('GIT')).not.toBeInTheDocument();
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
			expect(screen.queryByText('LOCAL')).not.toBeInTheDocument();
			expect(screen.queryByText('REMOTE')).not.toBeInTheDocument();
		});
	});
});
