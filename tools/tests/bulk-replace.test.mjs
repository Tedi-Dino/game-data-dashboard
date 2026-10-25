// Bulk replace rollback semantics, exercised with an in-memory fake.
// No Firebase SDK and no real network/database writes are involved.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBulkReplace } from '../../js/services/bulk-replace-core.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const item = (n) => ({ id: `x-${n}`, name: `Game ${n}`, type: 'xbox' });
const backupDoc = (n) => ({ ref: `old-${n}`, data: { id: `old-${n}`, name: `Old ${n}` } });

const makeStore = ({ backup, addAfterRead = null, failDelete = null, failSet = null }) => {
    const server = new Map(backup.map(({ ref, data }) => [ref, { ...data }]));
    const log = [];
    let refSeq = 0;
    let deleteCalls = 0;
    let setCalls = 0;

    const readAll = async () => {
        const snapshot = [...server].map(([ref, data]) => ({ ref, data: { ...data } }));
        if (addAfterRead) {
            server.set(addAfterRead.ref, { ...addAfterRead.data });
            addAfterRead = null;
        }
        return snapshot;
    };

    const createRef = () => {
        refSeq++;
        return `new-${refSeq}`;
    };

    const commitDelete = async (refs) => {
        deleteCalls++;
        log.push({ op: 'delete', call: deleteCalls, refs: [...refs] });
        const mode = failDelete ? failDelete(deleteCalls, refs) : null;
        if (mode === 'before') throw new Error(`delete call ${deleteCalls} failed`);
        for (const ref of refs) server.delete(ref);
        if (mode === 'after') throw new Error(`delete call ${deleteCalls} failed after apply`);
    };

    const commitSet = async (writes) => {
        setCalls++;
        log.push({ op: 'set', call: setCalls, refs: writes.map((w) => w.ref) });
        const mode = failSet ? failSet(setCalls, writes) : null;
        if (mode === 'before') throw new Error(`set call ${setCalls} failed`);
        for (const { ref, data } of writes) server.set(ref, { ...data });
        if (mode === 'after') throw new Error(`set call ${setCalls} failed after apply`);
    };

    return {
        server,
        log,
        readAll,
        createRef,
        commitDelete,
        commitSet,
        counts: () => ({ deleteCalls, setCalls, refSeq }),
    };
};

const run = (store, newItems, batchSize = 400) => runBulkReplace({
    newItems,
    readAll: store.readAll,
    createRef: store.createRef,
    commitDelete: store.commitDelete,
    commitSet: store.commitSet,
    batchSize,
});

describe('bulk replace rollback', () => {
    it('replaces the collection in batches with no rollback on success', async () => {
        const backup = [backupDoc(1), backupDoc(2)];
        const store = makeStore({ backup });
        const result = await run(store, Array.from({ length: 900 }, (_, i) => item(i)));

        assert.deepEqual(result, { inserted: 900, backupCount: 2 });
        assert.equal(store.log.filter((e) => e.op === 'delete').length, 1);
        assert.deepEqual(store.log.filter((e) => e.op === 'set').map((e) => e.refs.length), [400, 400, 100]);
        assert.equal(store.server.size, 900);
        assert.equal(store.server.has('old-1'), false);
    });

    it('rolls back acknowledged and attempted refs when the second insert batch fails', async () => {
        const backup = [backupDoc(1), backupDoc(2)];
        const outsider = { ref: 'outsider', data: { id: 'other-client' } };
        const store = makeStore({
            backup,
            addAfterRead: outsider,
            failSet: (call) => (call === 2 ? 'before' : null),
        });

        await assert.rejects(
            run(store, Array.from({ length: 900 }, (_, i) => item(i))),
            (error) => {
                assert.equal(error.name, 'BulkReplaceError');
                assert.equal(error.phase, 'insert');
                assert.equal(error.attempted, 800);
                assert.equal(error.cleaned, 800);
                assert.equal(error.backupCount, 2);
                assert.equal(error.restored, 2);
                assert.equal(error.cleanupError, null);
                assert.equal(error.restoreError, null);
                assert.match(error.message, /本次新增 800 条，已回滚 800 条/);
                assert.match(error.message, /已恢复到导入前状态/);
                return true;
            }
        );

        // First insert landed, second failed. Cleanup must remove both batches,
        // then restore the backup; the other client's doc must survive.
        const insertCalls = store.log.filter((e) => e.op === 'set').slice(0, 2);
        assert.deepEqual(insertCalls.map((e) => e.refs.length), [400, 400]);
        const cleanupCalls = store.log.filter((e) => e.op === 'delete').slice(1);
        assert.equal(cleanupCalls.reduce((sum, e) => sum + e.refs.length, 0), 800);
        const restoreCalls = store.log.filter((e) => e.op === 'set').slice(2);
        assert.equal(restoreCalls.length, 1);
        const lastCleanup = cleanupCalls[cleanupCalls.length - 1];
        assert.equal(store.log.indexOf(lastCleanup) < store.log.indexOf(restoreCalls[0]), true);

        assert.equal(store.server.size, 3);
        assert.deepEqual(store.server.get('old-1'), backup[0].data);
        assert.deepEqual(store.server.get('old-2'), backup[1].data);
        assert.deepEqual(store.server.get('outsider'), outsider.data);
    });

    it('treats a commit that reached the server but rejected on the client as attempted', async () => {
        const backup = [backupDoc(1)];
        const store = makeStore({
            backup,
            failSet: (call) => (call === 2 ? 'after' : null),
        });

        await assert.rejects(
            run(store, Array.from({ length: 900 }, (_, i) => item(i))),
            /已回滚 800 条/
        );

        // The unknown commit did write 800 docs on the fake server; cleanup must
        // delete them before restoring the single backup doc.
        assert.equal(store.server.size, 1);
        assert.deepEqual(store.server.get('old-1'), backup[0].data);
    });

    it('restores the backup when the delete phase fails, without creating new refs', async () => {
        const backup = Array.from({ length: 900 }, (_, i) => backupDoc(i));
        const store = makeStore({
            backup,
            failDelete: (call) => (call === 2 ? 'after' : null),
        });

        await assert.rejects(
            run(store, [item(1), item(2)]),
            (error) => {
                assert.equal(error.phase, 'delete');
                assert.equal(error.attempted, 0);
                assert.equal(error.cleaned, 0);
                assert.equal(error.restored, 900);
                return true;
            }
        );

        assert.equal(store.counts().refSeq, 0);
        assert.equal(store.log.filter((e) => e.op === 'set').length, 3);
        assert.equal(store.server.size, 900);
        assert.deepEqual(store.server.get('old-0'), backup[0].data);
        assert.deepEqual(store.server.get('old-899'), backup[899].data);
    });

    it('reports a restore failure in the final error instead of swallowing it', async () => {
        const backup = [backupDoc(1), backupDoc(2)];
        const store = makeStore({
            backup,
            // insert call 2 fails, cleanup succeeds, every restore set call fails
            failSet: (call) => (call === 2 ? 'before' : (call >= 3 ? 'before' : null)),
        });

        await assert.rejects(
            run(store, Array.from({ length: 900 }, (_, i) => item(i))),
            (error) => {
                assert.equal(error.phase, 'insert');
                assert.equal(error.restored, 0);
                assert.ok(error.restoreError instanceof Error);
                assert.match(error.message, /备份恢复失败/);
                assert.match(error.message, /数据可能不完整/);
                return true;
            }
        );

        assert.equal(store.server.size, 0);
    });

    it('does not write anything when the backup read fails', async () => {
        const store = makeStore({ backup: [backupDoc(1)] });
        let writeAttempts = 0;
        const wrapped = {
            ...store,
            commitDelete: async () => { writeAttempts++; },
            commitSet: async () => { writeAttempts++; },
            createRef: () => { writeAttempts++; return 'never'; },
        };

        await assert.rejects(
            runBulkReplace({
                newItems: [item(1)],
                readAll: async () => { throw new Error('offline'); },
                createRef: wrapped.createRef,
                commitDelete: wrapped.commitDelete,
                commitSet: wrapped.commitSet,
            }),
            (error) => {
                assert.equal(error.phase, 'backup');
                assert.match(error.message, /读取备份/);
                assert.match(error.message, /offline/);
                return true;
            }
        );

        assert.equal(writeAttempts, 0);
        assert.equal(store.server.size, 1);
    });

    it('keeps the orchestration module free of Firebase imports', () => {
        const src = readFileSync(path.join(repoRoot, 'js/services/bulk-replace-core.js'), 'utf8');
        assert.doesNotMatch(src, /^\s*import\b.*(?:firebase|gstatic)/mi);
    });
});
