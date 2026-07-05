# AI Recommendation Contract

**Single source of truth for the AI recommendation prompt and response format.**

## Overview

The AI recommendation feature uses DeepSeek's chat API (model: `deepseek-v4-pro`) 
to recommend games and dramas based on user data. The prompt and response parsing 
must remain synchronized between the frontend (`js/services/recommendations.js`) 
and the Cloud Function (`functions/index.js`).

## Prompt Template

### Input Fields

The following fields are interpolated into the prompt template:

| Field | Source | Description |
|-------|--------|-------------|
| `passedGames` | items.filter(status===passed, non-hardware, non-drama) | Each line: 《\xae名》 (用户评分: X/10) |
| `unpassedGames` | items.filter(status!==passed, non-hardware, non-drama) | Each line: 《\xae名》 (状态: statusLabel) |
| `passedDramas` | items.filter(status===passed, drama) | Each line: 《\xae名》 (用户评分: X/10, 类型: sort) |
| `unpassedDramas` | items.filter(status!==passed, drama) | Each line: 《\xae名》 (状态: statusLabel) |
| `customPrompt` | User input from modal | Free-text extra requirements |
| `thinking` | Toggle from UI | Boolean: enable reasoning mode |

### Full Prompt Structure

(Stored in both `buildPrompt()` in `recommendations.js` and inline in 
`functions/index.js` `getAiRecommendations`.)

The prompt is a system-style user message containing:

1. Context header: role description
2. Passed games: with user ratings
3. Unpassed games: with status labels
4. Passed dramas: with ratings and sort
5. Unpassed dramas: with status labels
6. Extra requirements: user custom prompt
7. Task instructions
8. Output instruction: strict JSON array only

### API Parameters

| Parameter | Value |
|-----------|-------|
| Model | `deepseek-v4-pro` |
| Max tokens | 2000 |
| Temperature | 0.3 |
| Thinking mode | Optional: high reasoning_effort |

## Output Contract

### Success Response Format (JSON Array)

```json
[
  {"name": "...", "reason": "...", "type": "游戏"},
  {"name": "...", "reason": "...", "type": "游戏"},
  {"name": "...", "reason": "...", "type": "游戏"},
  {"name": "...", "reason": "...", "type": "游戏"},
  {"name": "...", "reason": "...", "type": "剧集"}
]
```

### Required Fields Per Item

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Game or drama title |
| `reason` | string | Recommendation reason <= 50 chars |
| `type` | string | `游戏` or `剧集` |

### Cloud Function Response Structure

```javascript
{
  output: { text: "<raw AI response text>" },
  error: "<error message or empty>"
}
```

### Frontend Fallback Response Structure

```javascript
{
  recommendations: [...],  // parsed array on success
  error: "<error message or undefined>"
}
```

## Error Strategy

| Scenario | Handling |
|----------|----------|
| Markdown code fences | Stripped by `parseRecommendations()` |
| Extra text before/after JSON | Bracket-depth parsing extracts array |
| Missing `type` field | Defaulted to `游戏` |
| Invalid JSON | Returns error message |
| Cloud Function unavailable | Falls back to direct DeepSeek call |
| Aborted request | Returns cancellation message |
| Empty unpassed lists | Returns congratulations message |

## Sync Procedure

When modifying the prompt:

1. Update the prompt in `functions/index.js` (`getAiRecommendations`)
2. Update the prompt in `js/services/recommendations.js` (`buildPrompt()`)
3. Update this contract document to reflect changes
4. Test both paths: Cloud Function and local fallback
