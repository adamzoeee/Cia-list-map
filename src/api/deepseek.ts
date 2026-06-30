import type { AIAnalysisResult, TaskInput } from '../types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

let apiKey = '';

export function setApiKey(key: string) {
  apiKey = key;
}

export function getApiKey(): string {
  return apiKey || localStorage.getItem('deepseek_api_key') || '';
}

const SYSTEM_PROMPT = `你是一个任务管理专家。用户会描述一个任务，你需要分析并返回一个 JSON 对象。

分析维度：
- urgency（时间紧迫度，0-10分）：deadline 有多近？拖延的后果有多严重？0=完全不急，10=火烧眉毛
- importance（任务重要性，0-10分）：这个任务对目标达成有多关键？0=无关紧要，10=影响深远
- suggestion（建议）：一句话的行动建议（不超过40字）

严格要求：
1. 只返回一个合法的 JSON 对象，不要包含任何其他文字、markdown 标记或代码块
2. JSON 格式：{"title":"精简后的任务名","description":"一句话任务描述","urgency":数字,"importance":数字,"suggestion":"建议"}
3. title 不超过15个字，description 不超过50个字`;

export async function analyzeTask(input: TaskInput): Promise<AIAnalysisResult> {
  const key = getApiKey();
  if (!key) {
    throw new Error('请先设置 DeepSeek API Key');
  }

  const userMessage = `任务名称：${input.title}\n任务描述：${input.description}`;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  
  let parsed: AIAnalysisResult;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      parsed = JSON.parse(match[1].trim());
    } else {
      throw new Error('AI 返回格式异常，请重试');
    }
  }

  // Validate and clamp values
  return {
    title: parsed.title || input.title,
    description: parsed.description || input.description,
    urgency: Math.max(0, Math.min(10, Math.round(parsed.urgency || 5))),
    importance: Math.max(0, Math.min(10, Math.round(parsed.importance || 5))),
    suggestion: parsed.suggestion || '',
  };
}
