import { items } from '../core/state.js';
import { escapeHTML } from '../core/utils.js';
import { openModal, closeModal } from './modals.js';
import { isAdmin } from './auth.js';
import {
    getAIRecommendations,
    getLocalApiKey, setLocalApiKey, clearLocalApiKey,
    isLocalMode, setLocalMode,
    isThinkingMode, setThinkingMode
} from '../services/recommendations.js';

/**
 * Setup the "接下来" (Play Next) modal.
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
    const thinkingModeCheckbox = document.getElementById('ai-thinking-mode-checkbox');
    const settingsStatus = document.getElementById('ai-settings-status');

    if (!playNextBtn || !playNextModal) return;

    // --- Init settings panel state ---
    const refreshSettingsUI = () => {
        if (!apiKeyInput || !localModeCheckbox || !settingsStatus) return;
        const hasKey = !!getLocalApiKey();
        apiKeyInput.value = hasKey ? '••••••••' : '';
        apiKeyInput.placeholder = hasKey ? '已保存 (重新输入以覆盖)' : '粘贴你的 DeepSeek API Key';
        localModeCheckbox.checked = isLocalMode();
        if (thinkingModeCheckbox) thinkingModeCheckbox.checked = isThinkingMode();
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

    // Thinking mode toggle
    if (thinkingModeCheckbox) {
        thinkingModeCheckbox.addEventListener('change', () => {
            setThinkingMode(thinkingModeCheckbox.checked);
            refreshSettingsUI();
        });
    }

    // --- Open modal ---
    playNextBtn.addEventListener('click', () => {
        const myBacklogGames = items.filter(i => i.status === 'backlog' && i.type !== 'drama');
        const myBacklogDramas = items.filter(i => i.status === 'backlog' && i.type === 'drama');

        if (aiRecommendationsList) {
            aiRecommendationsList.classList.add('hidden');
            aiRecommendationsList.innerHTML = '';
        }

        const container = document.getElementById('my-backlog-container');
        if (container) container.classList.remove('hidden');
        if (myPlayNextList) myPlayNextList.classList.remove('hidden');
        if (myBacklogToggleIcon) myBacklogToggleIcon.classList.remove('rotate-180');

        if (myPlayNextList) {
            let html = '';
            if (myBacklogGames.length > 0) {
                html += '<p class="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">🎮 待玩游戏</p>';
                html += myBacklogGames.map(g => `<p class="p-3 bg-stone-100 rounded-md font-semibold ring-1 ring-stone-200 text-stone-800">${escapeHTML(g.name)}</p>`).join('');
            }
            if (myBacklogDramas.length > 0) {
                html += '<p class="text-xs font-semibold text-rose-500 uppercase tracking-wider mt-4 mb-2">📺 待看剧集</p>';
                html += myBacklogDramas.map(g => `<p class="p-3 bg-rose-50 rounded-md font-semibold ring-1 ring-rose-200 text-stone-800">${escapeHTML(g.name)}</p>`).join('');
            }
            if (!html) {
                html = '<p class="text-stone-400 text-center">你还没有待玩/待看的内容。</p>';
            }
            myPlayNextList.innerHTML = html;
        }

        if (aiPromptInput) aiPromptInput.value = '';
        // Hide settings panel on open
        if (settingsPanel) settingsPanel.classList.add('hidden');

        // Admin-only: toggle AI section visibility
        const aiSection = document.getElementById('ai-section');
        if (aiSection) {
            const lockMsg = aiSection.querySelector('.ai-locked-msg');
            if (isAdmin()) {
                if (lockMsg) lockMsg.remove();
                Array.from(aiSection.children).forEach(el => { if (!el.classList.contains('ai-locked-msg')) el.style.display = ''; });
            } else {
                Array.from(aiSection.children).forEach(el => { if (!el.classList.contains('ai-locked-msg')) el.style.display = 'none'; });
                if (!lockMsg) {
                    const div = document.createElement('div');
                    div.className = 'flex items-center justify-center h-full ai-locked-msg';
                    div.innerHTML = '<p class="text-stone-400 text-center">🔒 AI推荐功能仅限管理员使用</p>';
                    aiSection.appendChild(div);
                }
            }
        }
        refreshSettingsUI();
        openModal(playNextModal);
    });

    // --- Close modal ---
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(playNextModal));
    }

    // --- Toggle backlog list ---
    if (myBacklogTitle && myBacklogToggleIcon) {
        myBacklogTitle.addEventListener('click', () => {
            myPlayNextList?.classList.toggle('hidden');
            myBacklogToggleIcon.classList.toggle('rotate-180');
        });
    }

    // --- AI recommendation request ---
    let aiRequestPending = false;
    if (aiPromptSendBtn && aiPromptInput) {
        aiPromptSendBtn.addEventListener('click', async () => {
            if (aiRequestPending) return;
            const customPrompt = aiPromptInput.value;

            aiRequestPending = true;
            aiPromptSendBtn.disabled = true;
            if (aiRecommendationsList) {
                aiRecommendationsList.classList.remove('hidden');
                aiRecommendationsList.innerHTML = '<div class="flex justify-center items-center h-24"><p class="text-stone-400 animate-pulse">🤖 正在向AI咨询中，请稍候...</p></div>';
            }

            try {
                const result = await getAIRecommendations(customPrompt);

                if (!aiRecommendationsList) return;

                if (result.error) {
                    aiRecommendationsList.innerHTML = `<div class="p-4 bg-red-50 rounded-lg text-red-600 text-center border border-red-200" style="white-space: pre-line">${escapeHTML(result.error)}</div>`;
                } else if (result.recommendations && result.recommendations.length > 0) {
                    // Collapse backlog to make room for AI results; toggle still works via click
                    if (myPlayNextList) myPlayNextList.classList.add('hidden');
                    if (myBacklogToggleIcon) {
                        myBacklogToggleIcon.classList.add('rotate-180');
                        myBacklogToggleIcon.style.opacity = '1';
                    }

                    aiRecommendationsList.innerHTML = result.recommendations
                        .map(rec => {
                            const isDrama = rec.type === '剧集';
                            const bgColor = isDrama ? 'bg-rose-50' : 'bg-stone-100';
                            const ringColor = isDrama ? 'ring-rose-200' : 'ring-stone-200';
                            const icon = isDrama ? '📺' : '🎮';
                            return `<div class="p-3 ${bgColor} rounded-md ring-1 ${ringColor}"><h4 class="font-bold text-stone-900 text-md">${icon} ${escapeHTML(rec.name)}</h4><p class="text-stone-600 mt-1 text-sm">${escapeHTML(rec.reason)}</p></div>`;
                        })
                        .join('');
                } else {
                    aiRecommendationsList.innerHTML = '<p class="text-stone-400 text-center">AI暂时没有找到合适的推荐。</p>';
                }
            } catch (error) {
                console.error('AI recommendation request failed:', error);
                if (aiRecommendationsList) {
                    aiRecommendationsList.innerHTML = `<div class="p-4 bg-red-50 rounded-lg text-red-600 text-center border border-red-200">请求失败，请检查网络连接后重试。</div>`;
                }
            } finally {
                aiRequestPending = false;
                aiPromptSendBtn.disabled = false;
            }
        });
    }
};
