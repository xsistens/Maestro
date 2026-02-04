import { memo } from 'react';
import { GitStatusWidget } from './GitStatusWidget';
import { JjStatusWidget } from './JjStatusWidget';
import type { Theme } from '../types';

interface VcsStatusWidgetProps {
	/** Session ID to look up VCS status from context */
	sessionId: string;
	/** Whether this session is a git repo */
	isGitRepo: boolean;
	/** Effective VCS type for this session ('git' | 'jj' | undefined) */
	vcsType?: 'git' | 'jj';
	theme: Theme;
	onViewDiff: () => void;
	onViewLog?: () => void;
	/** Use compact mode - just show file count without breakdown */
	compact?: boolean;
}

/**
 * VcsStatusWidget - Unified container that renders the appropriate VCS status widget.
 *
 * Conditionally renders GitStatusWidget OR JjStatusWidget based on the session's
 * active VCS type (determined by getEffectiveVcs from Phase 1).
 *
 * - For 'jj' repos: renders JjStatusWidget with purple/violet styling
 * - For 'git' repos (or undefined): renders GitStatusWidget with git styling
 * - For colocated repos: the vcsType prop reflects the user's preference
 *
 * PERF: Memoized to prevent re-renders when parent re-renders with same props.
 */
export const VcsStatusWidget = memo(function VcsStatusWidget({
	sessionId,
	isGitRepo,
	vcsType,
	theme,
	onViewDiff,
	onViewLog,
	compact = false,
}: VcsStatusWidgetProps) {
	if (vcsType === 'jj') {
		return (
			<JjStatusWidget
				sessionId={sessionId}
				isJjRepo={isGitRepo}
				theme={theme}
				onViewDiff={onViewDiff}
				onViewLog={onViewLog}
				compact={compact}
			/>
		);
	}

	// Default to git widget (covers 'git' and undefined cases)
	return (
		<GitStatusWidget
			sessionId={sessionId}
			isGitRepo={isGitRepo}
			theme={theme}
			onViewDiff={onViewDiff}
			onViewLog={onViewLog}
			compact={compact}
			vcsType={vcsType}
		/>
	);
});
