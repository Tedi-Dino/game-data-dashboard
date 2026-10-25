import { items } from '../core/state.js';
import { escapeHTML } from '../core/utils.js';
import { openModal, closeModal, showToast, onModalClose } from './modals.js';
import { isAdmin } from './auth.js';
import { FEATURES } from '../config/constants.js';
import {
    getAIRecommendations, cancelAIRequest,
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
    const myBacklogCount = document.getElementById('my-backlog-count');

    // --- Local API key settings elements ---
    const settingsToggle = document.getElementById('ai-settings-toggle');
    const settingsPanel = document.getElementById('ai-settings-panel');
    const apiKeyInput = document.getElementById('ai-api-key-input');
    const apiKeyToggle = document.getElementById('ai-api-key-toggle');
    const apiKeySaveBtn = document.getElementById('ai-api-key-save-btn');
    const apiKeyClearBtn = document.getElementById('ai-api-key-clear-btn');
    const localModeCheckbox = document.getElementById('ai-local-mode-checkbox');
    const localModeRow = document.getElementById('ai-local-mode-row');
    const thinkingModeCheckbox = document.getElementById('ai-thinking-mode-checkbox');
    const settingsStatus = document.getElementById('ai-settings-status');

    if (!playNextBtn || !playNextModal) return;

    // Free tier is always direct: the Cloud Function does not exist, so the
    // "bypass Cloud Function" toggle would be a no-op switch. Hide it instead of
    // letting it imply a choice that has no effect.
    if (localModeRow && FEATURES.AI_LOCAL_ONLY) localModeRow.classList.add('hidden');

    // --- Init settings panel state ---
    const refreshSettingsUI = () => {
        if (!settingsStatus) return;
        const hasKey = !!getLocalApiKey();
        if (apiKeyInput) {
            // Placeholder/prompt follows the saved state. Do not touch the value
            // here: collapsing and reopening the panel must not erase a key the
            // user is still typing. The field is cleared on save and on open.
            apiKeyInput.placeholder = hasKey ? '已保存（输入新 Key 覆盖）' : '粘贴你的 DeepSeek API Key';
        }
        if (localModeCheckbox) localModeCheckbox.checked = isLocalMode();
        if (thinkingModeCheckbox) thinkingModeCheckbox.checked = isThinkingMode();
        settingsStatus.dataset.tone = hasKey ? 'ok' : 'warn';
        if (FEATURES.AI_LOCAL_ONLY) {
            settingsStatus.textContent = hasKey
                ? '✅ 已配置：直接调用 DeepSeek API（免费套餐不使用 Cloud Function）'
                : '⚠️ 未配置 DeepSeek API Key';
            return;
        }
        settingsStatus.textContent = hasKey
            ? (isLocalMode() ? '✅ 本地模式：直接调用 DeepSeek API' : '🔗 云端模式：通过 Cloud Function 调用（备用 Key 已配置）')
            : '⚠️ 未配置本地 API Key';
    };

    // Settings toggle
    if (settingsToggle && settingsPanel) {
        settingsToggle.addEventListener('click', () => {
            const open = settingsPanel.classList.toggle('hidden') === false;
            settingsToggle.setAttribute('aria-expanded', String(open));
            refreshSettingsUI();
            if (open) apiKeyInput?.focus();
        });
    }

    // Password visibility toggle
    if (apiKeyToggle && apiKeyInput) {
        apiKeyToggle.addEventListener('click', () => {
            const reveal = apiKeyInput.type === 'password';
            apiKeyInput.type = reveal ? 'text' : 'password';
            apiKeyToggle.setAttribute('aria-pressed', String(reveal));
            apiKeyToggle.setAttribute('aria-label', reveal ? '隐藏 API Key' : '显示 API Key');
            const icon = apiKeyToggle.querySelector('i');
            if (icon) icon.className = reveal ? 'fas fa-eye-slash' : 'fas fa-eye';
        });
    }

    // Save API key
    if (apiKeySaveBtn && apiKeyInput) {
        apiKeySaveBtn.addEventListener('click', () => {
            const val = apiKeyInput.value.trim();
            if (!val || val === '••••••••') {
                showToast('请输入要保存的 API Key', { tone: 'error' });
                return;
            }
            setLocalApiKey(val);
            apiKeyInput.value = '';
            refreshSettingsUI();
            showToast('API Key 已保存在本机浏览器', { tone: 'success' });
        });
    }

    // Clear API key
    if (apiKeyClearBtn) {
        apiKeyClearBtn.addEventListener('click', () => {
            clearLocalApiKey();
            setLocalMode(false);
            refreshSettingsUI();
            showToast('已清除本地 API Key');
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

    // AI column visibility follows the current role even if auth changes while
    // the modal is open.
    const applyAiVisibility = () => {
        const aiSection = document.getElementById('ai-section');
        const aiGrid = aiSection ? aiSection.parentElement : null;
        const aiAllowed = isAdmin();
        if (aiSection) aiSection.classList.toggle('hidden', !aiAllowed);
        if (aiGrid) {
            aiGrid.classList.toggle('md:grid-cols-2', aiAllowed);
            aiGrid.classList.toggle('md:grid-cols-1', !aiAllowed);
        }
    };
    document.addEventListener('authchange', () => {
        if (!playNextModal.classList.contains('hidden')) applyAiVisibility();
    });

    // --- Backlog toggle (mouse + keyboard) ---
    if (myBacklogTitle && myPlayNextList && myBacklogToggleIcon) {
        const toggleBacklog = () => {
            const collapsed = myPlayNextList.classList.toggle('hidden');
            myBacklogToggleIcon.classList.toggle('rotate-180', collapsed);
            myBacklogTitle.setAttribute('aria-expanded', String(!collapsed));
        };
        myBacklogTitle.addEventListener('click', toggleBacklog);
        myBacklogTitle.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggleBacklog();
        });
    }

    // --- Open modal ---
    playNextBtn.addEventListener('click', () => {
        const backlog = items
            .filter(i => i.status === 'backlog' && i.type !== 'hardware')
            .sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
        const myBacklogGames = backlog.filter(i => i.type !== 'drama');
        const myBacklogDramas = backlog.filter(i => i.type === 'drama');

        if (aiRecommendationsList) {
            aiRecommendationsList.classList.add('hidden');
            aiRecommendationsList.innerHTML = '';
        }

        const container = document.getElementById('my-backlog-container');
        if (container) container.classList.remove('hidden');
        if (myPlayNextList) myPlayNextList.classList.remove('hidden');
        if (myBacklogTitle) myBacklogTitle.setAttribute('aria-expanded', 'true');
        if (myBacklogToggleIcon) myBacklogToggleIcon.classList.remove('rotate-180');
        if (myBacklogCount) {
            myBacklogCount.textContent = `(${myBacklogGames.length + myBacklogDramas.length})`;
        }

        if (myPlayNextList) {
            let html = '';
            if (myBacklogGames.length > 0) {
                html += `<p class="backlog-group-title backlog-group-game">🎮 待玩游戏 · ${myBacklogGames.length}</p>`;
                html += myBacklogGames.map(g => `<p class="backlog-item">${escapeHTML(g.name)}</p>`).join('');
            }
            if (myBacklogDramas.length > 0) {
                html += `<p class="backlog-group-title backlog-group-drama">📺 待看剧集 · ${myBacklogDramas.length}</p>`;
                html += myBacklogDramas.map(g => `<p class="backlog-item backlog-item-drama">${escapeHTML(g.name)}</p>`).join('');
            }
            if (!html) {
                html = '<div class="empty-state is-visible"><i class="fas fa-mug-hot" aria-hidden="true"></i><p>你还没有待玩/待看的内容。</p></div>';
            }
            myPlayNextList.innerHTML = html;
        }

        if (aiPromptInput) aiPromptInput.value = '';
        // Never carry a typed/revealed key across openings.
        if (apiKeyInput) {
            apiKeyInput.value = '';
            apiKeyInput.type = 'password';
        }
        if (apiKeyToggle) {
            apiKeyToggle.setAttribute('aria-pressed', 'false');
            apiKeyToggle.setAttribute('aria-label', '显示 API Key');
            const icon = apiKeyToggle.querySelector('i');
            if (icon) icon.className = 'fas fa-eye';
        }
        // Hide settings panel on open
        if (settingsPanel) settingsPanel.classList.add('hidden');
        if (settingsToggle) settingsToggle.setAttribute('aria-expanded', 'false');

        // AI panel is a paid-era surface: on Spark the DeepSeek key lives in the
        // admin's own browser, so a visitor could only ever hit "未配置 API Key".
        applyAiVisibility();
        refreshSettingsUI();
        openModal(playNextModal);
    });

    // --- Close modal ---
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(playNextModal));
    }
    // Escape and backdrop clicks must cancel an in-flight request too.
    onModalClose(playNextModal, () => cancelAIRequest());

    // --- AI recommendation request ---
    let aiRequestPending = false;
    const sendRequest = async () => {
        if (aiRequestPending) return;
        const customPrompt = aiPromptInput?.value || '';

        aiRequestPending = true;
        if (aiPromptSendBtn) {
            aiPromptSendBtn.disabled = true;
            aiPromptSendBtn.setAttribute('aria-busy', 'true');
        }
        if (aiRecommendationsList) {
            aiRecommendationsList.classList.remove('hidden');
            aiRecommendationsList.innerHTML = '<div class="flex justify-center items-center h-24"><p class="text-stone-500 animate-pulse">🤖 正在向 AI 咨询中，请稍候…</p></div>';
        }

        try {
            const result = await getAIRecommendations(customPrompt);

            if (!aiRecommendationsList) return;

            if (result.error) {
                aiRecommendationsList.innerHTML = `<div class="ai-error" role="alert">${escapeHTML(result.error)}</div>`;
            } else if (result.recommendations && result.recommendations.length > 0) {
                // Collapse backlog to make room for AI results; the title toggle
                // still restores it.
                if (myPlayNextList) myPlayNextList.classList.add('hidden');
                if (myBacklogTitle) myBacklogTitle.setAttribute('aria-expanded', 'false');
                if (myBacklogToggleIcon) myBacklogToggleIcon.classList.add('rotate-180');

                aiRecommendationsList.innerHTML = result.recommendations
                    .map(rec => {
                        const isDrama = rec.type === '剧集';
                        const icon = isDrama ? '📺' : '🎮';
                        return `<div class="ai-rec-card${isDrama ? ' ai-rec-card-drama' : ''}"><h4>${icon} ${escapeHTML(rec.name)}</h4><p>${escapeHTML(rec.reason)}</p></div>`;
                    })
                    .join('');
            } else {
                aiRecommendationsList.innerHTML = '<p class="text-stone-500 text-center py-6">AI 暂时没有找到合适的推荐。</p>';
            }
        } catch (error) {
            console.error('AI recommendation request failed:', error);
            if (aiRecommendationsList) {
                aiRecommendationsList.innerHTML = '<div class="ai-error" role="alert">请求失败，请检查网络连接后重试。</div>';
            }
        } finally {
            aiRequestPending = false;
            if (aiPromptSendBtn) {
                aiPromptSendBtn.disabled = false;
                aiPromptSendBtn.removeAttribute('aria-busy');
            }
        }
    };

    if (aiPromptSendBtn) {
        aiPromptSendBtn.addEventListener('click', sendRequest);
    }
    if (aiPromptInput) {
        aiPromptInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            e.preventDefault();
            sendRequest();
        });
    }
};
