import { useState, useCallback } from 'react';
import type { ImageTaskDraft } from '../types';
import { QUADRANTS } from './QuadrantChart';
import { Badge, Button, Panel, TextInput } from './ui';

function getQuadrant(urgency: number, importance: number): 1 | 2 | 3 | 4 {
  if (urgency >= 0 && importance >= 0) return 1;
  if (urgency < 0 && importance >= 0) return 2;
  if (urgency < 0 && importance < 0) return 3;
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
        const num = Math.max(-5, Math.min(5, Math.round(Number(value) || 0)));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <Panel className="w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-200">识别结果预览</h3>
            <p className="text-xs text-slate-500 mt-0.5">AI 从图片中识别出 {drafts.length} 个未完成任务，你可以编辑或删除后再确认添加</p>
          </div>
          <Button
            onClick={onCancel}
            variant="ghost"
            className="h-8 px-2 text-lg"
          >
            ✕
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {ocrText && (
            <div className="neu-inset rounded-xl overflow-hidden">
              <button
                onClick={() => setShowOcrText(prev => !prev)}
                className="w-full px-4 py-2.5 text-left text-xs text-slate-400 hover:text-slate-200 flex items-center justify-between"
              >
                <span>查看 OCR 原文，确认图片文字是否识别正确</span>
                <span>{showOcrText ? '收起' : '展开'}</span>
              </button>
              {showOcrText && (
                <pre className="px-4 pb-4 text-xs text-slate-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {ocrText}
                </pre>
              )}
            </div>
          )}
          {drafts.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <div className="neu-inset mx-auto mb-3 h-10 w-10 rounded-2xl" />
              <p className="text-sm">所有任务已被删除</p>
            </div>
          ) : (
            drafts.map((draft, index) => {
              const qid = getQuadrant(draft.urgency, draft.importance);
              const q = QUADRANTS.find(q => q.id === qid)!;
              return (
                <div
                  key={index}
                  className="neu-inset rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: q.color }}
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <TextInput
                        type="text"
                        value={draft.title}
                        onChange={(e) => updateDraft(index, 'title', e.target.value)}
                        placeholder="任务名称"
                      />
                      <TextInput
                        type="text"
                        value={draft.description}
                        onChange={(e) => updateDraft(index, 'description', e.target.value)}
                        placeholder="任务描述"
                      />
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">紧迫度</span>
                          <TextInput
                            type="number"
                            min={-5}
                            max={5}
                            value={draft.urgency}
                            onChange={(e) => updateDraft(index, 'urgency', e.target.value)}
                            className="w-14 px-2 py-1 text-center"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">重要性</span>
                          <TextInput
                            type="number"
                            min={-5}
                            max={5}
                            value={draft.importance}
                            onChange={(e) => updateDraft(index, 'importance', e.target.value)}
                            className="w-14 px-2 py-1 text-center"
                          />
                        </div>
                        <Badge
                          tone="neutral"
                          style={{ backgroundColor: q.color + '22', color: q.color }}
                        >
                          {q.name}
                        </Badge>
                      </div>
                    </div>
                    <button
                      onClick={() => removeDraft(index)}
                      className="text-slate-500 hover:text-rose-500 transition-colors flex-shrink-0"
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
        <div className="flex items-center justify-end gap-3 px-5 py-4">
          <Button onClick={onCancel}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={drafts.length === 0}
            variant="primary"
            className="px-5"
          >
            确认添加 ({drafts.length} 个任务)
          </Button>
        </div>
      </Panel>
    </div>
  );
}
