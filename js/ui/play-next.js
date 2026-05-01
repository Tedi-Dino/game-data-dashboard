import { items } from '../core/state.js';
import { openModal } from './modals.js';
import {
    getAIRecommendations,
    getLocalApiKey, setLocalApiKey, clearLocalApiKey,
    isLocalMode, setLocalMode
} from '../services/recommendations.js';

/**
 * Setup the "接下来玩什么?" (Play Next) modal.
 */
export const setupPlayNextModal = () => {
    const playNextBtn = document.getElementById('play-next-btn');
    const playNextModal = document.getElementById('play-next-modal');
    const closeBtn = document.getElementById('close-play-next-modal-btn');
    const myPlayNextList = document.getElementById('my-play-next-list');
    const aiRecommendationsList = document.getElementById('ai-recommendations-list');
    const aiPromptInput = document.getElementById('ai-prompt-input');
    const aiPromptSendBtn = document.getElementById('ai-prompt-send-btn');
    const myBacklogTitle = document.getElementById('my-backlog-title');
    const myBacklogToggleIcon = document.getElementById('my-backlog-toggle-icon');

    // --- Local API key settings elements ---
    const settingsToggle = document.getElementById('ai-settings-toggle');
    const settingsPanel = document.getElementById('ai-settings-panel');
    const apiKeyInput = document.getElementById('ai-api-key-input');
    const apiKeySaveBtn = document.getElementById('ai-api-key-save-btn');
    const apiKeyClearBtn = document.getElementById('ai-api-key-clear-btn');
    const localModeCheckbox = document.getElementById('ai-local-mode-checkbox');
    const settingsStatus = document.getElementById('ai-settings-status');

    if (!playNextBtn || !playNextModal) return;

    // --- Init settings panel state ---
    const refreshSettingsUI = () => {
        if (!apiKeyInput || !localModeCheckbox || !settingsStatus) return;
        const hasKey = !!getLocalApiKey();
        apiKeyInput.value = hasKey ? '••••••••' : '';
        apiKeyInput.placeholder = hasKey ? '已保存 (重新输入以覆盖)' : '粘贴你的 DeepSeek API Key';
        localModeCheckbox.checked = isLocalMode();
        settingsStatus.textContent = hasKey
            ? (isLocalMode() ? '✅ 本地模式：直接调用 DeepSeek API' : '🔗 云端模式：通过 Cloud Function 调用（备用Key已配置）')
            : '⚠️ 未配置本地API Key';
    };

    // Settings toggle
    if (settingsToggle && settingsPanel) {
        settingsToggle.addEventListener('click', () => {
            settingsPanel.classList.toggle('hidden');
            refreshSettingsUI();
        });
    }

    // Save API key
    if (apiKeySaveBtn && apiKeyInput) {
        apiKeySaveBtn.addEventListener('click', () => {
            const val = apiKeyInput.value.trim();
            if (!val || val === '••••••••') return;
            setLocalApiKey(val);
            apiKeyInput.value = '••••••••';
            refreshSettingsUI();
        });
    }

    // Clear API key
    if (apiKeyClearBtn) {
        apiKeyClearBtn.addEventListener('click', () => {
            clearLocalApiKey();
            if (apiKeyInput) apiKeyInput.value = '';
            setLocalMode(false);
            refreshSettingsUI();
        });
    }

    // Local mode toggle
    if (localModeCheckbox) {
        localModeCheckbox.addEventListener('change', () => {
            setLocalMode(localModeCheckbox.checked);
            refreshSettingsUI();
        });
    }

    // --- Open modal ---
    playNextBtn.addEventListener('click', () => {
        const myPlayNextGames = items.filter(i => i.status === 'backlog');

        if (aiRecommendationsList) {
            aiRecommendationsList.classList.add('hidden');
            aiRecommendationsList.innerHTML = '';
        }

        const container = document.getElementById('my-backlog-container');
        if (container) container.classList.remove('hidden');
        if (myPlayNextList) myPlayNextList.classList.remove('hidden');
        if (myBacklogToggleIcon) myBacklogToggleIcon.classList.remove('rotate-180');

        if (myPlayNextList) {
            myPlayNextList.innerHTML = myPlayNextGames.length > 0
                ? myPlayNextGames.map(g => `<p class="p-3 bg-gray-800/80 rounded-md font-semibold ring-1 ring-gray-700">${g.name}</p>`).join('')
                : '<p class="text-gray-500 text-center">你还没有待玩的游戏。</p>';
        }

        if (aiPromptInput) aiPromptInput.value = '';
        // Hide settings panel on open
        if (settingsPanel) settingsPanel.classList.add('hidden');
        refreshSettingsUI();
        openModal(playNextModal);
    });

    // --- Close modal ---
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            playNextModal.classList.add('hidden');
            playNextModal.classList.remove('flex');
        });
    }

    // --- Toggle backlog list ---
    if (myBacklogTitle && myBacklogToggleIcon) {
        myBacklogTitle.addEventListener('click', () => {
            myPlayNextList?.classList.toggle('hidden');
            myBacklogToggleIcon.classList.toggle('rotate-180');
        });
    }

    // --- AI recommendation request ---
    if (aiPromptSendBtn && aiPromptInput) {
        aiPromptSendBtn.addEventListener('click', async () => {
            const customPrompt = aiPromptInput.value;

            if (aiRecommendationsList) {
                aiRecommendationsList.classList.remove('hidden');
                aiRecommendationsList.innerHTML = '<div class="flex justify-center items-center h-24"><p class="text-gray-500 animate-pulse">🤖 正在向AI咨询中，请稍候...</p></div>';
            }

            const result = await getAIRecommendations(customPrompt);

            if (!aiRecommendationsList) return;

            if (result.error) {
                // Show error with whiteSpace pre-line to preserve formatting
                aiRecommendationsList.innerHTML = `<div class="p-4 bg-red-900/50 rounded-lg text-red-400 text-center" style="white-space: pre-line">${result.error}</div>`;
            } else if (result.recommendations && result.recommendations.length > 0) {
                if (myPlayNextList) myPlayNextList.classList.add('hidden');
                if (myBacklogToggleIcon) myBacklogToggleIcon.classList.add('rotate-180');

                aiRecommendationsList.innerHTML = result.recommendations
                    .map(rec => `<div class="p-3 bg-gray-700/80 rounded-md ring-1 ring-gray-600"><h4 class="font-bold text-white text-md">${rec.name}</h4><p class="text-gray-300 mt-1 text-sm">${rec.reason}</p></div>`)
                    .join('');
            } else {
                aiRecommendationsList.innerHTML = '<p class="text-gray-500 text-center">AI暂时没有找到合适的推荐。</p>';
            }
        });
    }
};
