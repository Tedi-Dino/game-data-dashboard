#!/usr/bin/env node
// Rewrite ONLY author/committer/tagger emails in a disposable git mirror.
//
// Privacy properties:
// - Dry-run is the default; no refs/objects are changed unless --apply is given.
// - --apply refuses to run on a non-bare repository and refuses to run on the
//   repository this script lives in (use a separate `git clone --mirror`).
// - Existing email values are never printed. They are read into memory, mapped
//   to the verified GitHub noreply address, and the fast-export stream is
//   transformed in memory and piped to fast-import (no temp file containing the
//   old address).
// - The fast-export stream is parsed as bytes. `data <N>` payloads (commit and
//   tag messages, blobs, inline file data) are copied verbatim by length, so
//   binary blobs and multibyte text cannot be corrupted, and fake identity lines
//   inside a message/blob are never touched.
// - Author/committer/tagger names, timestamps, commit messages, tag messages and
//   file trees are preserved. Signed commits/tags are refused by default because
//   rewriting changes the signed payload.
//
// It cannot remove the address from existing clones, forks, reflogs, hosting
// caches or GitHub's own object storage. See README.md.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const IDENTITY_RE = /^(author|committer|tagger) (.*) <([^<>]*)> (-?\d+ [+-]\d{4})$/;
const IDENTITY_VALUE_RE = /^(.*) <([^<>]*)> (-?\d+ [+-]\d{4})$/;
const NOREPLY_RE = /^(?:\d+\+)?[A-Za-z0-9-]+@users\.noreply\.github\.com$/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DATA_RE = /^data (\d+)$/;
const RECORD_SEP = '\x1e';
const LF = Buffer.from('\n');
const TAG_SIGNATURE = Buffer.from('-----BEGIN PGP SIGNATURE-----');
const SSH_TAG_SIGNATURE = Buffer.from('-----BEGIN SSH SIGNATURE-----');
const hasTagSignature = (raw) => raw.includes(TAG_SIGNATURE) || raw.includes(SSH_TAG_SIGNATURE);

export const isValidNoreply = (email) => NOREPLY_RE.test(String(email || ''));

const identityKey = (line) => {
    const text = Buffer.isBuffer(line) ? line.toString('latin1') : String(line);
    const match = IDENTITY_VALUE_RE.exec(text);
    return match ? `${match[1]}\x00${match[3]}` : text;
};

/**
 * Rewrite identity emails in a git fast-export byte stream.
 *
 * Only control lines that start with `author`, `committer` or `tagger` are
 * touched. Every `data N` frame is copied byte-for-byte using N, so payload
 * bytes are never searched or re-encoded.
 *
 * @param {Buffer} stream
 * @param {string} noreply
 * @returns {{output: Buffer, changed: number, authorCommitterChanged: number, taggerChanged: number}}
 */
export const rewriteIdentityEmails = (stream, noreply) => {
    if (!Buffer.isBuffer(stream)) throw new TypeError('fast-export 流必须是 Buffer');
    if (!isValidNoreply(noreply)) throw new Error('目标地址必须是已验证的 GitHub noreply 地址');

    const chunks = [];
    let offset = 0;
    let changed = 0;
    let authorCommitterChanged = 0;
    let taggerChanged = 0;

    while (offset < stream.length) {
        let lineEnd = stream.indexOf(0x0a, offset);
        if (lineEnd < 0) lineEnd = stream.length;
        const line = stream.subarray(offset, lineEnd);
        const text = line.toString('latin1');

        const data = DATA_RE.exec(text);
        if (data) {
            const count = Number(data[1]);
            if (!Number.isSafeInteger(count) || count < 0) {
                throw new Error(`非法的 fast-export data 长度：${data[1]}`);
            }
            chunks.push(line);
            if (lineEnd < stream.length) chunks.push(LF);
            offset = lineEnd < stream.length ? lineEnd + 1 : lineEnd;
            if (offset + count > stream.length) {
                throw new Error(`fast-export data 帧被截断：需要 ${count} 字节`);
            }
            chunks.push(stream.subarray(offset, offset + count));
            offset += count;
            // The separator LF (if any) is handled by the next iteration as an
            // empty control line and copied unchanged.
            continue;
        }

        const identity = IDENTITY_RE.exec(text);
        if (identity) {
            const [, role, name, email, timestamp] = identity;
            if (email !== noreply) {
                chunks.push(Buffer.from(`${role} ${name} <${noreply}> ${timestamp}`, 'latin1'));
                changed++;
                if (role === 'tagger') taggerChanged++;
                else authorCommitterChanged++;
            } else {
                chunks.push(line);
            }
        } else {
            chunks.push(line);
        }
        if (lineEnd < stream.length) chunks.push(LF);
        offset = lineEnd < stream.length ? lineEnd + 1 : lineEnd;
    }

    return {
        // Do NOT pass stream.length as totalLength: the noreply address is
        // usually longer than the old address, so the output can grow.
        output: Buffer.concat(chunks),
        changed,
        authorCommitterChanged,
        taggerChanged,
    };
};

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
});

const gitBuffer = (repo, args) => execFileSync('git', ['-C', repo, ...args], {
    maxBuffer: 512 * 1024 * 1024,
});

const tryGit = (repo, args) => {
    try {
        return git(repo, args).trim();
    } catch {
        return '';
    }
};

const SCRIPT_REPO_GIT_DIR = tryGit(
    path.dirname(fileURLToPath(import.meta.url)),
    ['rev-parse', '--absolute-git-dir'],
);

const identityRows = (repo) => git(repo, ['log', '--all', '--format=%H%x00%ae%x00%ce'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
        const [hash, authorEmail, committerEmail] = line.split('\x00');
        return { hash, authorEmail, committerEmail };
    });

const annotatedTagRows = (repo) => git(repo, [
    'for-each-ref', 'refs/tags', '--format=%(refname)%00%(objecttype)',
]).split(/\r?\n/).filter(Boolean).map((line) => {
    const [ref, type] = line.split('\x00');
    return { ref, type };
}).filter((row) => row.type === 'tag');

const tagObject = (repo, ref) => {
    const raw = gitBuffer(repo, ['cat-file', 'tag', ref]);
    const separator = raw.indexOf(Buffer.from('\n\n'));
    const header = (separator >= 0 ? raw.subarray(0, separator) : raw).toString('latin1').split('\n');
    const message = separator >= 0 ? raw.subarray(separator + 2) : Buffer.alloc(0);
    let tagger = '';
    let tagName = '';
    let targetType = '';
    for (const line of header) {
        if (line.startsWith('tagger ')) tagger = identityKey(Buffer.from(line.slice(7), 'latin1'));
        else if (line.startsWith('tag ')) tagName = line.slice(4);
        else if (line.startsWith('type ')) targetType = line.slice(5);
    }
    return { raw, header, message, tagger, tagName, targetType };
};

const hasSignatureHeader = (repo, sha) => {
    const raw = gitBuffer(repo, ['cat-file', 'commit', sha]);
    const separator = raw.indexOf(Buffer.from('\n\n'));
    const header = (separator >= 0 ? raw.subarray(0, separator) : raw).toString('latin1').split('\n');
    return header.some((line) => line.startsWith('gpgsig ') || line.startsWith('gpgsig-sha256 '));
};

const signedCommitCount = (repo) => git(repo, ['rev-list', '--all'])
    .split(/\r?\n/).filter(Boolean).filter((sha) => hasSignatureHeader(repo, sha)).length;

const commitSignatures = (repo) => git(repo, ['rev-list', '--all'])
    .split(/\r?\n/).filter(Boolean).map((sha) => {
        const raw = gitBuffer(repo, ['cat-file', 'commit', sha]);
        const separator = raw.indexOf(Buffer.from('\n\n'));
        const header = (separator >= 0 ? raw.subarray(0, separator) : raw).toString('latin1').split('\n');
        const message = separator >= 0 ? raw.subarray(separator + 2) : Buffer.alloc(0);
        let tree = '';
        let author = '';
        let committer = '';
        for (const line of header) {
            if (line.startsWith('tree ')) tree = line.slice(5);
            else if (line.startsWith('author ')) author = identityKey(Buffer.from(line.slice(7), 'latin1'));
            else if (line.startsWith('committer ')) committer = identityKey(Buffer.from(line.slice(10), 'latin1'));
        }
        return JSON.stringify({ tree, author, committer, message: message.toString('base64') });
    }).sort();

const tagSignatures = (repo) => {
    const rows = git(repo, ['for-each-ref', 'refs/tags', '--format=%(refname)%00%(objecttype)'])
        .split(/\r?\n/).filter(Boolean).map((line) => {
            const [ref, type] = line.split('\x00');
            return { ref, type };
        });
    return rows.map(({ ref, type }) => {
        if (type !== 'tag') return JSON.stringify({ ref, type });
        const tag = tagObject(repo, ref);
        return JSON.stringify({
            ref,
            type,
            tagName: tag.tagName,
            targetType: tag.targetType,
            tagger: tag.tagger,
            message: tag.message.toString('base64'),
        });
    }).sort();
};

const countEmails = (buffer) => {
    const text = buffer.toString('latin1');
    EMAIL_RE.lastIndex = 0;
    return (text.match(EMAIL_RE) || []).length;
};

export const auditRepo = (repo, noreply = '') => {
    const gitDir = tryGit(repo, ['rev-parse', '--absolute-git-dir']);
    if (!gitDir) throw new Error(`不是可识别的 git 仓库：${repo}`);
    const bare = tryGit(repo, ['rev-parse', '--is-bare-repository']) === 'true';
    const commits = identityRows(repo);
    const tags = annotatedTagRows(repo);
    const target = isValidNoreply(noreply) ? noreply : '';

    const emails = new Set();
    for (const row of commits) {
        if (row.authorEmail) emails.add(row.authorEmail);
        if (row.committerEmail) emails.add(row.committerEmail);
    }
    const taggers = tags.map(({ ref }) => {
        const tag = tagObject(repo, ref);
        const rawTagger = tag.raw.toString('latin1');
        const match = /^tagger (.*) <([^<>]*)> (-?\d+ [+-]\d{4})$/m.exec(rawTagger);
        return { ref, email: match ? match[2] : '', signed: hasTagSignature(tag.raw) };
    });
    for (const tagger of taggers) if (tagger.email) emails.add(tagger.email);

    const commitsNeedingRewrite = target
        ? commits.filter((row) => row.authorEmail !== target || row.committerEmail !== target).length
        : null;
    const identityLinesNeedingRewrite = target
        ? commits.reduce((sum, row) =>
            sum + (row.authorEmail !== target ? 1 : 0) + (row.committerEmail !== target ? 1 : 0), 0)
        : null;
    const taggersNeedingRewrite = target
        ? taggers.filter((tagger) => tagger.email !== target).length
        : null;

    const commitMessagesWithEmail = git(repo, ['log', '--all', `--format=%B${RECORD_SEP}`])
        .split(RECORD_SEP)
        .filter((message) => message.trim())
        .filter((message) => {
            EMAIL_RE.lastIndex = 0;
            return EMAIL_RE.test(message);
        }).length;
    const tagMessagesWithEmail = tags
        .map(({ ref }) => tagObject(repo, ref).message)
        .filter((message) => countEmails(message) > 0).length;

    const signedCommits = signedCommitCount(repo);

    return {
        gitDir,
        bare,
        commitCount: commits.length,
        refCount: git(repo, ['for-each-ref', '--format=%(refname)']).split(/\r?\n/).filter(Boolean).length,
        distinctEmailCount: emails.size,
        commitsNeedingRewrite,
        identityLinesNeedingRewrite,
        taggersNeedingRewrite,
        annotatedTagCount: tags.length,
        tagsWithOtherEmail: target
            ? taggers.filter((tagger) => tagger.email !== target).length
            : taggers.filter((tagger) => tagger.email).length,
        signedTags: taggers.filter((tagger) => tagger.signed).length,
        tagsWithoutTagger: taggers.filter((tagger) => !tagger.email).length,
        commitMessagesWithEmail,
        tagMessagesWithEmail,
        signedCommits,
    };
};

const readOption = (args, name) => {
    const index = args.indexOf(name);
    if (index < 0) return '';
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个值`);
    return value;
};

const samePath = (a, b) => {
    try {
        return realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase();
    } catch {
        return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
    }
};

const usage = () => {
    console.log(`History email scrub (author/committer/tagger only)

Usage:
  node tools/history_email_scrub/history_email_scrub.mjs --repo <mirror.git> [--noreply <addr>]
  node tools/history_email_scrub/history_email_scrub.mjs --repo <mirror.git> --noreply <addr> --apply

Safety:
  - Default is dry-run. --apply only works on a bare disposable mirror and refuses
    to touch the repository this script lives in.
  - <addr> must be a verified GitHub noreply address
    (e.g. 231012603+Tedi-Dino@users.noreply.github.com).
  - Existing addresses are never printed. Only counts are shown.
  - Rewriting refs does not purge forks, clones, reflogs or hosting caches.`);
};

const describeStructureDiff = (before, after) => {
    if (before.length !== after.length) return `记录数 ${before.length} -> ${after.length}`;
    for (let i = 0; i < before.length; i++) {
        const a = JSON.parse(before[i]);
        const b = JSON.parse(after[i]);
        for (const key of ['tree', 'author', 'committer', 'message']) {
            if (a[key] !== b[key]) return `第 ${i + 1} 条记录的 ${key} 字段`;
        }
    }
    return '字段值';
};

const verifyOnlyMirror = (message) => new Error(
    `验证失败：${message}。该操作只影响镜像；原始仓库未被修改`
);

export const applyRewrite = (repo, noreply, { allowBrokenSignatures = false } = {}) => {
    if (!isValidNoreply(noreply)) throw new Error('目标地址必须是已验证的 GitHub noreply 地址');
    const before = auditRepo(repo, noreply);
    if (!before.bare) throw new Error('--apply 只允许在 bare mirror 上运行（git clone --mirror）');
    if (before.signedCommits > 0 && !allowBrokenSignatures) {
        throw new Error(`仓库含 ${before.signedCommits} 个签名提交；改写会使签名失效。确认后加 --allow-broken-signatures`);
    }
    if (before.signedTags > 0 && !allowBrokenSignatures) {
        throw new Error(`仓库含 ${before.signedTags} 个签名 tag；改写会使签名失效。确认后加 --allow-broken-signatures`);
    }
    if (before.tagsWithoutTagger > 0) {
        throw new Error(`仓库含 ${before.tagsWithoutTagger} 个没有 tagger 标识的 annotated tag；无法安全脱敏`);
    }
    if (before.commitCount === 0) throw new Error('仓库没有提交');
    const needsRewrite = (before.commitsNeedingRewrite || 0) + (before.taggersNeedingRewrite || 0);
    if (needsRewrite === 0) throw new Error('所有 author/committer/tagger 邮箱已经是目标地址');

    const structureBefore = commitSignatures(repo);
    const tagsBefore = tagSignatures(repo);
    const refsBefore = git(repo, ['for-each-ref', '--format=%(refname)']).split(/\r?\n/).sort();

    // Keep both streams in memory: no temp file contains the old address.
    let exported;
    try {
        exported = gitBuffer(repo, [
            'fast-export', '--all', '--reencode=no',
            // Never silently strip signed tags; only verbatim after an explicit override.
            `--signed-tags=${before.signedTags > 0 ? 'verbatim' : 'abort'}`,
        ]);
    } catch (error) {
        throw new Error(`git fast-export 失败，镜像未被修改：${error.message}`);
    }
    const { output, changed, taggerChanged } = rewriteIdentityEmails(exported, noreply);
    if (changed === 0) throw new Error('fast-export 流中没有可改写的身份行');

    try {
        execFileSync('git', ['-C', repo, 'fast-import', '--force', '--quiet'], {
            input: output,
            maxBuffer: 512 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch {
        throw new Error('git fast-import 失败；该操作只影响镜像；原始仓库未被修改');
    }

    const after = auditRepo(repo, noreply);
    if (after.commitCount !== before.commitCount) {
        throw verifyOnlyMirror(`提交数 ${before.commitCount} -> ${after.commitCount}`);
    }
    if (after.commitsNeedingRewrite !== 0) {
        throw verifyOnlyMirror('仍有 author/committer 邮箱不是目标地址');
    }
    if (after.taggersNeedingRewrite !== 0) {
        throw verifyOnlyMirror('仍有 tagger 邮箱不是目标地址');
    }
    const refsAfter = git(repo, ['for-each-ref', '--format=%(refname)']).split(/\r?\n/).sort();
    if (refsAfter.join('\n') !== refsBefore.join('\n')) {
        throw verifyOnlyMirror('ref 列表发生变化');
    }
    const structureAfter = commitSignatures(repo);
    if (structureAfter.join('\n') !== structureBefore.join('\n')) {
        throw verifyOnlyMirror(`tree/作者名/时间/提交消息未保持不变（${describeStructureDiff(structureBefore, structureAfter)}）`);
    }
    if (tagSignatures(repo).join('\n') !== tagsBefore.join('\n')) {
        throw verifyOnlyMirror('tagger 名/时间/tag 消息未保持不变');
    }
    try {
        git(repo, ['fsck', '--full', '--no-dangling', '--no-progress']);
    } catch (error) {
        throw verifyOnlyMirror(`git fsck 失败：${error.message}`);
    }

    return {
        changedIdentityLines: changed,
        taggerIdentityLines: taggerChanged,
        commits: after.commitCount,
        commitsNeedingRewrite: after.commitsNeedingRewrite,
        taggersNeedingRewrite: after.taggersNeedingRewrite,
        tagsWithOtherEmail: after.tagsWithOtherEmail,
        commitMessagesWithEmail: after.commitMessagesWithEmail,
        tagMessagesWithEmail: after.tagMessagesWithEmail,
    };
};

const main = () => {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        usage();
        return;
    }
    const repo = readOption(args, '--repo');
    if (!repo) {
        usage();
        throw new Error('缺少 --repo');
    }
    const noreply = readOption(args, '--noreply');
    const apply = args.includes('--apply');
    const allowBrokenSignatures = args.includes('--allow-broken-signatures');
    if (noreply && !isValidNoreply(noreply)) {
        throw new Error('--noreply 必须是已验证的 GitHub noreply 地址');
    }

    if (!apply) {
        const audit = auditRepo(repo, noreply);
        console.log(`Repository: ${path.resolve(repo)}`);
        console.log(`Bare: ${audit.bare ? 'yes' : 'no'}`);
        console.log(`Commits: ${audit.commitCount}`);
        console.log(`Refs: ${audit.refCount}`);
        console.log(`Distinct author/committer/tagger emails: ${audit.distinctEmailCount} (values withheld)`);
        if (noreply) {
            console.log(`Identity lines needing rewrite: ${audit.identityLinesNeedingRewrite}`);
            console.log(`Commits needing rewrite: ${audit.commitsNeedingRewrite}`);
            console.log(`Annotated tags needing tagger rewrite: ${audit.taggersNeedingRewrite}`);
        } else {
            console.log('Target noreply: not supplied (counts only; no change possible without --apply)');
        }
        console.log(`Annotated tags: ${audit.annotatedTagCount} (with a non-target tagger email: ${audit.tagsWithOtherEmail})`);
        if (audit.tagsWithoutTagger > 0) {
            console.log(`Annotated tags without a tagger identity: ${audit.tagsWithoutTagger} (apply would refuse)`);
        }
        console.log(`Signed commits/tags: ${audit.signedCommits}/${audit.signedTags}`);
        console.log(`Commit/tag messages containing an email: ${audit.commitMessagesWithEmail}/${audit.tagMessagesWithEmail}`);
        console.log('DRY RUN — no refs or objects were changed.');
        if (!audit.bare) console.log('Note: --apply will refuse a non-bare repository.');
        return;
    }

    if (!noreply) throw new Error('--apply 需要 --noreply');
    const cwdGitDir = tryGit(process.cwd(), ['rev-parse', '--absolute-git-dir']);
    const targetGitDir = tryGit(repo, ['rev-parse', '--absolute-git-dir']);
    if (cwdGitDir && targetGitDir && samePath(cwdGitDir, targetGitDir)) {
        throw new Error('拒绝改写当前工作仓库；请先 git clone --mirror 到独立目录再操作');
    }
    if (SCRIPT_REPO_GIT_DIR && targetGitDir && samePath(SCRIPT_REPO_GIT_DIR, targetGitDir)) {
        throw new Error('拒绝改写脚本所在仓库；请先 git clone --mirror 到独立目录再操作');
    }

    console.log(`APPLY: ${path.resolve(repo)} -> ${noreply}`);
    const result = applyRewrite(repo, noreply, { allowBrokenSignatures });
    console.log(`Changed identity lines: ${result.changedIdentityLines} (tagger: ${result.taggerIdentityLines})`);
    console.log(`Commits: ${result.commits}`);
    console.log('All author/committer/tagger emails now use the target address.');
    console.log('Structure check (tree/name/date/commit message/tag name/tagger/tag message): OK');
    console.log('git fsck: OK');
    if (result.tagsWithOtherEmail > 0) {
        console.log(`WARNING: ${result.tagsWithOtherEmail} annotated tag(s) still carry a non-target tagger email.`);
    }
    if (result.commitMessagesWithEmail > 0 || result.tagMessagesWithEmail > 0) {
        console.log(`WARNING: ${result.commitMessagesWithEmail} commit / ${result.tagMessagesWithEmail} tag message(s) contain an email address (messages preserved).`);
    }
    console.log('This only rewrites refs in the mirror; forks/clones/caches are not purged.');
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    try {
        main();
    } catch (error) {
        console.error(`ERROR: ${error.message}`);
        process.exitCode = 1;
    }
}
