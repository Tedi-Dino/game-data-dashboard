/**
 * Pure parsing helpers for AI recommendation responses.
 *
 * Kept free of Firebase / browser-global imports so it can be unit tested
 * with `node --test` (see tools/tests/recommendations.test.mjs).
 */

/**
 * Parse AI response text into recommendations array.
 *
 * The model output is not guaranteed to be clean JSON: it may be wrapped in
 * markdown fences, prefixed with prose, or followed by trailing commentary.
 * We locate the first balanced JSON array by tracking bracket depth (ignoring
 * brackets inside string literals) before handing it to JSON.parse.
 *
 * @param {string} text Raw model output.
 * @returns {{recommendations: Array<{name: string, reason: string, type: string}>} | {error: string}}
 */
export const parseRecommendations = (text) => {
    // Strip markdown code fences if present
    let cleaned = (text || '').trim();
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
        // Validate: each item must have name, reason, and type
        if (Array.isArray(recommendations) && recommendations.every(r => r.name && r.reason && r.type)) {
            return { recommendations };
        }
        // If type is missing, fill in a default
        if (Array.isArray(recommendations) && recommendations.every(r => r.name && r.reason)) {
            const fixed = recommendations.map(r => ({ type: '游戏', ...r }));
            return { recommendations: fixed };
        }
        throw new Error('Invalid structure');
    } catch (e) {
        console.error('Failed to parse AI response as JSON:', text, e);
        return { error: 'AI返回的格式不正确，无法解析推荐内容。' };
    }
};
