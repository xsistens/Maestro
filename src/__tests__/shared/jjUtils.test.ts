/**
 * Tests for shared Jujutsu (jj) utilities
 */

import {
	parseJjVersion,
	parseJjStatus,
	countJjChanges,
	hasJjChanges,
	parseJjBookmarks,
	parseJjChange,
	parseJjChangeId,
	isJjRepository,
	getJjStatusChar,
	getJjStatusDescription,
	getJjChangedFiles,
	getJjFilesByStatus,
} from '../../shared/jjUtils';

describe('jjUtils', () => {
	describe('parseJjVersion', () => {
		it('parses empty output', () => {
			expect(parseJjVersion('')).toEqual({ version: '', isInstalled: false });
			expect(parseJjVersion('   ')).toEqual({ version: '', isInstalled: false });
			expect(parseJjVersion('\n')).toEqual({ version: '', isInstalled: false });
		});

		it('parses standard jj version output', () => {
			expect(parseJjVersion('jj 0.24.0')).toEqual({ version: '0.24.0', isInstalled: true });
			expect(parseJjVersion('jj 0.23.1')).toEqual({ version: '0.23.1', isInstalled: true });
			expect(parseJjVersion('jj 1.0.0')).toEqual({ version: '1.0.0', isInstalled: true });
		});

		it('handles version with pre-release suffix', () => {
			expect(parseJjVersion('jj 0.24.0-dev')).toEqual({
				version: '0.24.0-dev',
				isInstalled: true,
			});
			expect(parseJjVersion('jj 0.25.0-rc1')).toEqual({
				version: '0.25.0-rc1',
				isInstalled: true,
			});
		});

		it('handles version without jj prefix', () => {
			expect(parseJjVersion('0.24.0')).toEqual({ version: '0.24.0', isInstalled: true });
		});

		it('handles unexpected output gracefully', () => {
			expect(parseJjVersion('some unexpected output')).toEqual({
				version: 'some unexpected output',
				isInstalled: true,
			});
		});

		it('handles null/undefined input gracefully', () => {
			expect(parseJjVersion(null as unknown as string)).toEqual({
				version: '',
				isInstalled: false,
			});
			expect(parseJjVersion(undefined as unknown as string)).toEqual({
				version: '',
				isInstalled: false,
			});
		});
	});

	describe('parseJjStatus', () => {
		it('parses empty output', () => {
			const result = parseJjStatus('');
			expect(result.files).toEqual([]);
			expect(result.workingCopyChangeId).toBe('');
			expect(result.workingCopyCommitId).toBe('');
		});

		it('parses status with no changes', () => {
			const output = `The working copy has no changes.
Working copy : qzmzpxyl bc915fcd (empty) (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;

			const result = parseJjStatus(output);
			expect(result.files).toEqual([]);
			expect(result.workingCopyChangeId).toBe('qzmzpxyl');
			expect(result.workingCopyCommitId).toBe('bc915fcd');
			expect(result.workingCopyEmpty).toBe(true);
			expect(result.parentChangeId).toBe('zzzzzzzz');
			expect(result.parentCommitId).toBe('00000000');
			expect(result.parentEmpty).toBe(true);
		});

		it('parses status with file changes', () => {
			const output = `Working copy changes:
A .gitignore
A Cargo.lock
A Cargo.toml
M src/main.rs
D old-file.txt
Working copy : qzmzpxyl bc915fcd (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;

			const result = parseJjStatus(output);
			expect(result.files).toHaveLength(5);
			expect(result.files[0]).toEqual({ status: 'A', path: '.gitignore' });
			expect(result.files[1]).toEqual({ status: 'A', path: 'Cargo.lock' });
			expect(result.files[2]).toEqual({ status: 'A', path: 'Cargo.toml' });
			expect(result.files[3]).toEqual({ status: 'M', path: 'src/main.rs' });
			expect(result.files[4]).toEqual({ status: 'D', path: 'old-file.txt' });
			expect(result.workingCopyEmpty).toBe(false);
		});

		it('parses status with @ notation', () => {
			const output = `Working copy changes:
A file.txt
Working copy (@) : kntqzsqt d7439b06 (empty) (no description set)
Parent commit(@-): orrkosyo 7fd1a60b master | (empty) Merge pull request #6`;

			const result = parseJjStatus(output);
			expect(result.workingCopyChangeId).toBe('kntqzsqt');
			expect(result.workingCopyCommitId).toBe('d7439b06');
			expect(result.parentChangeId).toBe('orrkosyo');
			expect(result.parentCommitId).toBe('7fd1a60b');
		});

		it('parses status with description', () => {
			const output = `The working copy has no changes.
Working copy : abcdefgh 12345678 Add new feature
Parent commit: zzzzzzzz 00000000 (empty) Initial commit`;

			const result = parseJjStatus(output);
			expect(result.workingCopyDescription).toBe('Add new feature');
			expect(result.parentDescription).toBe('Initial commit');
		});

		it('handles null/undefined input gracefully', () => {
			const resultNull = parseJjStatus(null as unknown as string);
			expect(resultNull.files).toEqual([]);

			const resultUndefined = parseJjStatus(undefined as unknown as string);
			expect(resultUndefined.files).toEqual([]);
		});
	});

	describe('countJjChanges', () => {
		it('returns 0 for empty output', () => {
			expect(countJjChanges('')).toBe(0);
			expect(countJjChanges('   ')).toBe(0);
		});

		it('returns 0 for no changes', () => {
			const output = `The working copy has no changes.
Working copy : qzmzpxyl bc915fcd (empty) (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;
			expect(countJjChanges(output)).toBe(0);
		});

		it('counts changes correctly', () => {
			const output = `Working copy changes:
A file1.ts
M file2.ts
D file3.ts
Working copy : qzmzpxyl bc915fcd (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;
			expect(countJjChanges(output)).toBe(3);
		});
	});

	describe('hasJjChanges', () => {
		it('returns false for empty output', () => {
			expect(hasJjChanges('')).toBe(false);
		});

		it('returns false for no changes', () => {
			const output = `The working copy has no changes.
Working copy : qzmzpxyl bc915fcd (empty) (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;
			expect(hasJjChanges(output)).toBe(false);
		});

		it('returns true when there are changes', () => {
			const output = `Working copy changes:
A file.ts
Working copy : qzmzpxyl bc915fcd (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;
			expect(hasJjChanges(output)).toBe(true);
		});
	});

	describe('parseJjBookmarks', () => {
		it('parses empty output', () => {
			expect(parseJjBookmarks('')).toEqual([]);
			expect(parseJjBookmarks('   ')).toEqual([]);
		});

		it('parses single bookmark', () => {
			const output = 'main: qzmzpxyl bc915fcd my description';
			const result = parseJjBookmarks(output);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				name: 'main',
				changeId: 'qzmzpxyl',
				commitId: 'bc915fcd',
				description: 'my description',
				isConflicted: false,
				remote: undefined,
				isTracked: false,
			});
		});

		it('parses multiple bookmarks', () => {
			const output = `main: qzmzpxyl bc915fcd main branch
feature/foo: abcdefgh 12345678 feature work
develop: ijklmnop 87654321 development`;

			const result = parseJjBookmarks(output);
			expect(result).toHaveLength(3);
			expect(result[0].name).toBe('main');
			expect(result[1].name).toBe('feature/foo');
			expect(result[2].name).toBe('develop');
		});

		it('parses remote bookmarks', () => {
			const output = 'main@origin: qzmzpxyl bc915fcd main branch';
			const result = parseJjBookmarks(output);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				name: 'main',
				changeId: 'qzmzpxyl',
				commitId: 'bc915fcd',
				description: 'main branch',
				isConflicted: false,
				remote: 'origin',
				isTracked: true,
			});
		});

		it('parses conflicted bookmarks', () => {
			const output = `conflicted-branch (conflicted):
  - oldChangeId oldCommitId old description
  + newChangeId newCommitId new description`;

			const result = parseJjBookmarks(output);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				name: 'conflicted-branch',
				changeId: 'newChangeId',
				commitId: 'newCommitId',
				description: 'new description',
				isConflicted: true,
				isTracked: false,
			});
		});

		it('handles null/undefined input gracefully', () => {
			expect(parseJjBookmarks(null as unknown as string)).toEqual([]);
			expect(parseJjBookmarks(undefined as unknown as string)).toEqual([]);
		});
	});

	describe('parseJjChange', () => {
		it('returns null for empty output', () => {
			expect(parseJjChange('')).toBeNull();
			expect(parseJjChange('   ')).toBeNull();
		});

		it('parses change with description', () => {
			const output = 'qzmzpxyl bc915fcd my change description';
			const result = parseJjChange(output);
			expect(result).toEqual({
				changeId: 'qzmzpxyl',
				commitId: 'bc915fcd',
				description: 'my change description',
				isEmpty: false,
				bookmarks: [],
			});
		});

		it('parses change without description', () => {
			const output = 'qzmzpxyl bc915fcd';
			const result = parseJjChange(output);
			expect(result).toEqual({
				changeId: 'qzmzpxyl',
				commitId: 'bc915fcd',
				description: '',
				isEmpty: true,
				bookmarks: [],
			});
		});

		it('parses empty change marker', () => {
			const output = 'qzmzpxyl bc915fcd (empty)';
			const result = parseJjChange(output);
			expect(result?.isEmpty).toBe(true);
		});

		it('handles insufficient parts', () => {
			expect(parseJjChange('onlyOneId')).toBeNull();
		});
	});

	describe('parseJjChangeId', () => {
		it('returns empty for empty output', () => {
			expect(parseJjChangeId('')).toBe('');
			expect(parseJjChangeId('   ')).toBe('');
		});

		it('parses change ID from output', () => {
			expect(parseJjChangeId('qzmzpxyl')).toBe('qzmzpxyl');
			expect(parseJjChangeId('qzmzpxyl\n')).toBe('qzmzpxyl');
			expect(parseJjChangeId('  qzmzpxyl  ')).toBe('qzmzpxyl');
		});

		it('returns first line only', () => {
			expect(parseJjChangeId('qzmzpxyl\nabcdefgh')).toBe('qzmzpxyl');
		});
	});

	describe('isJjRepository', () => {
		it('returns true when .jj directory exists', () => {
			expect(isJjRepository(true)).toBe(true);
		});

		it('returns false when .jj directory does not exist', () => {
			expect(isJjRepository(false)).toBe(false);
		});
	});

	describe('getJjStatusChar', () => {
		it('returns correct status characters', () => {
			expect(getJjStatusChar('A')).toBe('A');
			expect(getJjStatusChar('M')).toBe('M');
			expect(getJjStatusChar('D')).toBe('D');
			expect(getJjStatusChar('R')).toBe('R');
			expect(getJjStatusChar('C')).toBe('C');
		});

		it('returns ? for unknown status', () => {
			expect(getJjStatusChar('X' as 'A')).toBe('?');
		});
	});

	describe('getJjStatusDescription', () => {
		it('returns correct descriptions', () => {
			expect(getJjStatusDescription('A')).toBe('Added');
			expect(getJjStatusDescription('M')).toBe('Modified');
			expect(getJjStatusDescription('D')).toBe('Deleted');
			expect(getJjStatusDescription('R')).toBe('Renamed');
			expect(getJjStatusDescription('C')).toBe('Copied');
		});

		it('returns Unknown for unknown status', () => {
			expect(getJjStatusDescription('X' as 'A')).toBe('Unknown');
		});
	});

	describe('getJjChangedFiles', () => {
		it('returns empty array for empty status', () => {
			const status = parseJjStatus('');
			expect(getJjChangedFiles(status)).toEqual([]);
		});

		it('returns file paths from status', () => {
			const output = `Working copy changes:
A file1.ts
M file2.ts
D file3.ts
Working copy : qzmzpxyl bc915fcd (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;

			const status = parseJjStatus(output);
			expect(getJjChangedFiles(status)).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
		});
	});

	describe('getJjFilesByStatus', () => {
		it('filters files by status type', () => {
			const output = `Working copy changes:
A added1.ts
A added2.ts
M modified.ts
D deleted.ts
Working copy : qzmzpxyl bc915fcd (no description set)
Parent commit: zzzzzzzz 00000000 (empty) (no description set)`;

			const status = parseJjStatus(output);
			expect(getJjFilesByStatus(status, 'A')).toEqual(['added1.ts', 'added2.ts']);
			expect(getJjFilesByStatus(status, 'M')).toEqual(['modified.ts']);
			expect(getJjFilesByStatus(status, 'D')).toEqual(['deleted.ts']);
			expect(getJjFilesByStatus(status, 'R')).toEqual([]);
		});
	});
});
