// Bulk-replace orchestration, kept free of Firebase imports so the failure
// paths can be exercised with an in-memory fake under node:test.
//
// Safety rules encoded here:
// - The backup is read before any write; if it fails, nothing is changed.
// - Every new document ref created during this run is recorded BEFORE its batch
//   commit. A commit can reach the server and still reject on the client, so the
//   rollback target is "attempted", not "confirmed written".
// - On failure, this run's new refs are deleted first, then the backup is
//   restored. Only refs created by this run are deleted; pre-existing documents
//   and writes made by other clients are never part of the cleanup set.

export const BULK_BATCH_LIMIT = 400;

const chunk = (list, size) => {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

const describe = (error) => {
    if (error instanceof Error) return error.message || error.name;
    return String(error);
};

const buildError = ({
    phase,
    original,
    attempted,
    cleaned,
    backupCount,
    restored,
    cleanupError,
    restoreError,
}) => {
    const phaseLabels = {
        backup: '读取备份',
        delete: '删除旧数据',
        insert: '写入新数据',
    };
    const parts = [`批量导入失败（${phaseLabels[phase] || phase}）：${describe(original)}`];

    if (phase !== 'backup') {
        parts.push(`本次新增 ${attempted} 条，已回滚 ${cleaned} 条`);
        if (cleanupError) {
            parts.push(`新增回滚失败：${describe(cleanupError)}`);
        }
        parts.push(`备份 ${backupCount} 条，已恢复 ${restored} 条`);
        if (restoreError) {
            parts.push(`备份恢复失败：${describe(restoreError)}`);
        }
        if (cleanupError || restoreError) {
            parts.push('数据可能不完整，请立即停止操作并人工核对');
        } else {
            parts.push('已恢复到导入前状态');
        }
    }

    const error = new Error(parts.join('；'));
    error.name = 'BulkReplaceError';
    error.phase = phase;
    error.cause = original;
    error.attempted = attempted;
    error.cleaned = cleaned;
    error.backupCount = backupCount;
    error.restored = restored;
    error.cleanupError = cleanupError || null;
    error.restoreError = restoreError || null;
    return error;
};

/**
 * Replace the whole collection through injected batch operations.
 *
 * @param {object} options
 * @param {Array} options.newItems items to insert (plain document data)
 * @param {() => Promise<Array<{ref: *, data: object}>>} options.readAll
 *        full current collection, used both as backup and delete set
 * @param {(item: object) => *} options.createRef creates a new document ref
 * @param {(refs: Array) => Promise<void>} options.commitDelete deletes one batch
 * @param {(writes: Array<{ref: *, data: object}>) => Promise<void>} options.commitSet
 *        writes one batch
 * @param {number} [options.batchSize]
 * @returns {Promise<{inserted: number, backupCount: number}>}
 */
export const runBulkReplace = async ({
    newItems,
    readAll,
    createRef,
    commitDelete,
    commitSet,
    batchSize = BULK_BATCH_LIMIT,
}) => {
    if (!Array.isArray(newItems)) throw new TypeError('newItems 必须是数组');
    if (typeof readAll !== 'function' || typeof createRef !== 'function' ||
        typeof commitDelete !== 'function' || typeof commitSet !== 'function') {
        throw new TypeError('bulk replace 缺少必要的批处理函数');
    }
    const size = Number.isInteger(batchSize) && batchSize > 0
        ? batchSize
        : BULK_BATCH_LIMIT;

    let backup;
    try {
        backup = await readAll();
        if (!Array.isArray(backup)) throw new TypeError('备份结果必须是数组');
        for (const entry of backup) {
            if (!entry || typeof entry !== 'object' || !('ref' in entry) || !('data' in entry)) {
                throw new TypeError('备份条目必须包含 ref 和 data');
            }
        }
    } catch (error) {
        throw buildError({
            phase: 'backup',
            original: error,
            attempted: 0,
            cleaned: 0,
            backupCount: 0,
            restored: 0,
        });
    }

    const attempted = [];
    let phase = 'delete';

    try {
        for (const refs of chunk(backup.map((entry) => entry.ref), size)) {
            await commitDelete(refs);
        }

        phase = 'insert';
        for (const items of chunk(newItems, size)) {
            const writes = items.map((item) => {
                const ref = createRef(item);
                // Record before commit: a rejected commit may still have landed.
                attempted.push(ref);
                return { ref, data: item };
            });
            await commitSet(writes);
        }

        return { inserted: attempted.length, backupCount: backup.length };
    } catch (original) {
        // Delete this run's attempted refs first. A batch commit that threw may
        // still be on the server, so we delete attempted refs, not just acknowledged
        // ones. Never touch refs we did not create in this run.
        let cleaned = 0;
        let cleanupError = null;
        for (const refs of chunk(attempted, size)) {
            try {
                await commitDelete(refs);
                cleaned += refs.length;
            } catch (error) {
                cleanupError = cleanupError || error;
            }
        }

        // Then restore the pre-import documents (set is idempotent for docs that
        // were never deleted, and recreates docs deleted before the failure).
        let restored = 0;
        let restoreError = null;
        const restoreWrites = backup.map((entry) => ({ ref: entry.ref, data: entry.data }));
        for (const writes of chunk(restoreWrites, size)) {
            try {
                await commitSet(writes);
                restored += writes.length;
            } catch (error) {
                restoreError = restoreError || error;
            }
        }

        throw buildError({
            phase,
            original,
            attempted: attempted.length,
            cleaned,
            backupCount: backup.length,
            restored,
            cleanupError,
            restoreError,
        });
    }
};
