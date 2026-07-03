import { useState } from 'react';
import type { Task } from '../types';
import { QUADRANTS } from './QuadrantChart';
import { Badge, cn } from './ui';

interface Props {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  onUpdateUrgency: (v: number) => void;
  onUpdateImportance: (v: number) => void;
}

export default function TaskCard({
  task,
  isSelected,
  onClick,
  onDelete,
  onToggleComplete,
  onUpdateUrgency,
  onUpdateImportance,
}: Props) {
  const q = QUADRANTS.find(q => q.id === task.quadrant)!;
  const [showEditors, setShowEditors] = useState(false);

  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-pointer rounded-2xl border bg-slate-950/65 p-4 shadow-[0_10px_35px_rgba(2,6,23,0.18)] transition-all hover:-translate-y-0.5',
        isSelected
          ? 'border-cyan-400/70 ring-2 ring-cyan-400/15'
          : 'border-slate-800 hover:border-slate-600',
        task.completed && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Complete checkbox */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
            className={cn(
              'flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
              task.completed
                ? 'bg-emerald-400/20 border-emerald-400/60 text-emerald-300'
                : 'border-slate-600 text-transparent hover:border-slate-400',
            )}
            title={task.completed ? '标记为未完成' : '标记为已完成'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2 6 5 9 10 3" />
            </svg>
          </button>
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: q.color }}
          />
          <h4 className={cn(
            'text-sm font-semibold truncate',
            task.completed ? 'text-slate-500 line-through' : 'text-slate-100',
          )}>
            {task.title}
          </h4>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="ml-2 flex-shrink-0 text-slate-700 opacity-0 transition-all hover:text-red-300 group-hover:opacity-100"
          title="删除"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
            <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
          </svg>
        </button>
      </div>
      {task.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-500">
          U <span className="text-slate-200 font-semibold">{task.urgency}</span>
        </span>
        <span className="text-slate-500">
          I <span className="text-slate-200 font-semibold">{task.importance}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge
          className="border-0"
          style={{ backgroundColor: q.color + '20', color: q.color }}
        >
          {q.name}
        </Badge>
        <span className="text-xs text-slate-500">{q.strategy}</span>
      </div>

      {/* Expandable U/I editor */}
      {isSelected && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">调整紧迫度 / 重要度</span>
            <button
              onClick={(e) => { e.stopPropagation(); setShowEditors(v => !v); }}
              className="text-xs text-cyan-400/80 hover:text-cyan-300 transition-colors"
            >
              {showEditors ? '收起' : '编辑'}
            </button>
          </div>
          {showEditors && (
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">紧迫度</span>
                  <span className="text-cyan-300 font-semibold">{task.urgency}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={task.urgency}
                  onChange={(e) => onUpdateUrgency(Number(e.target.value))}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-cyan-400"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">重要度</span>
                  <span className="text-cyan-300 font-semibold">{task.importance}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={task.importance}
                  onChange={(e) => onUpdateImportance(Number(e.target.value))}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-cyan-400"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
