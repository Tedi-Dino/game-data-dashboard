import { items } from '../core/state.js';
import { escapeHTML } from '../core/utils.js';
import { openModal, closeModal } from './modals.js';

/**
 * Setup the "那年今日" (On This Day) modal.
 */
export const setupOnThisDay = () => {
    const btn = document.getElementById('on-this-day-btn');
    const modal = document.getElementById('on-this-day-modal');
    const closeBtn = document.getElementById('close-on-this-day-modal-btn');
    const content = document.getElementById('on-this-day-content');

    if (!btn || !modal || !content) return;

    btn.addEventListener('click', () => {
        const today = new Date();
        const currentYear = today.getFullYear();

        // Build a Set of "M-D" strings for today +/- 3 days
        const targetDates = new Set();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 3);
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 3);
        for (let offset = -3; offset <= 3; offset++) {
            const d = new Date(today);
            d.setDate(today.getDate() + offset);
            targetDates.add(`${d.getMonth()}-${d.getDate()}`);
        }

        const gamesByYear = {};

        items.forEach(item => {
            if (item.type !== 'hardware' && item.purchaseDate) {
                const purchaseDate = new Date(item.purchaseDate);
                if (!isNaN(purchaseDate.getTime())) {
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

        if (sortedYears.length === 0) {
            htmlContent = '<p class="text-center text-stone-500">在过去的这段时间里，似乎没有留下游戏足迹哦。</p>';
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
                            const d = new Date(g.purchaseDate);
                            if (!isNaN(d.getTime())) itemMonths.add(d.getMonth());
                        }
                    });
                    const months = [...itemMonths].sort((a, b) => a - b);
                    const monthString = months.length === 1
                        ? `${months[0] + 1}月`
                        : `${months[0] + 1}月 - ${months[months.length - 1] + 1}月`;

                    const gameListHtml = topGames.map(g => {
                        const icon = g.type === 'drama' ? '📺' : '🎮';
                        return `<p class="text-xl font-bold text-stone-900 truncate">${icon} ${escapeHTML(g.name)}</p>`;
                    }).join('');
                    htmlContent += `<div class="py-3 border-b border-stone-200 last:border-b-0"><p class="text-stone-500">${year}年 ${monthString}，你可能在体验：</p><div class="mt-2 space-y-1">${gameListHtml}</div></div>`;
                }
            });

            if (!htmlContent) {
                htmlContent = '<p class="text-center text-stone-500">在过去的这段时间里，似乎没有留下游戏足迹哦。</p>';
            }
        }

        content.innerHTML = htmlContent;
        openModal(modal);
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(modal));
    }
};
