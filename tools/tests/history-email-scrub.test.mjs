// History email scrub: identity-only rewrite, dry-run default, mirror-only apply.
// Uses a synthetic private-looking address (example.invalid), never the real one.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    isValidNoreply,
    rewriteIdentityEmails,
} from '../history_email_scrub/history_email_scrub.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(repoRoot, 'tools/history_email_scrub/history_email_scrub.mjs');
const OLD = 'legacy@example.invalid';
const NOREPLY = '123456+test-user@users.noreply.github.com';

const BASE_ENV = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Alice',
    GIT_AUTHOR_EMAIL: OLD,
    GIT_COMMITTER_NAME: 'Bob',
    GIT_COMMITTER_EMAIL: OLD,
    GIT_AUTHOR_DATE: '2026-01-02T03:04:05+0800',
    GIT_COMMITTER_DATE: '2026-01-02T03:04:06+0800',
};

const git = (cwd, args, { env = {}, input, encoding = 'utf8' } = {}) => execFileSync('git', args, {
    cwd,
    encoding,
    input,
    env: { ...BASE_ENV, ...env },
    maxBuffer: 64 * 1024 * 1024,
});

const run = (args, options = {}) => execFileSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
});

const initRepo = (dir) => {
    mkdirSync(dir, { recursive: true });
    git(dir, ['init', '-q']);
};

// Minimal fast-export frame reader used only by the tests: it skips `data N`
// payloads by byte count so a fake control line inside a message cannot be
// mistaken for a real header.
const dataFrames = (buffer) => {
    const frames = [];
    let offset = 0;
    while (offset < buffer.length) {
        let end = buffer.indexOf(0x0a, offset);
        if (end < 0) end = buffer.length;
        const line = buffer.subarray(offset, end).toString('latin1');
        const match = /^data (\d+)$/.exec(line);
        if (match) {
            const count = Number(match[1]);
            const start = end < buffer.length ? end + 1 : end;
            assert.ok(start + count <= buffer.length, 'test stream has a truncated data frame');
            frames.push(buffer.subarray(start, start + count));
            offset = start + count;
        } else {
            if (end === buffer.length) break;
            offset = end + 1;
        }
    }
    return frames;
};

const tagBody = (repo, ref) => {
    const raw = git(repo, ['cat-file', 'tag', ref], { encoding: 'buffer' });
    const separator = raw.indexOf(Buffer.from('\n\n'));
    return {
        header: raw.subarray(0, separator).toString('utf8'),
        body: raw.subarray(separator + 2),
    };
};

const writeCommit = (repo, files, message, extraEnv = {}) => {
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(path.join(repo, name), content);
    }
    git(repo, ['add', '-A']);
    const messageFile = path.join(repo, '..', `msg-${Date.now()}-${Math.random()}.txt`);
    writeFileSync(messageFile, message);
    git(repo, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-F', messageFile], { env: extraEnv });
};

describe('history email scrub', () => {
    it('validates GitHub noreply addresses', () => {
        assert.equal(isValidNoreply(NOREPLY), true);
        assert.equal(isValidNoreply('test-user@users.noreply.github.com'), true);
        assert.equal(isValidNoreply(OLD), false);
        assert.equal(isValidNoreply('123+test@users.noreply.github.com.evil'), false);
    });

    it('rewrites only control headers and preserves binary/multibyte data frames byte-for-byte', () => {
        const fake = Buffer.from(
            `author Fake <${OLD}> 1700000000 +0000\n`
            + `committer Fake <${OLD}> 1700000001 +0000\n`
            + `tagger Fake <${OLD}> 1700000002 +0000\n`,
            'utf8',
        );
        const binary = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const messagePayload = Buffer.concat([fake, Buffer.from('中文消息\n', 'utf8'), binary]);
        const tagPayload = Buffer.concat([
            Buffer.from(`tagger Fake <${OLD}> 1700000003 +0000\n标签正文\n`, 'utf8'),
            binary,
        ]);
        const stream = Buffer.concat([
            Buffer.from(
                'commit refs/heads/main\nmark :1\n'
                + `author Alice <${OLD}> 1767300000 +0800\n`
                + `committer Bob <${OLD}> 1767300001 +0800\n`
                + `data ${messagePayload.length}\n`,
                'utf8',
            ),
            messagePayload,
            Buffer.from('\n', 'utf8'),
            Buffer.from(
                'tag v1\nfrom :1\n'
                + `tagger Carol <${OLD}> 1767300002 +0800\n`
                + `data ${tagPayload.length}\n`,
                'utf8',
            ),
            tagPayload,
            Buffer.from('\n', 'utf8'),
        ]);

        const result = rewriteIdentityEmails(stream, NOREPLY);
        const output = result.output;

        assert.equal(result.changed, 3);
        assert.equal(result.authorCommitterChanged, 2);
        assert.equal(result.taggerChanged, 1);
        assert.ok(output.length > stream.length, 'longer noreply address must not truncate output');

        assert.equal(output.includes(Buffer.from(`author Alice <${OLD}>`)), false);
        assert.equal(output.includes(Buffer.from(`committer Bob <${OLD}>`)), false);
        assert.equal(output.includes(Buffer.from(`tagger Carol <${OLD}>`)), false);
        assert.equal(output.includes(Buffer.from(`author Alice <${NOREPLY}>`)), true);
        assert.equal(output.includes(Buffer.from(`committer Bob <${NOREPLY}>`)), true);
        assert.equal(output.includes(Buffer.from(`tagger Carol <${NOREPLY}>`)), true);

        // The fake lines and raw bytes live inside data frames; they must survive.
        assert.equal(output.includes(Buffer.from(`author Fake <${OLD}>`)), true);
        assert.equal(output.includes(Buffer.from(`tagger Fake <${OLD}>`)), true);
        assert.deepEqual(dataFrames(output), [messagePayload, tagPayload]);
    });

    it('rejects non-Buffer streams and non-noreply targets', () => {
        assert.throws(() => rewriteIdentityEmails('text', NOREPLY), /Buffer/);
        assert.throws(
            () => rewriteIdentityEmails(Buffer.from('commit refs/heads/main\n'), OLD),
            /noreply/,
        );
    });

    it('rewrites commits and annotated tagger in a mirror, preserving messages, tags and blobs', () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), 'email-scrub-'));
        const source = path.join(dir, 'source');
        const mirror = path.join(dir, 'mirror.git');
        try {
            initRepo(source);
            const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
            const firstMessage = [
                'first message 中文',
                `author Fake <${OLD}> 1700000000 +0000`,
                `committer Fake <${OLD}> 1700000001 +0000`,
                `tagger Fake <${OLD}> 1700000002 +0000`,
                '',
            ].join('\n');
            writeCommit(source, {
                'game.txt': 'v1\n',
                'blob.bin': binary,
                'notes.txt': '中文备注\n',
            }, firstMessage);

            writeCommit(source, { 'game.txt': 'v2\n' }, 'second message\n');
            git(source, ['-c', 'tag.gpgsign=false', 'tag', '-a', 'v-annotated', '-m',
                `release 中文\ntagger Fake <${OLD}> 1700000003 +0000\n`], {
                env: { GIT_COMMITTER_NAME: 'Carol', GIT_COMMITTER_EMAIL: OLD },
            });
            git(source, ['tag', 'v-light', 'HEAD~1']);

            const sourceHead = git(source, ['rev-parse', 'HEAD']).trim();
            const beforeStructure = git(source, [
                'log', '--all', '--format=%T%x00%an%x00%at%x00%cn%x00%ct%x00%B%x1e',
            ]).split('\x1e').map((record) => record.replace(/^\n|\n$/g, '')).filter(Boolean).sort();

            execFileSync('git', ['clone', '-q', '--mirror', source, mirror], { env: BASE_ENV });

            const dry = run(['--repo', mirror, '--noreply', NOREPLY]);
            assert.doesNotMatch(dry, /legacy@example\.invalid/);
            assert.match(dry, /Commits: 2/);
            assert.match(dry, /Identity lines needing rewrite: 4/);
            assert.match(dry, /Annotated tags needing tagger rewrite: 1/);
            assert.match(dry, /Commit\/tag messages containing an email: 1\/1/);
            assert.match(dry, /DRY RUN/);

            const applied = run(['--repo', mirror, '--noreply', NOREPLY, '--apply']);
            assert.doesNotMatch(applied, /legacy@example\.invalid/);
            assert.match(applied, /Changed identity lines: 5 \(tagger: 1\)/);
            assert.match(applied, /Structure check .*tag message\): OK/);
            assert.match(applied, /git fsck: OK/);

            const emails = new Set(git(mirror, ['log', '--all', '--format=%ae%n%ce'])
                .split(/\r?\n/).filter(Boolean));
            assert.deepEqual([...emails], [NOREPLY]);
            const taggerEmails = git(mirror, [
                'for-each-ref', 'refs/tags', '--format=%(objecttype)%00%(taggeremail)',
            ]).split(/\r?\n/).filter(Boolean)
                .filter((row) => row.startsWith('tag\x00'))
                .map((row) => row.split('\x00')[1].replace(/^<|>$/g, ''));
            assert.deepEqual(taggerEmails, [NOREPLY]);

            const afterStructure = git(mirror, [
                'log', '--all', '--format=%T%x00%an%x00%at%x00%cn%x00%ct%x00%B%x1e',
            ]).split('\x1e').map((record) => record.replace(/^\n|\n$/g, '')).filter(Boolean).sort();
            assert.deepEqual(afterStructure, beforeStructure);

            // The old address and fake control lines remain only in messages.
            const messages = git(mirror, ['log', '--all', '--format=%B']);
            assert.match(messages, new RegExp(`author Fake <${OLD}>`));

            const tag = tagBody(mirror, 'refs/tags/v-annotated');
            assert.match(tag.header, /^tagger Carol <[^>]+> \d+ [+-]\d{4}$/m);
            assert.equal(tag.header.includes(`<${NOREPLY}>`), true);
            assert.equal(tag.header.includes(OLD), false);
            assert.match(tag.body.toString('utf8'), /release 中文/);
            assert.match(tag.body.toString('utf8'), new RegExp(`tagger Fake <${OLD}>`));

            // Lightweight tag still exists and points at a commit.
            assert.equal(git(mirror, ['cat-file', '-t', 'refs/tags/v-light']).trim(), 'commit');
            const mirrorHead = git(mirror, ['rev-parse', 'HEAD']).trim();
            assert.equal(
                execFileSync('git', ['-C', mirror, 'cat-file', 'blob', `${mirrorHead}:blob.bin`], { encoding: 'buffer' })
                    .equals(binary),
                true,
            );

            // The source repository must be untouched.
            assert.equal(git(source, ['rev-parse', 'HEAD']).trim(), sourceHead);
            assert.match(git(source, ['log', '--all', '--format=%ae%n%ce']), /legacy@example\.invalid/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuses a mirror containing a signed tag instead of silently stripping it', () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), 'email-scrub-signed-tag-'));
        const source = path.join(dir, 'source');
        const mirror = path.join(dir, 'mirror.git');
        try {
            initRepo(source);
            writeCommit(source, { 'a.txt': 'a\n' }, 'one\n');
            const commit = git(source, ['rev-parse', 'HEAD']).trim();
            const tagObject = [
                `object ${commit}`,
                'type commit',
                'tag signed-tag',
                `tagger Carol <${OLD}> 1767300002 +0800`,
                '',
                'signed tag message',
                '-----BEGIN PGP SIGNATURE-----',
                'fake-signature',
                '-----END PGP SIGNATURE-----',
                '',
            ].join('\n');
            const tagSha = git(source, ['hash-object', '-t', 'tag', '-w', '--stdin'], {
                input: tagObject,
            }).trim();
            git(source, ['update-ref', 'refs/tags/signed-tag', tagSha]);
            execFileSync('git', ['clone', '-q', '--mirror', source, mirror], { env: BASE_ENV });

            assert.throws(
                () => run(['--repo', mirror, '--noreply', NOREPLY, '--apply']),
                (error) => {
                    assert.match(String(error.stderr || error.message), /签名 tag/);
                    return true;
                },
            );
            assert.equal(git(mirror, ['rev-parse', 'refs/tags/signed-tag']).trim(), tagSha);
            assert.match(git(mirror, ['log', '--all', '--format=%ae']), /legacy@example\.invalid/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuses a mirror containing a signed commit', () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), 'email-scrub-signed-commit-'));
        const source = path.join(dir, 'source');
        const mirror = path.join(dir, 'mirror.git');
        try {
            initRepo(source);
            writeCommit(source, { 'a.txt': 'a\n' }, 'one\n');
            const tree = git(source, ['rev-parse', 'HEAD^{tree}']).trim();
            const parent = git(source, ['rev-parse', 'HEAD']).trim();
            const signedCommit = [
                `tree ${tree}`,
                `parent ${parent}`,
                `author Alice <${OLD}> 1767300010 +0000`,
                `committer Bob <${OLD}> 1767300011 +0000`,
                'gpgsig -----BEGIN PGP SIGNATURE-----',
                ' ',
                ' fake-signature',
                ' -----END PGP SIGNATURE-----',
                '',
                'signed commit message',
                '',
            ].join('\n');
            const signedSha = git(source, ['hash-object', '-t', 'commit', '-w', '--stdin'], {
                input: signedCommit,
            }).trim();
            git(source, ['update-ref', 'refs/heads/signed-commit', signedSha]);
            execFileSync('git', ['clone', '-q', '--mirror', source, mirror], { env: BASE_ENV });

            assert.throws(
                () => run(['--repo', mirror, '--noreply', NOREPLY, '--apply']),
                (error) => {
                    assert.match(String(error.stderr || error.message), /签名提交/);
                    return true;
                },
            );
            assert.equal(git(mirror, ['rev-parse', 'refs/heads/signed-commit']).trim(), signedSha);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuses --apply on a non-bare repository', () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), 'email-scrub-nonbare-'));
        try {
            initRepo(dir);
            writeCommit(dir, { 'a.txt': 'a\n' }, 'one\n');
            assert.throws(
                () => run(['--repo', dir, '--noreply', NOREPLY, '--apply']),
                (error) => {
                    assert.match(String(error.stderr || error.message), /bare mirror/);
                    return true;
                },
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
