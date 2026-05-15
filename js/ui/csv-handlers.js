import { items } from '../core/state.js';
import { showConfirmation, showAlert } from './modals.js';
import { importCSV, exportCSV } from '../services/csv.js';

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

            showConfirmation('导入CSV将覆盖所有现有数据，您确定吗？').then(async (confirmed) => {
                if (!confirmed) {
                    e.target.value = null;
                    return;
                }

                const reader = new FileReader();
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
                reader.readAsText(file, 'UTF-8');
            });

            e.target.value = null;
        });
    }
};
