import { items } from '../core/state.js';
import { showConfirmation, showAlert } from './modals.js';
import { importCSV, exportCSV, parseCSVText } from '../services/csv.js';

// Render a dry-run summary of what an import would do.
// Rows the parser rejects are silently dropped from Firestore, so they have to be
// surfaced *before* anything is written.
const buildImportSummary = (parsed) => {
    const currentCount = items.length;
    const newCount = parsed.items.length;
    const lines = [
        `现有记录：${currentCount} 条`,
        `将写入：${newCount} 条`,
        `将被删除：${currentCount} 条（导入会先清空所有现有数据）`
    ];

    if (parsed.skippedDetails.length > 0) {
        const shown = parsed.skippedDetails.slice(0, 5);
        lines.push('', `⚠️ 将跳过 ${parsed.skippedDetails.length} 条（缺少必填字段 id/name/type）：`);
        shown.forEach(d => lines.push(`  第 ${d.row} 行：缺少 ${d.missing.join('、')}`));
        if (parsed.skippedDetails.length > shown.length) {
            lines.push(`  …另有 ${parsed.skippedDetails.length - shown.length} 条`);
        }
        lines.push('  被跳过的行不会写入，导入后将从线上永久丢失。');
    }

    lines.push('', '注意：导入后所有记录的 Firestore 文档 ID 会重新生成。', '确定要继续吗？');
    return lines.join('\n');
};

/**
 * Setup CSV import and export button handlers.
 */
export const setupCSVHandlers = () => {
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const csvInput = document.getElementById('csv-import-input');

    // Export
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (items.length === 0) {
                showAlert('没有数据可以导出。');
                return;
            }
            exportCSV();
        });
    }

    // Import: trigger file picker
    if (importBtn && csvInput) {
        importBtn.addEventListener('click', () => csvInput.click());

        csvInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Reset the input immediately so the same file can be re-selected,
            // but save the file reference first since the input will be cleared
            const selectedFile = file;
            e.target.value = null;

            const reader = new FileReader();
            reader.onerror = () => {
                showAlert('文件读取失败，请重试。');
            };
            reader.onload = async (re) => {
                const text = re.target.result;
                if (!text) {
                    showAlert('文件为空或无法读取。');
                    return;
                }

                // Parse locally first so nothing destructive can happen on a
                // malformed file, and so the user sees what will be lost.
                let parsed;
                try {
                    parsed = parseCSVText(text);
                } catch (error) {
                    console.error(error);
                    showAlert(`导入失败：${error.message || '请检查CSV格式或控制台日志。'}\n\n未做任何改动。`);
                    return;
                }

                // Refuse to wipe the collection for a file with no usable rows.
                if (parsed.items.length === 0) {
                    showAlert(`导入已取消：CSV 中没有解析出任何有效记录（共跳过 ${parsed.skipped} 条）。\n\n为避免误清空数据，未写入 Firestore。`);
                    return;
                }

                const confirmed = await showConfirmation(buildImportSummary(parsed), true);
                if (!confirmed) return;

                try {
                    const result = await importCSV(text);
                    if (result.skipped > 0) {
                        const rows = result.skippedDetails.slice(0, 10).map(d => d.row).join('、');
                        showAlert(`导入完成，但有行被跳过。\n\n成功导入：${result.imported} 条\n跳过：${result.skipped} 条（第 ${rows} 行）\n\n这些行未写入 Firestore，请检查 CSV 后重新导入。`);
                    } else {
                        showAlert(`导入成功：${result.imported} 条。`);
                    }
                } catch (error) {
                    console.error(error);
                    showAlert(`导入失败：${error.message || '请检查CSV格式或控制台日志。'}`);
                }
            };
            reader.readAsText(selectedFile, 'UTF-8');
        });
    }
};
