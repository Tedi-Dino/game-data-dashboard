import { items } from '../core/state.js';
import { showConfirmation, showAlert } from './modals.js';
import { importCSV, exportCSV, parseCSVText } from '../services/csv.js';
import { bulkReplaceItems, updateLastModifiedTimestamp } from '../services/firestore.js';

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

            showConfirmation('导入CSV将覆盖所有现有数据，您确定吗？').then(async (confirmed) => {
                if (!confirmed) return;

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
                    try {
                        await importCSV(text);
                        showAlert('导入成功！');
                    } catch (error) {
                        console.error(error);
                        showAlert(`导入失败：${error.message || '请检查CSV格式或控制台日志。'}`);
                    }
                };
                reader.readAsText(selectedFile, 'UTF-8');
            });
        });
    }
};
