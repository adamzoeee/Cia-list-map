import type { AIAnalysisResult, ImageTaskDraft, TaskInput } from '../types';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

let apiKey = '';
let currentModel = '';
let currentBaseUrl = '';

export const PLATFORM_PRESETS = [
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
  },
  {
    id: 'aliyun',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['deepseek-v3', 'deepseek-r1', 'qwen-plus'],
  },
  {
    id: 'volcengine',
    name: '火山引擎 Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['deepseek-v3-241226', 'deepseek-r1-250120'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['deepseek/deepseek-chat', 'openai/gpt-4o-mini'],
  },
] as const;

export const MODEL_SUGGESTIONS = Array.from(
  new Set(PLATFORM_PRESETS.flatMap(platform => platform.models)),
);

export function setApiKey(key: string) {
  apiKey = key;
}

export function getApiKey(): string {
  return apiKey || localStorage.getItem('deepseek_api_key') || '';
}

export function setModel(model: string) {
  currentModel = model;
}

export function getModel(): string {
  return currentModel || localStorage.getItem('deepseek_model') || DEFAULT_MODEL;
}

export function setBaseUrl(url: string) {
  currentBaseUrl = normalizeBaseUrl(url);
}

export function getBaseUrl(): string {
  return normalizeBaseUrl(
    currentBaseUrl ||
    localStorage.getItem('openai_base_url') ||
    localStorage.getItem('deepseek_base_url') ||
    DEFAULT_BASE_URL,
  );
}

export function getCurrentPlatformPreset() {
  const baseUrl = getBaseUrl();
  return PLATFORM_PRESETS.find(platform => baseUrl.startsWith(platform.baseUrl)) || null;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = (url || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_BASE_URL;
}

function buildChatCompletionsUrl(baseUrl = getBaseUrl()): string {
  if (baseUrl.endsWith('/chat/completions')) return baseUrl;
  return `${baseUrl}/chat/completions`;
}

function getReadableApiError(status: number, message?: string): string {
  const detail = message ? `：${message}` : '';
  if (status === 400) return `请求格式不兼容，请检查模型是否支持 Chat Completions 格式${detail}`;
  if (status === 401 || status === 403) return `认证失败，请检查 API Key 是否正确${detail}`;
  if (status === 404) return `接口地址或模型名可能不正确，请检查 Base URL 和 model${detail}`;
  if (status === 429) return `请求过快、额度不足或触发限流，请稍后重试${detail}`;
  if (status >= 500) return `服务商暂时不可用，请稍后重试${detail}`;
  return `API 请求失败: ${status}${detail}`;
}

function parseJsonFromContent<T>(content: string): T {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1].trim());

    const arrayStart = content.indexOf('[');
    const arrayEnd = content.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(content.slice(arrayStart, arrayEnd + 1));
    }

    const objectStart = content.indexOf('{');
    const objectEnd = content.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(content.slice(objectStart, objectEnd + 1));
    }

    throw new Error('AI 返回格式异常，请重试');
  }
}

const SYSTEM_PROMPT = `你是一个任务管理专家。用户会描述一个任务，你需要分析并返回一个 JSON 对象。

分析维度：
- urgency（时间紧迫度，-5到5分）：-5=完全不急/可以无限拖延，0=正常，5=火烧眉毛/今天必须完成
- importance（任务重要性，-5到5分）：-5=毫无价值/纯娱乐消遣，0=一般，5=对人生目标至关重要
- suggestion（建议）：一句话的行动建议（不超过40字）

重要：不要把日常娱乐、休闲活动评成正分，那些应该放在负数区域。只有真正紧急或重要的任务才给正分。

严格要求：
1. 只返回一个合法的 JSON 对象，不要包含任何其他文字、markdown 标记或代码块
2. JSON 格式：{"title":"精简后的任务名","description":"一句话任务描述","urgency":数字,"importance":数字,"suggestion":"建议"}
3. title 不超过15个字，description 不超过50个字`;

const OCR_TEXT_SYSTEM_PROMPT = `你是一个任务管理专家。用户会提供一段 OCR 识别出来的任务清单文本，文本可能来自截图、待办列表或手写任务单。

请从 OCR 文本中拆分出所有独立的未完成任务，然后：
1. 跳过已完成的条目：如果某个条目旁边有勾选标记（✓、☑、✅、[x]、√）、删除线语义、或标注了"已完成""完成""Done"等字样，请不要包含它
2. 忽略明显不是任务的文字，例如导航栏、按钮、页眉页脚、时间戳、水印、无意义乱码
3. 对每个未完成任务，分析并返回一个 JSON 对象

分析维度：
- title（精简后的任务名，不超过15个字）
- description（一句话描述，不超过50个字）
- urgency（时间紧迫度，-5到5分）：-5=完全不急/可以无限拖延，0=正常，5=火烧眉毛/今天必须完成
- importance（任务重要性，-5到5分）：-5=毫无价值/纯娱乐消遣，0=一般，5=对人生目标至关重要

重要：不要把日常娱乐、休闲活动评成正分，那些应该放在负数区域。只有真正紧急或重要的任务才给正分。

严格要求：
1. 只返回一个合法的 JSON 数组，不要包含任何其他文字、markdown 标记或代码块
2. JSON 格式：[{"title":"任务名","description":"描述","urgency":数字,"importance":数字}, ...]
3. 如果文本中没有可识别的未完成任务，返回空数组 []
4. 确保数组中的每个元素都包含 title、description、urgency、importance 四个字段`;

export async function analyzeTask(input: TaskInput): Promise<AIAnalysisResult> {
  const key = getApiKey();
  if (!key) {
    throw new Error('请先设置 API Key');
  }

  const model = getModel();
  const userMessage = `任务名称：${input.title}\n任务描述：${input.description}`;

  const response = await fetch(buildChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(getReadableApiError(response.status, (err as { error?: { message?: string } }).error?.message));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  const parsed = parseJsonFromContent<AIAnalysisResult>(content);

  return {
    title: parsed.title || input.title,
    description: parsed.description || input.description,
    urgency: Math.max(-5, Math.min(5, Math.round(parsed.urgency ?? 0))),
    importance: Math.max(-5, Math.min(5, Math.round(parsed.importance ?? 0))),
    suggestion: parsed.suggestion || '',
  };
}

export async function analyzeOcrText(ocrText: string): Promise<ImageTaskDraft[]> {
  const key = getApiKey();
  if (!key) {
    throw new Error('请先设置 API Key');
  }

  const model = getModel();
  const text = ocrText.trim();
  if (!text) {
    throw new Error('OCR 未识别出文字，请换一张更清晰的图片');
  }

  const response = await fetch(buildChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: OCR_TEXT_SYSTEM_PROMPT },
        { role: 'user', content: `OCR 识别文本：\n${text}` },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(getReadableApiError(response.status, (err as { error?: { message?: string } }).error?.message));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '[]';

  const parsed = parseJsonFromContent<{ tasks?: ImageTaskDraft[] } | ImageTaskDraft[]>(content);

  const tasks = Array.isArray(parsed) ? parsed : parsed?.tasks || [];

  return tasks.map((t: ImageTaskDraft) => ({
    title: t.title || '未命名任务',
    description: t.description || '',
    urgency: Math.max(-5, Math.min(5, Math.round(t.urgency ?? 0))),
    importance: Math.max(-5, Math.min(5, Math.round(t.importance ?? 0))),
  }));
}

export async function testApiConnection(config: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<void> {
  const key = config.apiKey.trim();
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const model = config.model.trim();

  if (!key || !baseUrl || !model) {
    throw new Error('请先填写 API Key、Base URL 和模型名称');
  }

  const response = await fetch(buildChatCompletionsUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: '请只回复 OK' },
      ],
      temperature: 0,
      max_tokens: 10,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(getReadableApiError(response.status, (err as { error?: { message?: string } }).error?.message));
  }
}
