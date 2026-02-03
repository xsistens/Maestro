/**
 * VcsSettings - Settings section for Version Control System configuration
 *
 * This component provides a UI for:
 * - Selecting VCS mode: Always Git, Always Jujutsu, or Auto-detect
 * - Showing jj installation status with version
 * - Configuring custom jj binary path
 * - Providing installation instructions when jj is not available
 *
 * Usage:
 * ```tsx
 * <VcsSettings
 *   theme={theme}
 *   vcsMode={vcsMode}
 *   setVcsMode={setVcsMode}
 *   jjPath={jjPath}
 *   setJjPath={setJjPath}
 *   jjInstalled={jjInstalled}
 *   checkJjInstallation={checkJjInstallation}
 * />
 * ```
 */

import React, { useState, useEffect } from 'react';
import { GitBranch, Check, X, ExternalLink, Loader2, FolderOpen, RefreshCw } from 'lucide-react';
import type { Theme } from '../../types';
import type { VcsMode } from '../../hooks/settings/useSettings';

export interface VcsSettingsProps {
	/** Theme object for styling */
	theme: Theme;
	/** Current VCS mode setting */
	vcsMode: VcsMode;
	/** Callback to update VCS mode */
	setVcsMode: (value: VcsMode) => void;
	/** Custom jj binary path */
	jjPath: string;
	/** Callback to update jj path */
	setJjPath: (value: string) => void;
	/** Whether jj is installed and available */
	jjInstalled: boolean;
	/** Callback to re-check jj installation */
	checkJjInstallation: () => Promise<void>;
}

// VCS mode options configuration
const VCS_MODE_OPTIONS: {
	value: VcsMode;
	label: string;
	description: string;
}[] = [
	{
		value: 'git',
		label: 'Always Git',
		description: 'Use Git for all version control operations',
	},
	{
		value: 'jj',
		label: 'Always Jujutsu',
		description: 'Use Jujutsu (jj) for all version control operations',
	},
	{
		value: 'auto',
		label: 'Auto-detect',
		description: 'Automatically detect and use the appropriate VCS for each repository',
	},
];

export function VcsSettings({
	theme,
	vcsMode,
	setVcsMode,
	jjPath,
	setJjPath,
	jjInstalled,
	checkJjInstallation,
}: VcsSettingsProps) {
	// Local state for jj version
	const [jjVersion, setJjVersion] = useState<string | null>(null);
	const [checkingInstallation, setCheckingInstallation] = useState(false);
	const [showCustomPath, setShowCustomPath] = useState(false);

	// Check jj installation on mount to ensure status is current
	useEffect(() => {
		checkJjInstallation();
	}, [checkJjInstallation]);

	// Fetch jj version when installed
	useEffect(() => {
		const fetchVersion = async () => {
			if (jjInstalled) {
				try {
					const version = await window.maestro.jj.getVersion();
					setJjVersion(version);
				} catch (error) {
					console.error('[VcsSettings] Failed to get jj version:', error);
					setJjVersion(null);
				}
			} else {
				setJjVersion(null);
			}
		};
		fetchVersion();
	}, [jjInstalled]);

	// Show custom path input if a custom path is already set
	useEffect(() => {
		if (jjPath) {
			setShowCustomPath(true);
		}
	}, [jjPath]);

	// Handle re-checking jj installation
	const handleRefreshInstallation = async () => {
		setCheckingInstallation(true);
		try {
			await checkJjInstallation();
		} finally {
			setCheckingInstallation(false);
		}
	};

	// Handle VCS mode selection
	const handleModeChange = (mode: VcsMode) => {
		// setVcsMode has validation built in - it will prevent 'jj' mode if not installed
		setVcsMode(mode);
	};

	// Open external link to jj installation docs
	const handleOpenDocs = () => {
		window.open('https://martinvonz.github.io/jj/latest/install-and-setup/', '_blank');
	};

	return (
		<div
			className="flex items-start gap-3 p-4 rounded-xl border relative"
			style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
		>
			{/* Icon */}
			<div
				className="p-2 rounded-lg flex-shrink-0"
				style={{ backgroundColor: theme.colors.accent + '20' }}
			>
				<GitBranch className="w-5 h-5" style={{ color: theme.colors.accent }} />
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<p className="text-[10px] uppercase font-bold opacity-50 mb-1">Version Control</p>
				<p className="font-semibold mb-1">VCS Mode</p>
				<p className="text-xs opacity-60 mb-3">
					Choose which version control system Maestro should use for repository operations.
				</p>

				{/* Installation Status */}
				<div
					className="p-3 rounded border mb-4"
					style={{
						borderColor: theme.colors.border,
						backgroundColor: theme.colors.bgActivity,
					}}
				>
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-bold uppercase opacity-60">Jujutsu Status</span>
						<button
							type="button"
							onClick={handleRefreshInstallation}
							disabled={checkingInstallation}
							className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
							style={{ color: theme.colors.textDim }}
							title="Refresh installation status"
						>
							{checkingInstallation ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<RefreshCw className="w-4 h-4" />
							)}
						</button>
					</div>
					<div className="flex items-center gap-2">
						{jjInstalled ? (
							<>
								<div
									className="p-1 rounded-full"
									style={{ backgroundColor: theme.colors.success + '20' }}
								>
									<Check className="w-4 h-4" style={{ color: theme.colors.success }} />
								</div>
								<div>
									<span className="text-sm font-medium" style={{ color: theme.colors.success }}>
										Installed
									</span>
									{jjVersion && (
										<span
											className="text-xs ml-2 font-mono"
											style={{ color: theme.colors.textDim }}
										>
											{jjVersion}
										</span>
									)}
								</div>
							</>
						) : (
							<>
								<div
									className="p-1 rounded-full"
									style={{ backgroundColor: theme.colors.error + '20' }}
								>
									<X className="w-4 h-4" style={{ color: theme.colors.error }} />
								</div>
								<div className="flex-1">
									<span className="text-sm font-medium" style={{ color: theme.colors.error }}>
										Not Installed
									</span>
									<p className="text-xs mt-1" style={{ color: theme.colors.textDim }}>
										Install Jujutsu to enable jj support
									</p>
								</div>
								<button
									type="button"
									onClick={handleOpenDocs}
									className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-white/10"
									style={{ color: theme.colors.accent }}
								>
									<ExternalLink className="w-3 h-3" />
									Install Guide
								</button>
							</>
						)}
					</div>
				</div>

				{/* VCS Mode Selection */}
				<div className="space-y-2 mb-4">
					{VCS_MODE_OPTIONS.map((option) => {
						const isDisabled = option.value === 'jj' && !jjInstalled;
						const isSelected = vcsMode === option.value;

						return (
							<button
								key={option.value}
								type="button"
								onClick={() => !isDisabled && handleModeChange(option.value)}
								disabled={isDisabled}
								className={`w-full text-left p-3 rounded border transition-all ${
									isSelected ? 'ring-2' : ''
								} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'}`}
								style={
									{
										borderColor: theme.colors.border,
										backgroundColor: isSelected ? theme.colors.accentDim : theme.colors.bgMain,
										'--tw-ring-color': theme.colors.accent,
									} as React.CSSProperties
								}
								title={
									isDisabled
										? 'Jujutsu is not installed. Install jj to enable this option.'
										: undefined
								}
							>
								<div className="flex items-center justify-between">
									<div className="flex-1">
										<div
											className="font-medium flex items-center gap-2"
											style={{ color: theme.colors.textMain }}
										>
											{option.label}
											{isDisabled && (
												<span
													className="text-xs px-1.5 py-0.5 rounded"
													style={{
														backgroundColor: theme.colors.warning + '20',
														color: theme.colors.warning,
													}}
												>
													jj not installed
												</span>
											)}
										</div>
										<div className="text-xs mt-1" style={{ color: theme.colors.textDim }}>
											{option.description}
										</div>
									</div>
									{isSelected && (
										<Check
											className="w-4 h-4 flex-shrink-0"
											style={{ color: theme.colors.accent }}
										/>
									)}
								</div>
							</button>
						);
					})}
				</div>

				{/* Custom jj Path (collapsible) */}
				<div>
					<button
						type="button"
						onClick={() => setShowCustomPath(!showCustomPath)}
						className="flex items-center gap-2 text-xs font-medium transition-colors hover:opacity-80"
						style={{ color: theme.colors.textDim }}
					>
						<FolderOpen className="w-3 h-3" />
						Custom jj Binary Path
						<span className="opacity-50">(optional)</span>
					</button>

					{showCustomPath && (
						<div className="mt-2">
							<input
								type="text"
								value={jjPath}
								onChange={(e) => setJjPath(e.target.value)}
								placeholder="/usr/local/bin/jj"
								className="w-full p-2 rounded border bg-transparent outline-none text-sm font-mono focus:ring-2"
								style={
									{
										borderColor: theme.colors.border,
										color: theme.colors.textMain,
										'--tw-ring-color': theme.colors.accent,
									} as React.CSSProperties
								}
							/>
							<p className="text-xs opacity-50 mt-1">
								Leave empty to use jj from your system PATH. Specify a full path to use a specific
								jj binary.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default VcsSettings;
