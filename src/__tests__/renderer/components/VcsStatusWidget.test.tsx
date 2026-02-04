/**
 * @fileoverview Tests for VcsStatusWidget component
 *
 * VcsStatusWidget is a unified container that conditionally renders either
 * GitStatusWidget or JjStatusWidget based on the session's active VCS type.
 *
 * Tests verify:
 * - Correct widget selection based on vcsType prop
 * - Props pass-through to child widgets
 * - Git widget rendered for 'git' and undefined vcsType
 * - Jj widget rendered for 'jj' vcsType
 * - Switching between VCS modes
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VcsStatusWidget } from '../../../renderer/components/VcsStatusWidget';
import type { Theme } from '../../../renderer/types';

// ============================================================================
// MOCK SETUP: Both Git and Jj context hooks
// ============================================================================

// Git context mocks
const mockGitGetFileCount = vi.fn<[string], number>();
const mockGitGetFileDetails = vi.fn<
	[string],
	| {
			fileChanges?: Array<{ path: string; additions: number; deletions: number }>;
			totalAdditions: number;
			totalDeletions: number;
			modifiedCount: number;
	  }
	| undefined
>();
const mockGitRefreshStatus = vi.fn<[], Promise<void>>();

vi.mock('../../../renderer/contexts/GitStatusContext', () => ({
	useGitFileStatus: () => ({
		getFileCount: mockGitGetFileCount,
		hasChanges: (sessionId: string) => mockGitGetFileCount(sessionId) > 0,
		isLoading: false,
	}),
	useGitDetail: () => ({
		getFileDetails: mockGitGetFileDetails,
		refreshGitStatus: mockGitRefreshStatus,
	}),
	useGitStatus: () => ({
		gitStatusMap: new Map(),
		getStatus: () => undefined,
		getFileCount: mockGitGetFileCount,
		refreshGitStatus: mockGitRefreshStatus,
		isLoading: false,
	}),
}));

// Jj context mocks
const mockJjGetFileCount = vi.fn<[string], number>();
const mockJjHasChanges = vi.fn<[string], boolean>();
const mockJjHasConflicts = vi.fn<[string], boolean>();
const mockJjGetFileDetails = vi.fn<
	[string],
	| {
			fileChanges?: Array<{ path: string; additions: number; deletions: number }>;
			totalAdditions: number;
			totalDeletions: number;
			modifiedCount: number;
			description?: string;
			isEmpty?: boolean;
			conflictedFiles?: string[];
	  }
	| undefined
>();
const mockJjGetBranchInfo = vi.fn<
	[string],
	| {
			branch?: string;
			changeId?: string;
			commitId?: string;
			bookmarks?: string[];
	  }
	| undefined
>();
const mockJjRefreshStatus = vi.fn<[], Promise<void>>();

vi.mock('../../../renderer/contexts/JjStatusContext', () => ({
	useJjFileStatus: () => ({
		getFileCount: mockJjGetFileCount,
		hasChanges: mockJjHasChanges,
		isLoading: false,
		hasConflicts: mockJjHasConflicts,
	}),
	useJjDetail: () => ({
		getFileDetails: mockJjGetFileDetails,
		refreshJjStatus: mockJjRefreshStatus,
	}),
	useJjBranch: () => ({
		getBranchInfo: mockJjGetBranchInfo,
	}),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

const mockTheme: Theme = {
	id: 'test-theme',
	name: 'Test Theme',
	colors: {
		bgMain: '#1a1a2e',
		bgSidebar: '#16213e',
		bgInput: '#0f3460',
		textMain: '#eaeaea',
		textDim: '#a0a0a0',
		border: '#2a2a4a',
		accent: '#e94560',
		scrollbarThumb: '#444',
		scrollbarTrack: '#222',
		syntax1: '#ff6b6b',
		syntax2: '#4ecdc4',
		syntax3: '#45b7d1',
		syntax4: '#96ceb4',
	},
};

/** Set up git mocks to show file changes */
function setupGitMocks(data: {
	fileCount?: number;
	totalAdditions?: number;
	totalDeletions?: number;
	modifiedCount?: number;
	fileChanges?: Array<{ path: string; additions: number; deletions: number }>;
}) {
	mockGitGetFileCount.mockReturnValue(data.fileCount ?? 1);
	mockGitGetFileDetails.mockReturnValue({
		fileChanges: data.fileChanges ?? [{ path: 'file.ts', additions: 10, deletions: 5 }],
		totalAdditions: data.totalAdditions ?? 10,
		totalDeletions: data.totalDeletions ?? 5,
		modifiedCount: data.modifiedCount ?? 1,
	});
}

/** Set up jj mocks to show file changes */
function setupJjMocks(data: {
	fileCount?: number;
	totalAdditions?: number;
	totalDeletions?: number;
	modifiedCount?: number;
	fileChanges?: Array<{ path: string; additions: number; deletions: number }>;
	description?: string;
	conflictedFiles?: string[];
	hasConflicts?: boolean;
	branch?: string;
	changeId?: string;
}) {
	mockJjGetFileCount.mockReturnValue(data.fileCount ?? 1);
	mockJjHasChanges.mockReturnValue((data.fileCount ?? 1) > 0);
	mockJjHasConflicts.mockReturnValue(data.hasConflicts ?? false);
	mockJjGetFileDetails.mockReturnValue({
		fileChanges: data.fileChanges ?? [{ path: 'file.ts', additions: 10, deletions: 5 }],
		totalAdditions: data.totalAdditions ?? 10,
		totalDeletions: data.totalDeletions ?? 5,
		modifiedCount: data.modifiedCount ?? 1,
		description: data.description,
		conflictedFiles: data.conflictedFiles ?? [],
	});
	mockJjGetBranchInfo.mockReturnValue({
		branch: data.branch ?? 'main',
		changeId: data.changeId ?? 'abc123',
	});
}

// ============================================================================
// TESTS
// ============================================================================

describe('VcsStatusWidget', () => {
	const mockOnViewDiff = vi.fn();
	const mockOnViewLog = vi.fn();

	const defaultProps = {
		sessionId: 'test-session-id',
		isGitRepo: true,
		theme: mockTheme,
		onViewDiff: mockOnViewDiff,
		onViewLog: mockOnViewLog,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Default: no changes for either VCS
		mockGitGetFileCount.mockReturnValue(0);
		mockGitGetFileDetails.mockReturnValue(undefined);
		mockJjGetFileCount.mockReturnValue(0);
		mockJjGetFileDetails.mockReturnValue(undefined);
		mockJjGetBranchInfo.mockReturnValue(undefined);
		mockJjHasConflicts.mockReturnValue(false);
		mockJjHasChanges.mockReturnValue(false);
	});

	// ========================================================================
	// VCS Type Selection
	// ========================================================================

	describe('VCS Type Selection', () => {
		it('should render GitStatusWidget when vcsType is "git"', () => {
			setupGitMocks({ totalAdditions: 10, totalDeletions: 5, modifiedCount: 1 });
			render(<VcsStatusWidget {...defaultProps} vcsType="git" />);

			// Git widget uses GitBranch icon (SVG), not "JJ" text
			expect(screen.getByRole('button')).toBeInTheDocument();
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
		});

		it('should render GitStatusWidget when vcsType is undefined', () => {
			setupGitMocks({ totalAdditions: 10, totalDeletions: 5, modifiedCount: 1 });
			render(<VcsStatusWidget {...defaultProps} vcsType={undefined} />);

			expect(screen.getByRole('button')).toBeInTheDocument();
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
		});

		it('should render JjStatusWidget when vcsType is "jj"', () => {
			setupJjMocks({ totalAdditions: 10, totalDeletions: 5, modifiedCount: 1 });
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);

			// JJ widget shows "JJ" text label
			expect(screen.getByRole('button')).toBeInTheDocument();
			expect(screen.getByText('JJ')).toBeInTheDocument();
		});

		it('should switch from git to jj widget on vcsType change', () => {
			setupGitMocks({ totalAdditions: 10, totalDeletions: 5, modifiedCount: 1 });
			setupJjMocks({ totalAdditions: 20, totalDeletions: 8, modifiedCount: 2 });

			const { rerender } = render(<VcsStatusWidget {...defaultProps} vcsType="git" />);
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();

			rerender(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			expect(screen.getByText('JJ')).toBeInTheDocument();
		});

		it('should switch from jj to git widget on vcsType change', () => {
			setupGitMocks({ totalAdditions: 10, totalDeletions: 5, modifiedCount: 1 });
			setupJjMocks({ totalAdditions: 20, totalDeletions: 8, modifiedCount: 2 });

			const { rerender } = render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			expect(screen.getByText('JJ')).toBeInTheDocument();

			rerender(<VcsStatusWidget {...defaultProps} vcsType="git" />);
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
		});
	});

	// ========================================================================
	// Props Pass-Through
	// ========================================================================

	describe('Props Pass-Through', () => {
		it('should pass sessionId to git widget', () => {
			setupGitMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="git" sessionId="my-session" />);
			expect(mockGitGetFileCount).toHaveBeenCalledWith('my-session');
		});

		it('should pass sessionId to jj widget', () => {
			setupJjMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" sessionId="my-session" />);
			expect(mockJjGetFileCount).toHaveBeenCalledWith('my-session');
		});

		it('should pass onViewDiff to git widget', () => {
			setupGitMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="git" />);
			fireEvent.click(screen.getByRole('button'));
			expect(mockOnViewDiff).toHaveBeenCalled();
		});

		it('should pass onViewDiff to jj widget', () => {
			setupJjMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			fireEvent.click(screen.getByRole('button'));
			expect(mockOnViewDiff).toHaveBeenCalled();
		});

		it('should pass compact prop to git widget', () => {
			setupGitMocks({ totalAdditions: 10, totalDeletions: 5, fileCount: 3 });
			render(<VcsStatusWidget {...defaultProps} vcsType="git" compact />);
			// In compact mode, git widget shows file count with FileDiff icon
			expect(screen.getByText('3')).toBeInTheDocument();
		});

		it('should pass compact prop to jj widget', () => {
			setupJjMocks({ totalAdditions: 10, totalDeletions: 5, fileCount: 3 });
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" compact />);
			// In compact mode, jj widget shows file count with FileDiff icon
			expect(screen.getByText('3')).toBeInTheDocument();
		});

		it('should pass onViewLog to git widget tooltip', () => {
			setupGitMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="git" />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const viewLogButton = screen.getByText('View Git Log');
			fireEvent.click(viewLogButton);
			expect(mockOnViewLog).toHaveBeenCalled();
		});

		it('should pass onViewLog to jj widget tooltip', () => {
			setupJjMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const viewLogButton = screen.getByText('View JJ Log');
			fireEvent.click(viewLogButton);
			expect(mockOnViewLog).toHaveBeenCalled();
		});
	});

	// ========================================================================
	// Rendering Conditions
	// ========================================================================

	describe('Rendering Conditions', () => {
		it('should return null when isGitRepo is false for git mode', () => {
			const { container } = render(
				<VcsStatusWidget {...defaultProps} isGitRepo={false} vcsType="git" />
			);
			expect(container.firstChild).toBeNull();
		});

		it('should return null when isGitRepo is false for jj mode', () => {
			// isGitRepo is passed as isJjRepo to JjStatusWidget
			const { container } = render(
				<VcsStatusWidget {...defaultProps} isGitRepo={false} vcsType="jj" />
			);
			expect(container.firstChild).toBeNull();
		});

		it('should return null when no changes exist in git mode', () => {
			mockGitGetFileCount.mockReturnValue(0);
			const { container } = render(
				<VcsStatusWidget {...defaultProps} vcsType="git" />
			);
			expect(container.firstChild).toBeNull();
		});

		it('should return null when no changes exist in jj mode', () => {
			mockJjGetFileCount.mockReturnValue(0);
			const { container } = render(
				<VcsStatusWidget {...defaultProps} vcsType="jj" />
			);
			expect(container.firstChild).toBeNull();
		});

		it('should render git widget with changes', () => {
			setupGitMocks({ totalAdditions: 5, totalDeletions: 3 });
			render(<VcsStatusWidget {...defaultProps} vcsType="git" />);
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('should render jj widget with changes', () => {
			setupJjMocks({ totalAdditions: 5, totalDeletions: 3 });
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			expect(screen.getByRole('button')).toBeInTheDocument();
		});
	});

	// ========================================================================
	// Visual Distinction
	// ========================================================================

	describe('Visual Distinction', () => {
		it('should show JJ label with violet styling for jj mode', () => {
			setupJjMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			const jjLabel = screen.getByText('JJ');
			expect(jjLabel).toHaveClass('text-violet-400');
		});

		it('should show GitBranch icon for git mode (no JJ label)', () => {
			setupGitMocks({});
			render(<VcsStatusWidget {...defaultProps} vcsType="git" />);
			// Git widget renders SVG icon (GitBranch), not text label
			const button = screen.getByRole('button');
			expect(button.querySelector('svg')).toBeInTheDocument();
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
		});

		it('should show conflict warning icon in jj mode when conflicts exist', () => {
			setupJjMocks({ hasConflicts: true });
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			// JJ widget shows AlertTriangle for conflicts with yellow-500 text
			const button = screen.getByRole('button');
			const yellowSpan = button.querySelector('.text-yellow-500');
			expect(yellowSpan).toBeInTheDocument();
		});
	});

	// ========================================================================
	// Jj-specific Features
	// ========================================================================

	describe('Jj-specific Features', () => {
		it('should show change description in jj tooltip', () => {
			setupJjMocks({ description: 'fix: resolve login timeout issue' });
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			expect(screen.getByText('fix: resolve login timeout issue')).toBeInTheDocument();
		});

		it('should show conflict warning banner in jj tooltip', () => {
			setupJjMocks({
				conflictedFiles: ['src/auth.ts', 'src/config.ts'],
				hasConflicts: true,
			});
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			expect(screen.getByText(/2 conflicted files/)).toBeInTheDocument();
		});
	});

	// ========================================================================
	// Colocated Repository Handling
	// ========================================================================

	describe('Colocated Repository (both git and jj)', () => {
		beforeEach(() => {
			// Both VCS types have changes in a colocated repo
			setupGitMocks({
				totalAdditions: 10,
				totalDeletions: 5,
				fileChanges: [{ path: 'git-file.ts', additions: 10, deletions: 5 }],
			});
			setupJjMocks({
				totalAdditions: 20,
				totalDeletions: 8,
				fileChanges: [{ path: 'jj-file.ts', additions: 20, deletions: 8 }],
			});
		});

		it('should show git widget when user preference is git', () => {
			render(<VcsStatusWidget {...defaultProps} vcsType="git" />);
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
			// Git widget shows its own additions count
			expect(screen.getByText('10')).toBeInTheDocument();
		});

		it('should show jj widget when user preference is jj', () => {
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			expect(screen.getByText('JJ')).toBeInTheDocument();
			// JJ widget shows its own additions count
			expect(screen.getByText('20')).toBeInTheDocument();
		});

		it('should only render one widget at a time', () => {
			render(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			// Should only have one button (one widget rendered)
			const buttons = screen.getAllByRole('button');
			expect(buttons).toHaveLength(1);
		});
	});

	// ========================================================================
	// Memoization
	// ========================================================================

	describe('Memoization', () => {
		it('should not re-render when props are the same', () => {
			setupGitMocks({});
			const { rerender } = render(<VcsStatusWidget {...defaultProps} vcsType="git" />);

			// Re-render with identical props
			rerender(<VcsStatusWidget {...defaultProps} vcsType="git" />);

			// Component should still be rendered correctly (memoization doesn't break rendering)
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('should re-render when vcsType changes', () => {
			setupGitMocks({});
			setupJjMocks({});

			const { rerender } = render(<VcsStatusWidget {...defaultProps} vcsType="git" />);
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();

			rerender(<VcsStatusWidget {...defaultProps} vcsType="jj" />);
			expect(screen.getByText('JJ')).toBeInTheDocument();
		});

		it('should re-render when sessionId changes', () => {
			setupGitMocks({});

			const { rerender } = render(
				<VcsStatusWidget {...defaultProps} vcsType="git" sessionId="session-1" />
			);
			expect(mockGitGetFileCount).toHaveBeenCalledWith('session-1');

			rerender(
				<VcsStatusWidget {...defaultProps} vcsType="git" sessionId="session-2" />
			);
			expect(mockGitGetFileCount).toHaveBeenCalledWith('session-2');
		});
	});
});
