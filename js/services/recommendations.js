import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js';
import { functions } from '../config/firebase.js';
import { items } from '../core/state.js';
import { STATUS_MAP } from '../config/constants.js';

// --- Local API Key Management ---
const LOCAL_KEY_STORAGE = 'deepseek_local_api_key';
const LOCAL_MODE_STORAGE = 'deepseek_local_mode';
const THINKING_MODE_STORAGE = 'deepseek_thinking_mode';

export const getLocalApiKey = () => localStorage.getItem(LOCAL_KEY_STORAGE) || '';
export const setLocalApiKey = (key) => localStorage.setItem(LOCAL_KEY_STORAGE, key.trim());
export const clearLocalApiKey = () => localStorage.removeItem(LOCAL_KEY_STORAGE);
export const isLocalMode = () => localStorage.getItem(LOCAL_MODE_STORAGE) === 'true';
export const setLocalMode = (enabled) => localStorage.setItem(LOCAL_MODE_STORAGE, enabled ? 'true' : 'false');
export const isThinkingMode = () => localStorage.getItem(THINKING_MODE_STORAGE) === 'true';
export const setThinkingMode = (enabled) => localStorage.setItem(THINKING_MODE_STORAGE, enabled ? 'true' : 'false');

/**
 * Build the prompt string from current game and drama data.
 */
const buildPrompt = (customPrompt) => {
    const passedGames = items
        .filter(i => i.status === 'passed' && i.type !== 'hardware' && i.type !== 'drama')
        .map(i => `《${i.name}》 (用户评分: ${i.rating || '未评'}/10)`)
        .join('\n');

    const unpassedGames = items
        .filter(i => i.status !== 'passed' && i.type !== 'hardware' && i.type !== 'drama')
        .map(i => `《${i.name}》 (状态: ${STATUS_MAP[i.status] || i.status || '未知'})`)
        .join('\n');

    const passedDramas = items
        .filter(i => i.status === 'passed' && i.type === 'drama')
        .map(i => `《${i.name}》 (用户评分: ${i.rating || '未评'}/10, 类型: ${i.sort || '未分类'})`)
        .join('\n');

    const unpassedDramas = items
        .filter(i => i.status !== 'passed' && i.type === 'drama')
        .map(i => `《${i.name}》 (状态: ${STATUS_MAP[i.status] || i.status || '未知'})`)
        .join('\n');

    return { passedGames, unpassedGames, passedDramas, unpassedDramas, prompt: `你是一个资深的影音娱乐推荐助手。请分析一个用户的游戏和剧集数据。

### 用户【已通关】的游戏 (包含用户评分 1-10分):
${passedGames || "无"}

### 用户【未通关】的游戏 (包含当前状态):
${unpassedGames || "无"}

### 用户【已看完】的剧集 (包含用户评分 1-10分和类型):
${passedDramas || "无"}

### 用户【未看完】的剧集 (包含当前状态):
${unpassedDramas || "无"}

### 用户的额外需求:
${customPrompt || "无特定需求，请综合推荐。"}

### 你的任务:
请根据用户的数据（特别是高分内容）来分析他的品味，并结合他的【额外需求】，为他推荐4款游戏和1部剧集。
1.  **首要目标**: 优先从"未通关/未看完"列表中推荐最匹配的内容。
2.  **次要目标**: 如果"额外需求"很明确（例如 "想玩xx类型"或"想看xx类型的剧"），并且列表中没有匹配的，**请推荐不在该列表中的新内容**。
3.  如果"额外需求"为空，请主要从"未通关/未看完"列表中推荐。
4.  理由应简短（不超过50字），并说明为什么推荐。
5.  按推荐优先级从高到低排序。
6.  请在推荐中标明类型（游戏或剧集）。

请严格按照以下JSON格式返回，不要包含任何多余的解释、代码块标记或标题。
[
  {"name": "游戏名1", "reason": "推荐理由1...", "type": "游戏"},
  {"name": "游戏名2", "reason": "推荐理由2...", "type": "游戏"},
  {"name": "游戏名3", "reason": "推荐理由3...", "type": "游戏"},
  {"name": "游戏名4", "reason": "推荐理由4...", "type": "游戏"},
  {"name": "剧集名1", "reason": "推荐理由5...", "type": "剧集"}
]` };
};

/**
 * Parse AI response text into recommendations array.
 */
const parseRecommendations = (text) => {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    // Find the first complete JSON array by tracking bracket depth
    const startIdx = cleaned.indexOf('[');
    if (startIdx !== -1) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = startIdx; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (ch === '[') depth++;
            else if (ch === ']') {
                depth--;
                if (depth === 0) {
                    cleaned = cleaned.substring(startIdx, i + 1);
                    break;
                }
            }
        }
    }

    try {
        const recommendations = JSON.parse(cleaned);
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
const callDeepSeekDirectly = async (customPrompt, promptData) => {
    const apiKey = getLocalApiKey();
    if (!apiKey) {
        return { error: '本地API密钥未配置，请在设置中填入DeepSeek API Key。' };
    }

    const { prompt } = promptData;

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
                temperature: 0.3,
                ...(isThinkingMode()
                    ? { thinking: { type: 'enabled', reasoning_effort: 'high' } }
                    : { thinking: { type: 'disabled' } }),
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
const callCloudFunction = async (customPrompt, promptData) => {
    const { passedGames, unpassedGames, passedDramas, unpassedDramas } = promptData;
    const thinking = isThinkingMode();

    try {
        const fn = httpsCallable(functions, 'getAiRecommendations');
        const result = await fn({ passedGames, unpassedGames, passedDramas, unpassedDramas, customPrompt, thinking });
        const data = result.data;

        // Error returned as normal response
        if (data && data.error) {
            return { error: data.error };
        }

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
            msg = `调用AI服务失败 [${error.code || 'unknown'}]: ${error.message}`;
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
    const promptData = buildPrompt(customPrompt);
    const { unpassedGames, unpassedDramas } = promptData;

    if (!unpassedGames && !unpassedDramas && !customPrompt) {
        return { recommendations: [{ name: '太棒了！', reason: '您的待玩/待看清单已经一干二净！', type: '消息' }] };
    }

    // If user explicitly set local mode, use direct API call
    if (isLocalMode()) {
        return await callDeepSeekDirectly(customPrompt, promptData);
    }

    // Otherwise try Cloud Function first
    const cfResult = await callCloudFunction(customPrompt, promptData);
    if (!cfResult.error) return cfResult;

    // Cloud Function failed — try local API key as fallback
    if (getLocalApiKey()) {
        console.log('Cloud Function unavailable, falling back to direct DeepSeek call...');
        return await callDeepSeekDirectly(customPrompt, promptData);
    }

    // Neither works — give helpful error
    return {
        error: `${cfResult.error}\n\n💡 本地调试提示：如果你在本地运行此页面，请在设置中填入DeepSeek API Key以直接调用AI。`
    };
};
