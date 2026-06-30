import { useState } from 'react';
import { setApiKey, getApiKey } from '../api/deepseek';

interface Props {
  onKeySet: () => void;
}

export default function ApiKeyInput({ onKeySet }: Props) {
  const [key, setKey] = useState(getApiKey());
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(!!getApiKey());

  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    localStorage.setItem('deepseek_api_key', trimmed);
    setSaved(true);
    onKeySet();
  };

  const handleClear = () => {
    setApiKey('');
    localStorage.removeItem('deepseek_api_key');
    setKey('');
    setSaved(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">
          🔑 DeepSeek API Key
        </h3>
        {saved && (
          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
            已保存
          </span>
        )}
      </div>
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
        <button
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
        >
          保存
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
    </div>
  );
}
