/**
 * A3: unit tests for AI recommendation parsing.
 *
 * These import the REAL production module (js/services/recommendation-parse.js)
 * so a regression in parsing logic actually fails the suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecommendations } from '../../js/services/recommendation-parse.js';

test('parseRecommendations: parses a plain JSON array', () => {
    const text = '[{"name":"A","reason":"r1","type":"游戏"},{"name":"B","reason":"r2","type":"剧集"}]';
    const result = parseRecommendations(text);
    assert.equal(result.error, undefined);
    assert.equal(result.recommendations.length, 2);
    assert.equal(result.recommendations[1].type, '剧集');
});

test('parseRecommendations: strips markdown code fences', () => {
    const text = '```json\n[{"name":"A","reason":"r1","type":"游戏"}]\n```';
    const result = parseRecommendations(text);
    assert.equal(result.error, undefined);
    assert.equal(result.recommendations[0].name, 'A');
});

test('parseRecommendations: tolerates prose before and after the array', () => {
    const text = '好的，以下是推荐：\n[{"name":"A","reason":"r1","type":"游戏"}]\n希望对你有帮助！';
    const result = parseRecommendations(text);
    assert.equal(result.error, undefined);
    assert.equal(result.recommendations.length, 1);
});

test('parseRecommendations: ignores brackets inside string literals', () => {
    // The "]" inside the reason string must not terminate the array early.
    const text = '[{"name":"A","reason":"见 [附录] ] 说明","type":"游戏"}]';
    const result = parseRecommendations(text);
    assert.equal(result.error, undefined);
    assert.equal(result.recommendations[0].reason, '见 [附录] ] 说明');
});

test('parseRecommendations: handles escaped quotes in strings', () => {
    const text = '[{"name":"A","reason":"他说\\"好玩\\"","type":"游戏"}]';
    const result = parseRecommendations(text);
    assert.equal(result.error, undefined);
    assert.equal(result.recommendations[0].reason, '他说"好玩"');
});

test('parseRecommendations: defaults missing type to 游戏', () => {
    const text = '[{"name":"A","reason":"r1"}]';
    const result = parseRecommendations(text);
    assert.equal(result.error, undefined);
    assert.equal(result.recommendations[0].type, '游戏');
});

test('parseRecommendations: returns error for non-JSON text', () => {
    const result = parseRecommendations('抱歉，我无法生成推荐。');
    assert.ok(result.error);
    assert.equal(result.recommendations, undefined);
});

test('parseRecommendations: returns error when required fields are missing', () => {
    // reason is missing -> neither validation branch passes
    const result = parseRecommendations('[{"name":"A","type":"游戏"}]');
    assert.ok(result.error);
});

test('parseRecommendations: returns error for empty / null input', () => {
    assert.ok(parseRecommendations('').error);
    assert.ok(parseRecommendations(null).error);
    assert.ok(parseRecommendations(undefined).error);
});
