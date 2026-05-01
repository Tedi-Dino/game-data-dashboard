import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js';
import { functions } from '../config/firebase.js';
import { items } from '../core/state.js';
import { STATUS_MAP } from '../config/constants.js';

// --- Local API Key Management ---
const LOCAL_KEY_STORAGE = 'deepseek_local_api_key';
const LOCAL_MODE_STORAGE = 'deepseek_local_mode';

export const getLocalApiKey = () => localStorage.getItem(LOCAL_KEY_STORAGE) || '';
export const setLocalApiKey = (key) => localStorage.setItem(LOCAL_KEY_STORAGE, key.trim());
export const clearLocalApiKey = () => localStorage.removeItem(LOCAL_KEY_STORAGE);
export const isLocalMode = () => localStorage.getItem(LOCAL_MODE_STORAGE) === 'true';
export const setLocalMode = (enabled) => localStorage.setItem(LOCAL_MODE_STORAGE, enabled ? 'true' : 'false');

/**
 * Build the prompt string from current game data.
 */
const buildPrompt = (customPrompt) => {
    const passedGames = items
        .filter(i => i.status === 'passed' && i.type !== 'hardware')
        .map(i => `《${i.name}》 (用户评分: ${i.rating || '未评'}/5)`)
        .join('\n');

    const unpassedGames = items
        .filter(i => i.status !== 'passed' && i.type !== 'hardware')
        .map(i => `《${i.name}》 (状态: ${STATUS_MAP[i.status] || i.status || '未知'})`)
        .join('\n');

    return { passedGames, unpassedGames, prompt: `你是一个资深游戏玩家和推荐助手。请分析一个玩家的游戏数据。

### 玩家【已通关】的游戏 (包含用户评分 1-5分):
${passedGames || "无"}

### 玩家【未通关】的游戏 (包含当前状态):
${unpassedGames || "无"}

### 玩家的额外需求:
${customPrompt || "无特定需求，请综合推荐。"}

### 你的任务:
请根据玩家【已通关】的游戏列表（特别是高分游戏）来分析他的品味，并结合他的【额外需求】，为他推荐最多5款游戏。
1.  **首要目标**: 优先从"玩家【未通关】的游戏"列表中推荐最匹配的游戏。
2.  **次要目标**: 如果"额外需求"很明确（例如 "想玩xx类型"），并且"未通关"列表中没有匹配的，**请推荐不在该列表中的新游戏**。
3.  如果"额外需求"为空，请主要从"未通关"列表中推荐。
4.  理由应简短（不超过50字），并说明为什么推荐（例如 "看你喜欢《XXX》(高分)，这款《YYY》你也许会喜欢" 或 "这是你待玩列表中的xx类型"）。
5.  按推荐优先级从高到低排序。

请严格按照以下JSON格式返回，不要包含任何多余的解释、代码块标记或标题。
[
  {"name": "游戏名1", "reason": "推荐理由1..."},
  {"name": "游戏名2", "reason": "推荐理由2..."}
]` };
};

/**
 * Parse AI response text into recommendations array.
 */
const parseRecommendations = (text) => {
    try {
        const recommendations = JSON.parse(text);
        if (Array.isArray(recommendations) && recommendations.every(r => r.name && r.reason)) {
            return { recommendations };
        }
        throw new Error('Invalid structure');
    } catch (e) {
        console.error('Failed to parse AI response as JSON:', text, e);
        return { error: 'AI返回的格式不正确，无法解析推荐内容。' };
    }
};

/**
 * Call DeepSeek API directly (for local dev / bypass Cloud Function).
 */
const callDeepSeekDirectly = async (customPrompt) => {
    const apiKey = getLocalApiKey();
    if (!apiKey) {
        return { error: '本地API密钥未配置，请在设置中填入DeepSeek API Key。' };
    }

    const { prompt } = buildPrompt(customPrompt);

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-v4-pro',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('DeepSeek API Error:', errData);
            return { error: `DeepSeek API 返回错误 (${response.status})。请检查API密钥是否有效。` };
        }

        const data = await response.json();
        const textContent = data?.choices?.[0]?.message?.content || '';
        if (!textContent) {
            return { error: 'DeepSeek API 返回了空响应。' };
        }

        return parseRecommendations(textContent);
    } catch (error) {
        console.error('Direct DeepSeek call failed:', error);
        return { error: `请求DeepSeek API失败: ${error.message}` };
    }
};

/**
 * Call the Firebase Cloud Function for AI recommendations.
 */
const callCloudFunction = async (customPrompt) => {
    const { passedGames, unpassedGames } = buildPrompt(customPrompt);

    try {
        const fn = httpsCallable(functions, 'getAiRecommendations');
        const result = await fn({ passedGames, unpassedGames, customPrompt });
        const data = result.data;

        if (!data || !data.output || !data.output.text) {
            throw new Error('从云函数返回的响应结构无效。');
        }

        return parseRecommendations(data.output.text);
    } catch (error) {
        console.error('Cloud Function call failed:', error);
        let msg = '调用AI服务时发生未知错误。';
        if (error.code === 'unavailable') {
            msg = '无法连接到AI服务，请检查网络连接。';
        } else if (error.message) {
            msg = `调用AI服务失败: ${error.message}`;
        }
        return { error: msg };
    }
};

/**
 * Get AI game recommendations.
 * Tries Cloud Function first; falls back to direct DeepSeek API for local dev.
 * @param {string} customPrompt
 * @returns {{ recommendations?: Array, error?: string }}
 */
export const getAIRecommendations = async (customPrompt = '') => {
    const { unpassedGames } = buildPrompt(customPrompt);

    if (!unpassedGames && !customPrompt) {
        return { recommendations: [{ name: '太棒了！', reason: '您的未通关清单已经一干二净！' }] };
    }

    // If user explicitly set local mode, use direct API call
    if (isLocalMode()) {
        return await callDeepSeekDirectly(customPrompt);
    }

    // Otherwise try Cloud Function first
    const cfResult = await callCloudFunction(customPrompt);
    if (!cfResult.error) return cfResult;

    // Cloud Function failed — try local API key as fallback
    if (getLocalApiKey()) {
        console.log('Cloud Function unavailable, falling back to direct DeepSeek call...');
        return await callDeepSeekDirectly(customPrompt);
    }

    // Neither works — give helpful error
    return {
        error: `${cfResult.error}\n\n💡 本地调试提示：如果你在本地运行此页面，请在设置中填入DeepSeek API Key以直接调用AI。`
    };
};
