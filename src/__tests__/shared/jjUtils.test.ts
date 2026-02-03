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
	parseJjLog,
	parseJjDiff,
	parseJjShow,
	parseJjDiffDetailed,
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

	describe('parseJjLog', () => {
		it('returns empty array for empty output', () => {
			expect(parseJjLog('')).toEqual([]);
			expect(parseJjLog('   ')).toEqual([]);
		});

		it('returns empty array for null/undefined input', () => {
			expect(parseJjLog(null as unknown as string)).toEqual([]);
			expect(parseJjLog(undefined as unknown as string)).toEqual([]);
		});

		it('parses single log entry', () => {
			const output = 'abc123\x1fdef456\x1fMy change\x1ffalse\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1fmain\n';
			const result = parseJjLog(output);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				changeId: 'abc123',
				commitId: 'def456',
				description: 'My change',
				isEmpty: false,
				author: 'John',
				email: 'john@test.com',
				timestamp: '2024-01-01',
				bookmarks: ['main'],
			});
		});

		it('parses multiple log entries', () => {
			const output = [
				'abc123\x1fdef456\x1fFirst change\x1ffalse\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1fmain',
				'ghi789\x1fjkl012\x1fSecond change\x1ffalse\x1fJane\x1fjane@test.com\x1f2024-01-02\x1f',
			].join('\n');

			const result = parseJjLog(output);
			expect(result).toHaveLength(2);
			expect(result[0].changeId).toBe('abc123');
			expect(result[1].changeId).toBe('ghi789');
		});

		it('parses empty changes correctly', () => {
			const output = 'abc123\x1fdef456\x1f\x1ftrue\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1f\n';
			const result = parseJjLog(output);
			expect(result).toHaveLength(1);
			expect(result[0].isEmpty).toBe(true);
			expect(result[0].description).toBe('');
			expect(result[0].bookmarks).toEqual([]);
		});

		it('parses multiple bookmarks', () => {
			const output = 'abc123\x1fdef456\x1fChange\x1ffalse\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1fmain develop\n';
			const result = parseJjLog(output);
			expect(result[0].bookmarks).toEqual(['main', 'develop']);
		});

		it('skips lines with insufficient fields', () => {
			const output = 'abc\x1fdef\x1f\n\nbad line\nabc123\x1fdef456\x1fChange\x1ffalse\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1f\n';
			const result = parseJjLog(output);
			// Should parse the entries that have at least 4 fields
			expect(result.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('parseJjDiff', () => {
		it('returns empty result for empty output', () => {
			expect(parseJjDiff('')).toEqual({ raw: '', files: [] });
			expect(parseJjDiff('   ')).toEqual({ raw: '', files: [] });
		});

		it('returns empty result for null/undefined input', () => {
			expect(parseJjDiff(null as unknown as string)).toEqual({ raw: '', files: [] });
			expect(parseJjDiff(undefined as unknown as string)).toEqual({ raw: '', files: [] });
		});

		it('parses modified file in diff', () => {
			const output = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old
+new`;

			const result = parseJjDiff(output);
			expect(result.raw).toBe(output);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'file.txt', status: 'M' });
		});

		it('parses added file in diff', () => {
			const output = `diff --git a/new.txt b/new.txt
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+content`;

			const result = parseJjDiff(output);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'new.txt', status: 'A' });
		});

		it('parses deleted file in diff', () => {
			const output = `diff --git a/old.txt b/old.txt
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-content`;

			const result = parseJjDiff(output);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'old.txt', status: 'D' });
		});

		it('parses renamed file in diff', () => {
			const output = `diff --git a/old-name.txt b/new-name.txt
--- a/old-name.txt
+++ b/new-name.txt`;

			const result = parseJjDiff(output);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'new-name.txt', status: 'R' });
		});

		it('parses multiple files in diff', () => {
			const output = `diff --git a/file1.txt b/file1.txt
--- a/file1.txt
+++ b/file1.txt
@@ -1 +1 @@
-old
+new
diff --git a/file2.txt b/file2.txt
--- /dev/null
+++ b/file2.txt
@@ -0,0 +1 @@
+added
diff --git a/file3.txt b/file3.txt
--- a/file3.txt
+++ /dev/null
@@ -1 +0,0 @@
-deleted`;

			const result = parseJjDiff(output);
			expect(result.files).toHaveLength(3);
			expect(result.files[0]).toEqual({ path: 'file1.txt', status: 'M' });
			expect(result.files[1]).toEqual({ path: 'file2.txt', status: 'A' });
			expect(result.files[2]).toEqual({ path: 'file3.txt', status: 'D' });
		});

		it('preserves raw diff output', () => {
			const output = 'diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-a\n+b';
			const result = parseJjDiff(output);
			expect(result.raw).toBe(output);
		});
	});

	describe('parseJjShow', () => {
		it('returns null for empty output', () => {
			expect(parseJjShow('')).toBeNull();
			expect(parseJjShow('   ')).toBeNull();
		});

		it('returns null for null/undefined input', () => {
			expect(parseJjShow(null as unknown as string)).toBeNull();
			expect(parseJjShow(undefined as unknown as string)).toBeNull();
		});

		it('parses change with metadata and diff', () => {
			const output = `Change ID: qzmzpxylbc915fcdaabbccdd
Commit ID: bc915fcd12345678aabbccdd
Author: John Doe <john@example.com> (2024-01-15 10:30:00)

Description: Add new feature

diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old content
+new content`;

			const result = parseJjShow(output);
			expect(result).not.toBeNull();
			expect(result!.changeId).toBe('qzmzpxylbc915fcdaabbccdd');
			expect(result!.commitId).toBe('bc915fcd12345678aabbccdd');
			expect(result!.author).toBe('John Doe');
			expect(result!.email).toBe('john@example.com');
			expect(result!.timestamp).toBe('2024-01-15 10:30:00');
			expect(result!.description).toBe('Add new feature');
			expect(result!.isEmpty).toBe(false);
			expect(result!.diff.files).toHaveLength(1);
			expect(result!.diff.files[0]).toEqual({ path: 'file.txt', status: 'M' });
		});

		it('parses change with no description', () => {
			const output = `Change ID: abc123
Commit ID: def456
Author: Jane <jane@test.com> (2024-02-01 09:00:00)

Description: (no description set)
`;

			const result = parseJjShow(output);
			expect(result).not.toBeNull();
			expect(result!.description).toBe('');
			expect(result!.isEmpty).toBe(true);
		});

		it('parses change with bookmarks', () => {
			const output = `Change ID: abc123
Commit ID: def456
Author: Test <test@test.com> (2024-01-01 00:00:00)
Bookmarks: main develop

Description: My change

diff --git a/f.txt b/f.txt
--- /dev/null
+++ b/f.txt
@@ -0,0 +1 @@
+hello`;

			const result = parseJjShow(output);
			expect(result).not.toBeNull();
			expect(result!.bookmarks).toEqual(['main', 'develop']);
		});

		it('parses change with multiple files in diff', () => {
			const output = `Change ID: xyz789
Commit ID: uvw012
Author: Dev <dev@example.com> (2024-03-15 14:00:00)

Description: Multi-file change

diff --git a/added.txt b/added.txt
--- /dev/null
+++ b/added.txt
@@ -0,0 +1 @@
+new file
diff --git a/modified.txt b/modified.txt
--- a/modified.txt
+++ b/modified.txt
@@ -1 +1 @@
-old
+new
diff --git a/deleted.txt b/deleted.txt
--- a/deleted.txt
+++ /dev/null
@@ -1 +0,0 @@
-removed`;

			const result = parseJjShow(output);
			expect(result).not.toBeNull();
			expect(result!.diff.files).toHaveLength(3);
			expect(result!.diff.files[0]).toEqual({ path: 'added.txt', status: 'A' });
			expect(result!.diff.files[1]).toEqual({ path: 'modified.txt', status: 'M' });
			expect(result!.diff.files[2]).toEqual({ path: 'deleted.txt', status: 'D' });
		});

		it('parses change with metadata only (no diff)', () => {
			const output = `Change ID: emptychange
Commit ID: emptycommit
Author: Dev <dev@test.com> (2024-01-01 00:00:00)

Description: (no description set)
`;

			const result = parseJjShow(output);
			expect(result).not.toBeNull();
			expect(result!.changeId).toBe('emptychange');
			expect(result!.diff.files).toEqual([]);
			expect(result!.diff.raw).toBe('');
		});

		it('returns null when no IDs found', () => {
			const output = 'Some random output\nwithout any change metadata';
			expect(parseJjShow(output)).toBeNull();
		});

		it('parses author without email', () => {
			const output = `Change ID: abc123
Commit ID: def456
Author: JustAName (2024-06-01 12:00:00)

Description: Test
`;

			const result = parseJjShow(output);
			expect(result).not.toBeNull();
			expect(result!.author).toBe('JustAName');
			expect(result!.email).toBe('');
			expect(result!.timestamp).toBe('2024-06-01 12:00:00');
		});
	});

	describe('parseJjDiffDetailed', () => {
		it('returns empty result for empty output', () => {
			const result = parseJjDiffDetailed('');
			expect(result).toEqual({ raw: '', files: [], fileDiffs: [], additions: 0, deletions: 0 });
		});

		it('returns empty result for null/undefined input', () => {
			expect(parseJjDiffDetailed(null as unknown as string)).toEqual({
				raw: '',
				files: [],
				fileDiffs: [],
				additions: 0,
				deletions: 0,
			});
			expect(parseJjDiffDetailed(undefined as unknown as string)).toEqual({
				raw: '',
				files: [],
				fileDiffs: [],
				additions: 0,
				deletions: 0,
			});
		});

		it('parses modified file with stats', () => {
			const output = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 unchanged
-old line
+new line
+added line`;

			const result = parseJjDiffDetailed(output);
			expect(result.raw).toBe(output);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'file.txt', status: 'M' });
			expect(result.fileDiffs).toHaveLength(1);
			expect(result.fileDiffs[0].oldPath).toBe('file.txt');
			expect(result.fileDiffs[0].newPath).toBe('file.txt');
			expect(result.fileDiffs[0].status).toBe('M');
			expect(result.fileDiffs[0].isNewFile).toBe(false);
			expect(result.fileDiffs[0].isDeletedFile).toBe(false);
			expect(result.fileDiffs[0].isBinary).toBe(false);
			expect(result.fileDiffs[0].additions).toBe(2);
			expect(result.fileDiffs[0].deletions).toBe(1);
			expect(result.additions).toBe(2);
			expect(result.deletions).toBe(1);
		});

		it('parses added file', () => {
			const output = `diff --git a/new.txt b/new.txt
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3`;

			const result = parseJjDiffDetailed(output);
			expect(result.files[0]).toEqual({ path: 'new.txt', status: 'A' });
			expect(result.fileDiffs[0].isNewFile).toBe(true);
			expect(result.fileDiffs[0].additions).toBe(3);
			expect(result.fileDiffs[0].deletions).toBe(0);
			expect(result.additions).toBe(3);
			expect(result.deletions).toBe(0);
		});

		it('parses deleted file', () => {
			const output = `diff --git a/old.txt b/old.txt
--- a/old.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-line 1
-line 2`;

			const result = parseJjDiffDetailed(output);
			expect(result.files[0]).toEqual({ path: 'old.txt', status: 'D' });
			expect(result.fileDiffs[0].isDeletedFile).toBe(true);
			expect(result.fileDiffs[0].additions).toBe(0);
			expect(result.fileDiffs[0].deletions).toBe(2);
		});

		it('parses renamed file', () => {
			const output = `diff --git a/old-name.txt b/new-name.txt
--- a/old-name.txt
+++ b/new-name.txt
@@ -1 +1 @@
-old
+new`;

			const result = parseJjDiffDetailed(output);
			expect(result.files[0]).toEqual({ path: 'new-name.txt', status: 'R' });
			expect(result.fileDiffs[0].oldPath).toBe('old-name.txt');
			expect(result.fileDiffs[0].newPath).toBe('new-name.txt');
		});

		it('parses binary file', () => {
			const output = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;

			const result = parseJjDiffDetailed(output);
			expect(result.files[0]).toEqual({ path: 'image.png', status: 'M' });
			expect(result.fileDiffs[0].isBinary).toBe(true);
			expect(result.fileDiffs[0].additions).toBe(0);
			expect(result.fileDiffs[0].deletions).toBe(0);
		});

		it('parses multiple files with aggregate stats', () => {
			const output = `diff --git a/file1.txt b/file1.txt
--- a/file1.txt
+++ b/file1.txt
@@ -1,2 +1,3 @@
 unchanged
-old
+new
+extra
diff --git a/file2.txt b/file2.txt
--- /dev/null
+++ b/file2.txt
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/file3.txt b/file3.txt
--- a/file3.txt
+++ /dev/null
@@ -1 +0,0 @@
-goodbye`;

			const result = parseJjDiffDetailed(output);
			expect(result.files).toHaveLength(3);
			expect(result.fileDiffs).toHaveLength(3);

			// file1: 2 additions, 1 deletion
			expect(result.fileDiffs[0].additions).toBe(2);
			expect(result.fileDiffs[0].deletions).toBe(1);
			// file2: 2 additions, 0 deletions
			expect(result.fileDiffs[1].additions).toBe(2);
			expect(result.fileDiffs[1].deletions).toBe(0);
			// file3: 0 additions, 1 deletion
			expect(result.fileDiffs[2].additions).toBe(0);
			expect(result.fileDiffs[2].deletions).toBe(1);

			// Totals: 4 additions, 2 deletions
			expect(result.additions).toBe(4);
			expect(result.deletions).toBe(2);
		});

		it('preserves per-file diffText for component compatibility', () => {
			const output = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
diff --git a/b.txt b/b.txt
--- /dev/null
+++ b/b.txt
@@ -0,0 +1 @@
+content`;

			const result = parseJjDiffDetailed(output);
			expect(result.fileDiffs).toHaveLength(2);
			// Each diffText should start with its own "diff --git" header
			expect(result.fileDiffs[0].diffText).toContain('diff --git a/a.txt b/a.txt');
			expect(result.fileDiffs[1].diffText).toContain('diff --git a/b.txt b/b.txt');
			// diffText should not contain the other file's content
			expect(result.fileDiffs[0].diffText).not.toContain('b.txt');
			expect(result.fileDiffs[1].diffText).not.toContain('a.txt');
		});

		it('detects new file mode', () => {
			const output = `diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+content`;

			const result = parseJjDiffDetailed(output);
			expect(result.fileDiffs[0].isNewFile).toBe(true);
			expect(result.fileDiffs[0].status).toBe('A');
		});

		it('detects deleted file mode', () => {
			const output = `diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-content`;

			const result = parseJjDiffDetailed(output);
			expect(result.fileDiffs[0].isDeletedFile).toBe(true);
			expect(result.fileDiffs[0].status).toBe('D');
		});
	});
});
