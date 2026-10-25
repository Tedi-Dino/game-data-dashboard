import { items } from '../core/state.js';
import { escapeHTML, parseLocalDateOnly } from '../core/utils.js';
import { openModal, closeModal } from './modals.js';

/**
 * Setup the "那年今日" (On This Day) modal.
 */
export const setupOnThisDay = () => {
    const btn = document.getElementById('on-this-day-btn');
    const modal = document.getElementById('on-this-day-modal');
    const closeBtn = document.getElementById('close-on-this-day-modal-btn');
    const content = document.getElementById('on-this-day-content');
    const subtitle = document.getElementById('on-this-day-subtitle');

    if (!btn || !modal || !content) return;

    btn.addEventListener('click', () => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

        // Build a Set of "M-D" strings for today +/- 3 days
        const targetDates = new Set();
        for (let offset = -3; offset <= 3; offset++) {
            const d = new Date(today);
            d.setDate(today.getDate() + offset);
            targetDates.add(`${d.getMonth()}-${d.getDate()}`);
        }

        const gamesByYear = {};

        items.forEach(item => {
            if (item.type !== 'hardware' && item.purchaseDate) {
                // Parse in local time: 'YYYY-MM-DD' via `new Date()` is UTC midnight,
                // which reports the previous day in every western timezone.
                const purchaseDate = parseLocalDateOnly(String(item.purchaseDate).split('T')[0]);
                if (purchaseDate) {
                    const purchaseYear = purchaseDate.getFullYear();
                    const key = `${purchaseDate.getMonth()}-${purchaseDate.getDate()}`;
                    if (purchaseYear < currentYear && targetDates.has(key)) {
                        if (!gamesByYear[purchaseYear]) {
                            gamesByYear[purchaseYear] = [];
                        }
                        gamesByYear[purchaseYear].push(item);
                    }
                }
            }
        });

        let htmlContent = '';
        const sortedYears = Object.keys(gamesByYear).sort((a, b) => b - a);
        const emptyMarkup = '<div class="empty-state is-visible"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i><p>在过去的这几天里，没有找到影音足迹。</p><p class="empty-hint">购入日期前后 3 天内的历年记录会出现在这里。</p></div>';

        if (sortedYears.length === 0) {
            htmlContent = emptyMarkup;
        } else {
            sortedYears.forEach(year => {
                const topGames = gamesByYear[year]
                    .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
                    .slice(0, 5);
                if (topGames.length > 0) {
                    // Only show months that actually have items
                    const itemMonths = new Set();
                    gamesByYear[year].forEach(g => {
                        if (g.purchaseDate) {
                            const d = parseLocalDateOnly(String(g.purchaseDate).split('T')[0]);
                            if (d) itemMonths.add(d.getMonth());
                        }
                    });
                    const months = [...itemMonths].sort((a, b) => a - b);
                    const monthString = months.length === 1
                        ? `${months[0] + 1}月`
                        : `${months[0] + 1}月 - ${months[months.length - 1] + 1}月`;

                    const gameListHtml = topGames.map(g => {
                        const icon = g.type === 'drama' ? '📺' : '🎮';
                        return `<p class="text-lg font-semibold text-stone-900 truncate">${icon} ${escapeHTML(g.name || '')}</p>`;
                    }).join('');
                    htmlContent += `<div class="py-3 border-b border-stone-200 last:border-b-0"><p class="text-stone-500 text-sm">${year}年 ${monthString}，你可能在体验：</p><div class="mt-2 space-y-1">${gameListHtml}</div></div>`;
                }
            });

            if (!htmlContent) {
                htmlContent = emptyMarkup;
            }
        }

        if (subtitle) {
            subtitle.textContent = `以 ${todayLabel} 为中心，回顾前后 3 天内的历年影音足迹`;
        }
        content.innerHTML = htmlContent;
        openModal(modal);
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(modal));
    }
};
