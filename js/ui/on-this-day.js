import { items } from '../core/state.js';
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

        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 3);
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 3);

        const startMonth = startDate.getMonth();
        const endMonth = endDate.getMonth();
        const targetMonths = Array.from(new Set([startMonth, endMonth]));

        const gamesByYear = {};

        items.forEach(item => {
            if (item.type !== 'hardware' && item.purchaseDate) {
                const purchaseDate = new Date(item.purchaseDate);
                if (!isNaN(purchaseDate.getTime())) {
                    const purchaseMonth = purchaseDate.getMonth();
                    const purchaseYear = purchaseDate.getFullYear();
                    if (purchaseYear < currentYear && targetMonths.includes(purchaseMonth)) {
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
            htmlContent = '<p class="text-center text-gray-400">在过去的这段时间里，似乎没有留下游戏足迹哦。</p>';
        } else {
            const monthString = (startMonth === endMonth) ? `${startMonth + 1}月` : `${startMonth + 1}月 - ${endMonth + 1}月`;

            sortedYears.forEach(year => {
                const topGames = gamesByYear[year]
                    .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
                    .slice(0, 5);
                if (topGames.length > 0) {
                    const gameListHtml = topGames.map(g => `<p class="text-xl font-bold text-white truncate">${g.name}</p>`).join('');
                    htmlContent += `<div class="py-3 border-b border-gray-700 last:border-b-0"><p class="text-gray-400">${year}年 ${monthString}，你可能在玩：</p><div class="mt-2 space-y-1">${gameListHtml}</div></div>`;
                }
            });

            if (!htmlContent) {
                htmlContent = '<p class="text-center text-gray-400">在过去的这段时间里，似乎没有留下游戏足迹哦。</p>';
            }
        }

        content.innerHTML = htmlContent;
        openModal(modal);
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(modal));
    }
};
