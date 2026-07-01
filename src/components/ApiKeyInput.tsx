import { useMemo, useState } from 'react';
import {
  setApiKey,
  getApiKey,
  setModel,
  getModel,
  setBaseUrl,
  getBaseUrl,
  PLATFORM_PRESETS,
  MODEL_SUGGESTIONS,
  testApiConnection,
} from '../api/deepseek';

interface Props {
  onKeySet: () => void;
}

export default function ApiKeyInput({ onKeySet }: Props) {
  const [key, setKey] = useState(getApiKey());
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(!!getApiKey());
  const [baseUrl, setBaseUrlState] = useState(getBaseUrl());
  const [model, setModelState] = useState(getModel());
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  const currentPreset = useMemo(() => {
    return PLATFORM_PRESETS.find(platform => baseUrl.startsWith(platform.baseUrl)) || null;
  }, [baseUrl]);

  const modelSuggestions = useMemo(() => {
    if (currentPreset) return currentPreset.models;
    return MODEL_SUGGESTIONS;
  }, [currentPreset]);

  const handleSave = () => {
    const trimmedKey = key.trim();
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedModel = model.trim();
    if (!trimmedKey || !trimmedBaseUrl || !trimmedModel) return;
    setApiKey(trimmedKey);
    setBaseUrl(trimmedBaseUrl);
    setModel(trimmedModel);
    localStorage.setItem('deepseek_api_key', trimmedKey);
    localStorage.setItem('openai_base_url', trimmedBaseUrl);
    localStorage.setItem('deepseek_model', trimmedModel);
    setSaved(true);
    setTestMessage(null);
    onKeySet();
  };

  const handleClear = () => {
    setApiKey('');
    setBaseUrl('https://api.deepseek.com');
    setModel('deepseek-chat');
    localStorage.removeItem('deepseek_api_key');
    localStorage.removeItem('openai_base_url');
    localStorage.removeItem('deepseek_base_url');
    localStorage.removeItem('deepseek_model');
    setKey('');
    setBaseUrlState('https://api.deepseek.com');
    setModelState('deepseek-chat');
    setSaved(false);
    setTestMessage(null);
    setTestOk(false);
  };

  const applyPreset = (preset: typeof PLATFORM_PRESETS[number]) => {
    setBaseUrlState(preset.baseUrl);
    setModelState(preset.models[0] || 'deepseek-chat');
    setSaved(false);
    setTestMessage(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMessage(null);
    setTestOk(false);
    try {
      await testApiConnection({
        apiKey: key,
        baseUrl,
        model,
      });
      setTestOk(true);
      setTestMessage('连接测试成功，当前配置可用');
    } catch (err) {
      setTestOk(false);
      setTestMessage(err instanceof Error ? err.message : '连接测试失败，请检查配置');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">
          🔑 兼容 API 设置
        </h3>
        {saved && (
          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
            已保存
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => { setKey(e.target.value); setSaved(false); }}
            placeholder="sk-xxxxxxxxxxxxxxxx"
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={() => setShow(!show)}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-600 rounded-lg"
            title={show ? '隐藏' : '显示'}
          >
            {show ? '🙈' : '👁'}
          </button>
        </div>

        <div>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => { setBaseUrlState(e.target.value); setSaved(false); }}
            placeholder="Base URL，例如 https://api.deepseek.com"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {PLATFORM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                currentPreset?.id === preset.id
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            list="model-suggestions"
            type="text"
            value={model}
            onChange={(e) => { setModelState(e.target.value); setSaved(false); }}
            placeholder="模型名称，例如 deepseek-chat"
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <datalist id="model-suggestions">
            {modelSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
          >
            保存
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !key.trim() || !baseUrl.trim() || !model.trim()}
            className="px-4 py-2 text-sm font-medium text-gray-200 bg-gray-800 border border-gray-600 hover:border-indigo-500 disabled:text-gray-600 disabled:border-gray-700 rounded-lg transition-colors"
          >
            {testing ? '测试中...' : '测试'}
          </button>
          {saved && (
            <button
              onClick={handleClear}
              className="px-3 py-2 text-sm text-red-400 hover:text-red-300 bg-gray-800 border border-gray-600 rounded-lg"
            >
              清除
            </button>
          )}
        </div>

        <p className="text-xs text-gray-600">
          图片会先在本地 OCR，再把识别文本发送到当前兼容接口做任务分类；接口不需要支持图片输入。
        </p>
        {testMessage && (
          <p className={`text-xs ${testOk ? 'text-green-400' : 'text-red-400'}`}>
            {testMessage}
          </p>
        )}
      </div>
    </div>
  );
}
