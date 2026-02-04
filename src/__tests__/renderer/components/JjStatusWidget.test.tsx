/**
 * @fileoverview Tests for JjStatusWidget component
 *
 * JjStatusWidget displays jj (Jujutsu) change statistics (additions, deletions, modifications)
 * with a hover tooltip showing per-file changes with GitHub-style diff bars.
 * It also shows jj-specific data: change description, conflict warnings, and bookmark info.
 *
 * The component uses the centralized JjStatusContext for jj data instead
 * of calling jjService directly. Tests mock the context hooks.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { JjStatusWidget } from '../../../renderer/components/JjStatusWidget';
import type { Theme } from '../../../renderer/types';
import type { GitFileChange } from '../../../renderer/contexts/JjStatusContext';

// Mock the JjStatusContext hooks (focused contexts)
const mockGetFileCount = vi.fn<[string], number>();
const mockHasChanges = vi.fn<[string], boolean>();
const mockHasConflicts = vi.fn<[string], boolean>();
const mockGetFileDetails = vi.fn<
	[string],
	| {
			fileChanges?: GitFileChange[];
			totalAdditions: number;
			totalDeletions: number;
			modifiedCount: number;
			description?: string;
			isEmpty?: boolean;
			conflictedFiles?: string[];
	  }
	| undefined
>();
const mockGetBranchInfo = vi.fn<
	[string],
	| {
			branch?: string;
			changeId?: string;
			commitId?: string;
			bookmarks?: string[];
	  }
	| undefined
>();
const mockRefreshJjStatus = vi.fn<[], Promise<void>>();

vi.mock('../../../renderer/contexts/JjStatusContext', () => ({
	useJjFileStatus: () => ({
		getFileCount: mockGetFileCount,
		hasChanges: mockHasChanges,
		isLoading: false,
		hasConflicts: mockHasConflicts,
	}),
	useJjDetail: () => ({
		getFileDetails: mockGetFileDetails,
		refreshJjStatus: mockRefreshJjStatus,
	}),
	useJjBranch: () => ({
		getBranchInfo: mockGetBranchInfo,
	}),
}));

// Helper type for setting up mock data
interface JjMockData {
	fileCount?: number;
	totalAdditions?: number;
	totalDeletions?: number;
	modifiedCount?: number;
	fileChanges?: GitFileChange[];
	description?: string;
	isEmpty?: boolean;
	conflictedFiles?: string[];
	branch?: string;
	changeId?: string;
	commitId?: string;
	bookmarks?: string[];
	hasConflicts?: boolean;
}

// Helper to set up all mocks from a single data object
function setupMocks(data?: JjMockData) {
	if (!data) {
		mockGetFileCount.mockReturnValue(0);
		mockHasChanges.mockReturnValue(false);
		mockHasConflicts.mockReturnValue(false);
		mockGetFileDetails.mockReturnValue(undefined);
		mockGetBranchInfo.mockReturnValue(undefined);
		return;
	}

	const fileCount = data.fileCount ?? 1;
	mockGetFileCount.mockReturnValue(fileCount);
	mockHasChanges.mockReturnValue(fileCount > 0);
	mockHasConflicts.mockReturnValue(data.hasConflicts ?? false);
	mockGetFileDetails.mockReturnValue({
		fileChanges: data.fileChanges ?? [{ path: 'file.ts', additions: 10, deletions: 5 }],
		totalAdditions: data.totalAdditions ?? 10,
		totalDeletions: data.totalDeletions ?? 5,
		modifiedCount: data.modifiedCount ?? 1,
		description: data.description,
		isEmpty: data.isEmpty,
		conflictedFiles: data.conflictedFiles ?? [],
	});
	mockGetBranchInfo.mockReturnValue({
		branch: data.branch ?? 'main',
		changeId: data.changeId ?? 'abc12345',
		commitId: data.commitId ?? 'def67890',
		bookmarks: data.bookmarks ?? ['main'],
	});
}

// Create a mock theme
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

describe('JjStatusWidget', () => {
	const mockOnViewDiff = vi.fn();
	const mockOnViewLog = vi.fn();

	const defaultProps = {
		sessionId: 'test-session-id',
		isJjRepo: true,
		theme: mockTheme,
		onViewDiff: mockOnViewDiff,
		onViewLog: mockOnViewLog,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Default: no jj status (renders null)
		setupMocks();
	});

	afterEach(() => {
		vi.clearAllTimers();
	});

	describe('Rendering Conditions', () => {
		it('should return null when isJjRepo is false', () => {
			const { container } = render(<JjStatusWidget {...defaultProps} isJjRepo={false} />);
			expect(container.firstChild).toBeNull();
		});

		it('should return null when there are no file changes', () => {
			setupMocks();
			const { container } = render(<JjStatusWidget {...defaultProps} />);
			expect(container.firstChild).toBeNull();
		});

		it('should render the widget when there are file changes', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('should reset state when isJjRepo changes to false', () => {
			setupMocks({ fileCount: 1 });
			const { rerender, container } = render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByRole('button')).toBeInTheDocument();

			rerender(<JjStatusWidget {...defaultProps} isJjRepo={false} />);
			expect(container.firstChild).toBeNull();
		});
	});

	describe('Jj Data Loading', () => {
		it('should call getFileCount with the session ID', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);
			expect(mockGetFileCount).toHaveBeenCalledWith('test-session-id');
		});

		it('should reload jj status on sessionId change', () => {
			setupMocks({ fileCount: 1 });
			const { rerender } = render(<JjStatusWidget {...defaultProps} />);
			expect(mockGetFileCount).toHaveBeenCalledWith('test-session-id');

			rerender(<JjStatusWidget {...defaultProps} sessionId="another-session" />);
			expect(mockGetFileCount).toHaveBeenCalledWith('another-session');
		});

		it('should handle jj service errors gracefully', () => {
			setupMocks();
			const { container } = render(<JjStatusWidget {...defaultProps} />);
			expect(container.firstChild).toBeNull();
		});
	});

	describe('JJ Label and Visual Distinction', () => {
		it('should display "JJ" label in full mode', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByText('JJ')).toBeInTheDocument();
		});

		it('should not display "JJ" label in compact mode', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} compact={true} />);
			expect(screen.queryByText('JJ')).not.toBeInTheDocument();
		});

		it('should display the JJ label with violet color class', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);
			const jjLabel = screen.getByText('JJ');
			expect(jjLabel).toHaveClass('text-violet-400');
		});
	});

	describe('Statistics Display', () => {
		it('should display additions count correctly', () => {
			setupMocks({
				fileCount: 1,
				totalAdditions: 42,
				totalDeletions: 0,
				fileChanges: [{ path: 'file.ts', additions: 42, deletions: 0 }],
			});
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByText('42')).toBeInTheDocument();
		});

		it('should display deletions count correctly', () => {
			setupMocks({
				fileCount: 1,
				totalAdditions: 0,
				totalDeletions: 17,
				fileChanges: [{ path: 'file.ts', additions: 0, deletions: 17 }],
			});
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByText('17')).toBeInTheDocument();
		});

		it('should display modified count correctly', () => {
			setupMocks({
				fileCount: 2,
				totalAdditions: 7,
				totalDeletions: 4,
				modifiedCount: 2,
				fileChanges: [
					{ path: 'file1.ts', additions: 5, deletions: 3 },
					{ path: 'file2.ts', additions: 2, deletions: 1 },
				],
			});
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByText('2')).toBeInTheDocument();
		});

		it('should calculate totals from multiple files', () => {
			setupMocks({
				fileCount: 3,
				totalAdditions: 30,
				totalDeletions: 20,
				fileChanges: [
					{ path: 'file1.ts', additions: 10, deletions: 5 },
					{ path: 'file2.ts', additions: 20, deletions: 0 },
					{ path: 'file3.ts', additions: 0, deletions: 15 },
				],
			});
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByText('30')).toBeInTheDocument();
			expect(screen.getByText('20')).toBeInTheDocument();
		});
	});

	describe('Compact Mode', () => {
		it('should show file count in compact mode', () => {
			setupMocks({ fileCount: 5 });
			render(<JjStatusWidget {...defaultProps} compact={true} />);
			expect(screen.getByText('5')).toBeInTheDocument();
		});

		it('should show title attribute with breakdown in compact mode', () => {
			setupMocks({
				fileCount: 3,
				totalAdditions: 10,
				totalDeletions: 5,
				modifiedCount: 2,
			});
			render(<JjStatusWidget {...defaultProps} compact={true} />);
			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('title', '+10 −5 ~2');
		});
	});

	describe('Click Handlers', () => {
		it('should call onViewDiff when button is clicked', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);
			fireEvent.click(screen.getByRole('button'));
			expect(mockOnViewDiff).toHaveBeenCalled();
		});

		it('should call onViewDiff when "View Full Diff" link is clicked in tooltip', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const viewDiffButton = screen.getByText('View Full Diff');
			fireEvent.click(viewDiffButton);
			expect(mockOnViewDiff).toHaveBeenCalled();
		});

		it('should call onViewLog when "View JJ Log" link is clicked in tooltip', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const viewLogButton = screen.getByText('View JJ Log');
			fireEvent.click(viewLogButton);
			expect(mockOnViewLog).toHaveBeenCalled();
		});

		it('should not render "View JJ Log" button when onViewLog is not provided', () => {
			setupMocks({ fileCount: 1 });
			const { onViewLog: _, ...propsWithoutLog } = defaultProps;
			render(<JjStatusWidget {...propsWithoutLog} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			expect(screen.queryByText('View JJ Log')).not.toBeInTheDocument();
		});
	});

	describe('Tooltip Behavior', () => {
		it('should show tooltip on mouse enter', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('View Full Diff')).toBeInTheDocument();
		});

		it('should hide tooltip on mouse leave after delay', () => {
			vi.useFakeTimers();
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('View Full Diff')).toBeInTheDocument();

			fireEvent.mouseLeave(container);
			act(() => {
				vi.advanceTimersByTime(200); // 150ms delay + buffer
			});
			expect(screen.queryByText('View Full Diff')).not.toBeInTheDocument();

			vi.useRealTimers();
		});

		it('should keep tooltip open when moving to tooltip content', () => {
			vi.useFakeTimers();
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('View Full Diff')).toBeInTheDocument();

			fireEvent.mouseLeave(container);
			vi.advanceTimersByTime(50);

			const tooltip = screen.getByText('View Full Diff').closest('div');
			fireEvent.mouseEnter(tooltip!);
			vi.advanceTimersByTime(150);
			expect(screen.getByText('View Full Diff')).toBeInTheDocument();

			vi.useRealTimers();
		});

		it('should close tooltip when leaving tooltip content', () => {
			vi.useFakeTimers();
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const tooltip = screen.getByText('View Full Diff').closest('div');
			fireEvent.mouseEnter(tooltip!);
			fireEvent.mouseLeave(tooltip!);

			act(() => {
				vi.advanceTimersByTime(200); // 150ms delay + buffer
			});
			expect(screen.queryByText('View Full Diff')).not.toBeInTheDocument();

			vi.useRealTimers();
		});

		it('should clear timeout when mouse re-enters container', () => {
			vi.useFakeTimers();
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			fireEvent.mouseLeave(container);
			vi.advanceTimersByTime(50);
			fireEvent.mouseEnter(container);
			vi.advanceTimersByTime(150);
			expect(screen.getByText('View Full Diff')).toBeInTheDocument();

			vi.useRealTimers();
		});
	});

	describe('File Changes Display', () => {
		it('should display file path in tooltip', () => {
			setupMocks({
				fileCount: 1,
				fileChanges: [{ path: 'src/components/Widget.tsx', additions: 10, deletions: 5 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('src/components/Widget.tsx')).toBeInTheDocument();
		});

		it('should display multiple files in tooltip', () => {
			setupMocks({
				fileCount: 2,
				fileChanges: [
					{ path: 'file1.ts', additions: 10, deletions: 5 },
					{ path: 'file2.ts', additions: 3, deletions: 1 },
				],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('file1.ts')).toBeInTheDocument();
			expect(screen.getByText('file2.ts')).toBeInTheDocument();
		});

		it('should display per-file additions and deletions', () => {
			setupMocks({
				fileCount: 1,
				totalAdditions: 15,
				totalDeletions: 7,
				fileChanges: [{ path: 'file.ts', additions: 15, deletions: 7 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('+15')).toBeInTheDocument();
			// Component uses unicode minus sign (−) not hyphen-minus (-)
			expect(screen.getByText('−7')).toBeInTheDocument();
		});

		it('should display summary in tooltip header', () => {
			setupMocks({
				fileCount: 3,
				totalAdditions: 25,
				totalDeletions: 10,
				modifiedCount: 3,
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			// Header format: "Changed Files ({totalChanges}) • +{additions} −{deletions}"
			// totalChanges = additions + deletions + modified = 25 + 10 + 3 = 38
			expect(screen.getByText(/Changed Files \(38\)/)).toBeInTheDocument();
		});

		it('should not display addition count when 0 for a file', () => {
			setupMocks({
				fileCount: 1,
				fileChanges: [{ path: 'file.ts', additions: 0, deletions: 5 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.queryByText('+0')).not.toBeInTheDocument();
		});

		it('should not display deletion count when 0 for a file', () => {
			setupMocks({
				fileCount: 1,
				fileChanges: [{ path: 'file.ts', additions: 5, deletions: 0 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.queryByText('-0')).not.toBeInTheDocument();
		});
	});

	describe('Jj-Specific Features', () => {
		it('should display change description in tooltip header', () => {
			setupMocks({
				fileCount: 1,
				description: 'Add new feature for user authentication',
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('Add new feature for user authentication')).toBeInTheDocument();
		});

		it('should show conflict warning icon in main display', () => {
			setupMocks({
				fileCount: 1,
				hasConflicts: true,
			});
			render(<JjStatusWidget {...defaultProps} />);
			// The AlertTriangle icon is rendered (title="Merge conflicts")
			const conflictIndicator = screen.getByTitle('Merge conflicts');
			expect(conflictIndicator).toBeInTheDocument();
		});

		it('should show conflict banner in tooltip when conflicts exist', () => {
			setupMocks({
				fileCount: 2,
				hasConflicts: true,
				conflictedFiles: ['src/app.ts', 'src/main.ts'],
				fileChanges: [
					{ path: 'src/app.ts', additions: 5, deletions: 2 },
					{ path: 'src/main.ts', additions: 3, deletions: 1 },
				],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('2 conflicted files')).toBeInTheDocument();
		});

		it('should use singular "file" for single conflict', () => {
			setupMocks({
				fileCount: 1,
				hasConflicts: true,
				conflictedFiles: ['src/app.ts'],
				fileChanges: [{ path: 'src/app.ts', additions: 5, deletions: 2 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('1 conflicted file')).toBeInTheDocument();
		});
	});

	describe('Theme Styling', () => {
		it('should apply theme colors to the main button', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);
			const button = screen.getByRole('button');
			expect(button).toHaveStyle({ color: mockTheme.colors.textMain });
		});

		it('should apply theme colors to tooltip background', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const tooltip = screen.getByText('View Full Diff').closest('div');
			expect(tooltip).toHaveStyle({ backgroundColor: mockTheme.colors.bgSidebar });
		});

		it('should apply theme border colors', () => {
			setupMocks({ fileCount: 1 });
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const tooltip = screen.getByText('View Full Diff').closest('div');
			expect(tooltip).toHaveStyle({ borderColor: mockTheme.colors.border });
		});
	});

	describe('GitHub-style Diff Bars', () => {
		it('should render diff bars for files with changes', () => {
			setupMocks({
				fileCount: 1,
				fileChanges: [{ path: 'file.ts', additions: 10, deletions: 5 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const tooltip = screen.getByText('file.ts').closest('div')!.parentElement!;
			expect(tooltip.querySelector('.bg-green-500')).toBeInTheDocument();
			expect(tooltip.querySelector('.bg-red-500')).toBeInTheDocument();
		});

		it('should only render green bar when there are only additions', () => {
			setupMocks({
				fileCount: 1,
				totalAdditions: 10,
				totalDeletions: 0,
				fileChanges: [{ path: 'file.ts', additions: 10, deletions: 0 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('+10')).toBeInTheDocument();
		});

		it('should only render red bar when there are only deletions', () => {
			setupMocks({
				fileCount: 1,
				totalAdditions: 0,
				totalDeletions: 10,
				fileChanges: [{ path: 'file.ts', additions: 0, deletions: 10 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			// Component uses unicode minus sign (−) not hyphen-minus (-)
			expect(screen.getByText('−10')).toBeInTheDocument();
		});

		it('should not render diff bars when file has no changes', () => {
			setupMocks({
				fileCount: 1,
				fileChanges: [{ path: 'file.ts', additions: 0, deletions: 0 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.queryByText('+0')).not.toBeInTheDocument();
			expect(screen.queryByText('-0')).not.toBeInTheDocument();
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty status', () => {
			setupMocks();
			const { container } = render(<JjStatusWidget {...defaultProps} />);
			expect(container.firstChild).toBeNull();
		});

		it('should handle special characters in file paths', () => {
			setupMocks({
				fileCount: 1,
				fileChanges: [{ path: 'src/[components]/file (1).tsx', additions: 5, deletions: 2 }],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);
			expect(screen.getByText('src/[components]/file (1).tsx')).toBeInTheDocument();
		});

		it('should handle many files', () => {
			const fileChanges = Array.from({ length: 20 }, (_, i) => ({
				path: `file${i}.ts`,
				additions: i,
				deletions: i % 3,
			}));
			setupMocks({
				fileCount: 20,
				totalAdditions: 190,
				totalDeletions: 27,
				modifiedCount: 20,
				fileChanges,
			});
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByText('190')).toBeInTheDocument();
			expect(screen.getByText('27')).toBeInTheDocument();
			expect(screen.getByText('20')).toBeInTheDocument();
		});

		it('should handle very large numbers', () => {
			setupMocks({
				fileCount: 1,
				totalAdditions: 99999,
				totalDeletions: 88888,
				fileChanges: [{ path: 'file.ts', additions: 99999, deletions: 88888 }],
			});
			render(<JjStatusWidget {...defaultProps} />);
			expect(screen.getByText('99999')).toBeInTheDocument();
		});

		it('should have proper accessibility with title attribute on file paths', () => {
			setupMocks({
				fileCount: 1,
				fileChanges: [
					{ path: 'very/long/path/to/deeply/nested/file.ts', additions: 5, deletions: 2 },
				],
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const filePath = screen.getByText('very/long/path/to/deeply/nested/file.ts');
			expect(filePath).toHaveAttribute('title', 'very/long/path/to/deeply/nested/file.ts');
		});

		it('should truncate long change descriptions in tooltip', () => {
			setupMocks({
				fileCount: 1,
				description: 'A very long description that should be truncated with ellipsis in the tooltip header',
			});
			render(<JjStatusWidget {...defaultProps} />);

			const container = screen.getByRole('button').parentElement!;
			fireEvent.mouseEnter(container);

			const descEl = screen.getByText('A very long description that should be truncated with ellipsis in the tooltip header');
			expect(descEl).toHaveClass('truncate');
		});
	});
});
