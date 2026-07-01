import { useState, useCallback } from 'react';
import type { ImageTaskDraft } from '../types';
import { QUADRANTS } from './QuadrantChart';

function getQuadrant(urgency: number, importance: number): 1 | 2 | 3 | 4 {
  if (urgency >= 5 && importance >= 5) return 1;
  if (urgency < 5 && importance >= 5) return 2;
  if (urgency < 5 && importance < 5) return 3;
  return 4;
}

interface Props {
  drafts: ImageTaskDraft[];
  ocrText?: string;
  onConfirm: (drafts: ImageTaskDraft[]) => void;
  onCancel: () => void;
}

export default function ImageTaskPreview({ drafts: initialDrafts, ocrText, onConfirm, onCancel }: Props) {
  const [drafts, setDrafts] = useState<ImageTaskDraft[]>(initialDrafts);
  const [showOcrText, setShowOcrText] = useState(false);

  const updateDraft = useCallback((index: number, field: keyof ImageTaskDraft, value: string | number) => {
    setDrafts(prev => prev.map((d, i) => {
      if (i !== index) return d;
      if (field === 'urgency' || field === 'importance') {
        const num = Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
        return { ...d, [field]: num };
      }
      return { ...d, [field]: value };
    }));
  }, []);

  const removeDraft = useCallback((index: number) => {
    setDrafts(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleConfirm = () => {
    if (drafts.length === 0) {
      onCancel();
      return;
    }
    onConfirm(drafts);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white">📝 识别结果预览</h3>
            <p className="text-xs text-gray-500 mt-0.5">AI 从图片中识别出 {drafts.length} 个未完成任务，你可以编辑或删除后再确认添加</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {ocrText && (
            <div className="bg-gray-950/70 border border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowOcrText(prev => !prev)}
                className="w-full px-4 py-2.5 text-left text-xs text-gray-400 hover:text-gray-200 flex items-center justify-between"
              >
                <span>查看 OCR 原文，确认图片文字是否识别正确</span>
                <span>{showOcrText ? '收起' : '展开'}</span>
              </button>
              {showOcrText && (
                <pre className="px-4 pb-4 text-xs text-gray-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {ocrText}
                </pre>
              )}
            </div>
          )}
          {drafts.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <div className="text-4xl mb-2">🗑️</div>
              <p className="text-sm">所有任务已被删除</p>
            </div>
          ) : (
            drafts.map((draft, index) => {
              const qid = getQuadrant(draft.urgency, draft.importance);
              const q = QUADRANTS.find(q => q.id === qid)!;
              return (
                <div
                  key={index}
                  className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: q.color }}
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => updateDraft(index, 'title', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="任务名称"
                      />
                      <input
                        type="text"
                        value={draft.description}
                        onChange={(e) => updateDraft(index, 'description', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="任务描述"
                      />
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">紧迫度</span>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={draft.urgency}
                            onChange={(e) => updateDraft(index, 'urgency', e.target.value)}
                            className="w-14 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-200 text-center focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">重要性</span>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={draft.importance}
                            onChange={(e) => updateDraft(index, 'importance', e.target.value)}
                            className="w-14 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-200 text-center focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: q.color + '20', color: q.color }}
                        >
                          {q.name}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeDraft(index)}
                      className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                      title="删除此任务"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                        <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-600 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={drafts.length === 0}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors"
          >
            确认添加 ({drafts.length} 个任务)
          </button>
        </div>
      </div>
    </div>
  );
}
