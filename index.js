// functions/index.js — Firebase Cloud Function
// Calls DeepSeek API for AI game recommendations

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");
const fetch = require("node-fetch");

// Define the DeepSeek API key secret
const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");

// Admin UIDs — must match js/config/constants.js
const ADMIN_UIDS = ["ZPyHfPGUI4elNvRN2Q30ZqfzT6X2"];

exports.getAiRecommendations = onCall({secrets: [deepseekApiKey], timeoutSeconds: 300}, async (request) => {
  // Admin-only access
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "只有管理员才能使用AI推荐功能。");
  }

  const DEEPSEEK_API_KEY = deepseekApiKey.value();
  if (!DEEPSEEK_API_KEY) {
    logger.error("DEEPSEEK_API_KEY secret is not set");
    return { output: { text: "" }, error: "DEEPSEEK_API_KEY 未配置。请在 Firebase 中设置此密钥: firebase functions:secrets:set DEEPSEEK_API_KEY" };
  }

  const { passedGames, unpassedGames, passedDramas, unpassedDramas, customPrompt, thinking } = request.data;

  const prompt = `你是一个资深的影音娱乐推荐助手。请分析一个用户的游戏和剧集数据。

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
]`;

  try {
    logger.info("Calling DeepSeek API, model: deepseek-v4-pro");
    const response = await fetch(
        "https://api.deepseek.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: "deepseek-v4-pro",
            messages: [
              { role: "user", content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.3,
            ...(thinking ? { thinking: { type: "enabled", reasoning_effort: "high" } } : { thinking: { type: "disabled" } }),
          }),
        },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error("DeepSeek API Error:", response.status, JSON.stringify(errorData));
      return { output: { text: "" }, error: `DeepSeek API 返回错误 (${response.status}): ${JSON.stringify(errorData)}` };
    }

    const data = await response.json();

    // DeepSeek response format (OpenAI-compatible):
    // { choices: [{ message: { content: "..." } }] }
    logger.info("DeepSeek raw response keys:", JSON.stringify(Object.keys(data)));
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    let textContent = msg?.content || "";

    if (!textContent && msg) {
      logger.warn("message.content is empty. Full message keys:", JSON.stringify(Object.keys(msg)));
      logger.warn("Full message:", JSON.stringify(msg));
    }

    logger.info("DeepSeek response received, length:", textContent.length);

    return {
      output: {
        text: textContent
      }
    };

  } catch (error) {
    logger.error("Error calling getAiRecommendations:", error.message, error.stack);
    return { output: { text: "" }, error: `Cloud Function 内部错误: ${error.message}` };
  }
});
