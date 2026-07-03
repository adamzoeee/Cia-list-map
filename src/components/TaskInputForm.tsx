import { useState, useRef, useCallback, useEffect } from 'react';
import type { TaskInput } from '../types';
import { Button, Panel, TextArea, TextInput, cn } from './ui';

interface Props {
  onSubmit: (input: TaskInput) => void;
  onImageSubmit: (base64: string) => void;
  loading: boolean;
  loadingMessage?: string;
}

function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth || h > maxWidth) {
        if (w > h) {
          h = Math.round(h * (maxWidth / w));
          w = maxWidth;
        } else {
          w = Math.round(w * (maxWidth / h));
          h = maxWidth;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas 不支持'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TaskInputForm({ onSubmit, onImageSubmit, loading, loadingMessage }: Props) {
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件（jpg / png / gif）');
      return;
    }
    try {
      const originalUrl = URL.createObjectURL(file);
      setPreviewUrl(originalUrl);
      const base64 = await compressImage(file);
      setCompressedBase64(base64);
    } catch {
      alert('图片处理失败，请重试');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (mode !== 'image') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
          break;
        }
      }
    }
  }, [mode, handleFile]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onSubmit({ title: t, description: description.trim() });
    setTitle('');
    setDescription('');
  };

  const handleSubmitImage = () => {
    if (!compressedBase64) return;
    onImageSubmit(compressedBase64);
  };

  const handleClearImage = () => {
    setPreviewUrl(null);
    setCompressedBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Panel className="p-4">
      {/* Mode tabs */}
      <div className="mb-3 flex gap-1 rounded-xl p-1 neu-inset">
        <button
          onClick={() => setMode('text')}
          className={cn(
            'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
            mode === 'text'
              ? 'neu-raised text-cyan-300'
              : 'text-slate-500 hover:text-slate-300',
          )}
        >
          文字输入
        </button>
        <button
          onClick={() => setMode('image')}
          className={cn(
            'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
            mode === 'image'
              ? 'neu-raised text-cyan-300'
              : 'text-slate-500 hover:text-slate-300',
          )}
          title="上传截图或手写任务单，本地 OCR 后交给当前 API 分类"
        >
          图片识别
        </button>
      </div>
      <div className="min-h-[195px] min-w-0 w-full">
      {mode === 'text' ? (
        <form onSubmit={handleSubmitText}>
          <TextInput
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="任务名称（例如：完成季度报告）"
            className="mb-2"
            disabled={loading}
          />
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="补充描述（可选，例如：需要收集各部门数据，下周五前提交）"
            rows={2}
            className="mb-3"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || !title.trim()}
            variant="primary"
            className="w-full py-2.5"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {loadingMessage || 'AI 分析中...'}
              </>
            ) : (
              <>AI 分析并添加</>
            )}
          </Button>
        </form>
      ) : (
        <div className="w-full">
          {!previewUrl ? (
            <div
              onDrop={loading ? undefined : handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={loading ? undefined : () => fileInputRef.current?.click()}
              className={cn(
                'neu-inset rounded-2xl p-6 text-center transition-all',
                loading
                  ? 'cursor-not-allowed'
                  : dragOver
                    ? 'cursor-pointer shadow-[inset_6px_6px_14px_#15171c,inset_-6px_-6px_14px_#272b33]'
                    : 'cursor-pointer hover:shadow-[inset_5px_5px_12px_#15171c,inset_-5px_-5px_12px_#272b33]',
              )}
            >
              {loading ? (
                <>
                  <div className="flex justify-center mb-2">
                    <svg className="animate-spin h-6 w-6 text-cyan-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <p className="text-sm text-cyan-300 mb-1">{loadingMessage || 'AI 分析中...'}</p>
                </>
              ) : (
                <>
                  <div className="mb-2 text-2xl text-slate-500">▧</div>
                  <p className="text-sm text-slate-400 mb-1">点击上传或拖拽图片到此处</p>
                  <p className="text-xs text-slate-500">支持 jpg、png、gif，也支持直接 Ctrl+V 粘贴截图</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={loading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="neu-inset relative rounded-xl overflow-hidden">
                <img src={previewUrl} alt="预览" className="w-full max-h-64 object-contain" />
                <button
                  onClick={handleClearImage}
                  className="absolute top-2 right-2 w-7 h-7 neu-raised rounded-full flex items-center justify-center text-slate-500 hover:text-rose-400 transition-colors text-xs"
                >
                  ✕
                </button>
              </div>
              <Button
                onClick={handleSubmitImage}
                disabled={loading || !compressedBase64}
                variant="primary"
                className="w-full py-2.5"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {loadingMessage || 'OCR 与 AI 分析中...'}
                  </>
                ) : (
                  <>OCR 识别并分析</>
                )}
              </Button>
              {loading && loadingMessage && (
                <p className="text-xs text-slate-500 text-center">{loadingMessage}</p>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </Panel>
  );
}
