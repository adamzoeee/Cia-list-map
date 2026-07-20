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
import { Badge, Button, Panel, TextInput } from './ui';

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
    <Panel className="mb-6 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-200">
          兼容 API 设置
        </h3>
        {saved && (
          <Badge tone="success">
            已保存
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <TextInput
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => { setKey(e.target.value); setSaved(false); }}
            placeholder="sk-xxxxxxxxxxxxxxxx"
            className="flex-1"
          />
          <Button
            onClick={() => setShow(!show)}
            variant="ghost"
            className="px-3"
            title={show ? '隐藏' : '显示'}
          >
            {show ? '🙈' : '👁'}
          </Button>
        </div>

        <div>
          <TextInput
            type="text"
            value={baseUrl}
            onChange={(e) => { setBaseUrlState(e.target.value); setSaved(false); }}
            placeholder="Base URL，例如 https://api.deepseek.com"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {PLATFORM_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              variant={currentPreset?.id === preset.id ? 'primary' : 'secondary'}
              className={`px-2.5 py-1 text-xs ${
                currentPreset?.id === preset.id
                  ? ''
                  : 'text-slate-400'
              }`}
            >
              {preset.name}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <TextInput
            list="model-suggestions"
            type="text"
            value={model}
            onChange={(e) => { setModelState(e.target.value); setSaved(false); }}
            placeholder="模型名称，例如 deepseek-chat"
            className="flex-1"
          />
          <datalist id="model-suggestions">
            {modelSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button
            onClick={handleSave}
            variant="primary"
          >
            保存
          </Button>
          <Button
            onClick={handleTest}
            disabled={testing || !key.trim() || !baseUrl.trim() || !model.trim()}
          >
            {testing ? '测试中...' : '测试'}
          </Button>
          {saved && (
            <Button
              onClick={handleClear}
              variant="danger"
            >
              清除
            </Button>
          )}
        </div>

        <p className="text-xs text-slate-500">
          图片会先在本地 OCR，再把识别文本发送到当前兼容接口做任务分类；接口不需要支持图片输入。
        </p>
        {testMessage && (
          <p className={`text-xs ${testOk ? 'text-green-400' : 'text-red-400'}`}>
            {testMessage}
          </p>
        )}
      </div>
    </Panel>
  );
}
