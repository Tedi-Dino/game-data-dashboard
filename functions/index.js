// functions/index.js — Firebase Cloud Function
// Calls DeepSeek API for AI game recommendations

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");
const fetch = require("node-fetch");

// Define the DeepSeek API key secret
const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");

exports.getAiRecommendations = onCall({secrets: [deepseekApiKey], timeoutSeconds: 120}, async (request) => {
  const DEEPSEEK_API_KEY = deepseekApiKey.value();
  if (!DEEPSEEK_API_KEY) {
    logger.error("DEEPSEEK_API_KEY secret is not set");
    return { output: { text: "" }, error: "DEEPSEEK_API_KEY 未配置。请在 Firebase 中设置此密钥: firebase functions:secrets:set DEEPSEEK_API_KEY" };
  }

  const { passedGames, unpassedGames, customPrompt } = request.data;

  const prompt = `你是一个资深游戏玩家和推荐助手。请分析一个玩家的游戏数据。

### 玩家【已通关】的游戏 (包含用户评分 1-10分):
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
            thinking: { type: "disabled" },
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
