import { useState, useRef, useEffect, memo } from 'react';
import { Plus, Minus, FileEdit, FileDiff, History, AlertTriangle } from 'lucide-react';
import type { Theme } from '../types';
import { useJjFileStatus, useJjDetail, useJjBranch, type GitFileChange } from '../contexts/JjStatusContext';

interface JjStatusWidgetProps {
	/** Session ID to look up jj status from context */
	sessionId: string;
	/** Whether this session is a jj repo */
	isJjRepo: boolean;
	theme: Theme;
	onViewDiff: () => void;
	onViewLog?: () => void;
	/** Use compact mode - just show file count without breakdown */
	compact?: boolean;
}

/**
 * JjStatusWidget - Displays jj (Jujutsu) file changes with GitHub-style diff bars
 *
 * Consumes jj status data from focused contexts to reduce cascade re-renders:
 * - useJjFileStatus for file counts (changes on file operations)
 * - useJjDetail for detailed file changes (only for active session)
 * - useJjBranch for bookmark/change ID info
 *
 * Visual distinction from GitStatusWidget:
 * - Uses purple/violet accent color instead of git's orange
 * - Shows "JJ" text label instead of git branch icon
 * - Displays change description in tooltip header
 * - Shows conflict warnings when present
 *
 * PERF: Memoized to prevent re-renders when parent re-renders with same props.
 */
export const JjStatusWidget = memo(function JjStatusWidget({
	sessionId,
	isJjRepo,
	theme,
	onViewDiff,
	onViewLog,
	compact = false,
}: JjStatusWidgetProps) {
	// Tooltip hover state with timeout for smooth UX
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Get jj status from focused contexts
	const { getFileCount, hasConflicts } = useJjFileStatus();
	const { getFileDetails } = useJjDetail();
	const { getBranchInfo } = useJjBranch();

	const fileCount = getFileCount(sessionId);
	const fileDetails = getFileDetails(sessionId);
	const branchInfo = getBranchInfo(sessionId);
	const conflicts = hasConflicts(sessionId);

	// Cleanup hover timeout on unmount
	useEffect(() => {
		return () => {
			if (tooltipTimeout.current) {
				clearTimeout(tooltipTimeout.current);
			}
		};
	}, []);

	// Don't render if not a jj repo or no file count or no changes
	if (!isJjRepo || fileCount === 0) {
		return null;
	}

	// Use detailed file changes if available (active session), otherwise show basic counts
	const fileChanges = fileDetails?.fileChanges || [];
	const additions = fileDetails?.totalAdditions ?? 0;
	const deletions = fileDetails?.totalDeletions ?? 0;
	const modified = fileDetails?.modifiedCount ?? 0;
	const totalChanges = additions + deletions + modified;
	const description = fileDetails?.description;
	const conflictedFiles = fileDetails?.conflictedFiles || [];

	return (
		<div
			className="relative shrink-0"
			onMouseEnter={() => {
				// Clear any pending close timeout
				if (tooltipTimeout.current) {
					clearTimeout(tooltipTimeout.current);
					tooltipTimeout.current = null;
				}
				setTooltipOpen(true);
			}}
			onMouseLeave={() => {
				// Delay closing to allow mouse to reach the dropdown
				tooltipTimeout.current = setTimeout(() => {
					setTooltipOpen(false);
				}, 150);
			}}
		>
			<button
				onClick={onViewDiff}
				className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors hover:bg-white/5"
				style={{ color: theme.colors.textMain }}
				title={compact ? `+${additions} −${deletions} ~${modified}` : undefined}
			>
				{compact ? (
					// Compact mode: just show file count
					<span className="flex items-center gap-1">
						<FileDiff className="w-3 h-3" style={{ color: theme.colors.textDim }} />
						<span style={{ color: theme.colors.textDim }}>{fileCount}</span>
					</span>
				) : (
					// Full mode: show breakdown by type with jj-specific styling
					<>
						{/* JJ label with purple accent for visual distinction from git */}
						<span className="font-bold text-[10px] text-violet-400">JJ</span>

						{conflicts && (
							<span className="flex items-center gap-0.5 text-yellow-500" title="Merge conflicts">
								<AlertTriangle className="w-3 h-3" />
							</span>
						)}

						{additions > 0 && (
							<span className="flex items-center gap-0.5 text-green-500">
								<Plus className="w-3 h-3" />
								{additions}
							</span>
						)}

						{deletions > 0 && (
							<span className="flex items-center gap-0.5 text-red-500">
								<Minus className="w-3 h-3" />
								{deletions}
							</span>
						)}

						{modified > 0 && (
							<span className="flex items-center gap-0.5 text-orange-500">
								<FileEdit className="w-3 h-3" />
								{modified}
							</span>
						)}
					</>
				)}
			</button>

			{/* Hover tooltip showing file list with GitHub-style diff bars */}
			{tooltipOpen && fileChanges.length > 0 && (
				<>
					{/* Invisible bridge to prevent hover gap */}
					<div
						className="absolute left-0 right-0 h-3 pointer-events-auto"
						style={{ top: '100%' }}
						onMouseEnter={() => {
							if (tooltipTimeout.current) {
								clearTimeout(tooltipTimeout.current);
								tooltipTimeout.current = null;
							}
							setTooltipOpen(true);
						}}
					/>
					<div
						className="absolute top-full left-0 mt-2 w-max max-w-[400px] rounded shadow-xl z-[100] pointer-events-auto"
						style={{
							backgroundColor: theme.colors.bgSidebar,
							border: `1px solid ${theme.colors.border}`,
						}}
						onMouseEnter={() => {
							if (tooltipTimeout.current) {
								clearTimeout(tooltipTimeout.current);
								tooltipTimeout.current = null;
							}
							setTooltipOpen(true);
						}}
						onMouseLeave={() => {
							tooltipTimeout.current = setTimeout(() => {
								setTooltipOpen(false);
							}, 150);
						}}
					>
						{/* Tooltip header with change description */}
						<div
							className="text-[10px] uppercase font-bold p-3 border-b"
							style={{
								color: theme.colors.textDim,
								borderColor: theme.colors.border,
							}}
						>
							<div>
								Changed Files ({totalChanges}) • +{additions} −{deletions}
							</div>
							{description && (
								<div
									className="mt-1 normal-case font-normal text-xs truncate max-w-[380px]"
									style={{ color: theme.colors.textMain }}
									title={description}
								>
									{description}
								</div>
							)}
						</div>

						{/* Conflict warning banner */}
						{conflictedFiles.length > 0 && (
							<div
								className="flex items-center gap-2 px-3 py-2 border-b text-xs"
								style={{
									borderColor: theme.colors.border,
									backgroundColor: 'rgba(234, 179, 8, 0.1)',
									color: '#eab308',
								}}
							>
								<AlertTriangle className="w-3.5 h-3.5 shrink-0" />
								{conflictedFiles.length} conflicted {conflictedFiles.length === 1 ? 'file' : 'files'}
							</div>
						)}

						<div className="max-h-96 overflow-y-auto scrollbar-thin">
							{fileChanges.map((file: GitFileChange, idx: number) => {
								const total = file.additions + file.deletions;
								const maxBarWidth = 60; // Max width in pixels for the bar
								const additionsWidth = total > 0 ? (file.additions / total) * maxBarWidth : 0;
								const deletionsWidth = total > 0 ? (file.deletions / total) * maxBarWidth : 0;
								const isConflicted = conflictedFiles.includes(file.path);

								return (
									<div
										key={idx}
										className="px-3 py-2 text-xs border-b last:border-b-0"
										style={{
											borderColor: theme.colors.border,
											color: theme.colors.textMain,
										}}
									>
										<div className="flex items-center justify-between gap-3 mb-1">
											<span className="font-mono flex-1 min-w-0" title={file.path}>
												{isConflicted && (
													<AlertTriangle className="w-3 h-3 inline-block mr-1 text-yellow-500" />
												)}
												{file.path}
											</span>
											<div className="flex items-center gap-2 shrink-0 text-[10px]">
												{file.additions > 0 && (
													<span className="text-green-500">+{file.additions}</span>
												)}
												{file.deletions > 0 && (
													<span className="text-red-500">−{file.deletions}</span>
												)}
											</div>
										</div>
										{/* GitHub-style diff bar */}
										{total > 0 && (
											<div className="flex gap-0.5 h-2">
												{file.additions > 0 && (
													<div
														className="bg-green-500 rounded-sm"
														style={{ width: `${additionsWidth}px` }}
													/>
												)}
												{file.deletions > 0 && (
													<div
														className="bg-red-500 rounded-sm"
														style={{ width: `${deletionsWidth}px` }}
													/>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
						<button
							onClick={onViewDiff}
							className="flex items-center justify-center gap-2 text-xs p-2 border-t w-full hover:bg-white/10 transition-colors cursor-pointer"
							style={{
								color: theme.colors.textDim,
								borderColor: theme.colors.border,
							}}
						>
							<FileDiff className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
							View Full Diff
						</button>
						{onViewLog && (
							<button
								onClick={onViewLog}
								className="flex items-center justify-center gap-2 text-xs p-2 border-t w-full hover:bg-white/10 transition-colors cursor-pointer"
								style={{
									color: theme.colors.textDim,
									borderColor: theme.colors.border,
								}}
							>
								<History className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
								View JJ Log
							</button>
						)}
					</div>
				</>
			)}
		</div>
	);
});
