import { KPI_FILTERS } from './table-utils.js';
import { openListModal } from './data-table.js';

/**
 * Make KPI metrics act as shortcuts into the detail table.
 *
 * The whole metric row is the hit target (`data-kpi-filter`), so the hover
 * tooltip remains untouched. A click opens the list modal filtered to exactly
 * the population behind the number (e.g. "未通关游戏价值" → unfinished games).
 */
export const setupKpiFilters = () => {
    document.querySelectorAll('[data-kpi-filter]').forEach(el => {
        const filterKey = el.dataset.kpiFilter;
        if (!KPI_FILTERS[filterKey]) return;

        el.setAttribute('aria-haspopup', 'dialog');
        const activate = () => openListModal(filterKey);

        el.addEventListener('click', activate);
        el.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            activate();
        });
    });
};
