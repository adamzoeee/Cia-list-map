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
        'neu-raised group cursor-pointer rounded-2xl transition-all',
        isSelected && 'shadow-[8px_8px_18px_#15171c,-8px_-8px_18px_#272b33]',
        task.completed && 'opacity-40',
      )}
    >
      <div className="flex items-stretch">
        {/* Left color bar */}
        <div
          className="w-1.5 flex-shrink-0 rounded-l-2xl"
          style={{ backgroundColor: task.completed ? '#4a4e56' : q.color }}
        />

        <div className="flex-1 min-w-0 px-4 py-3">
          {/* Top row: title + actions */}
          <div className="flex items-start gap-3">
            {/* Complete checkbox */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
              className={cn(
                'neu-raised flex-shrink-0 mt-0.5 w-6 h-6 rounded-md flex items-center justify-center transition-all ring-1 ring-white/5',
                task.completed && 'neu-pressed ring-emerald-400/30',
              )}
              title={task.completed ? '标记为未完成' : '标记为已完成'}
            >
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                stroke={task.completed ? '#10b981' : 'transparent'}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="2 6 5 9 10 3" />
              </svg>
            </button>

            {/* Title */}
            <h4
              className={cn(
                'flex-1 text-sm font-semibold leading-snug',
                task.completed
                  ? 'text-slate-600 line-through'
                  : 'text-slate-200',
              )}
              style={{ wordBreak: 'break-word' }}
            >
              {task.title}
            </h4>

            {/* Actions: badge + urgency/importance + delete */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                tone="neutral"
                style={{
                  backgroundColor: (task.completed ? '#4a4e56' : q.color) + '22',
                  color: task.completed ? '#4a4e56' : q.color,
                }}
              >
                {q.name}
              </Badge>

              <span className="text-xs text-slate-500 whitespace-nowrap">
                U{task.urgency} I{task.importance}
              </span>

              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="neu-raised flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 opacity-0 group-hover:opacity-100 transition-all hover:text-rose-400 active:neu-pressed"
                title="删除"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                  <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-1 ml-8">
              {task.description}
            </p>
          )}

          {/* Expandable U/I editor */}
          {isSelected && !task.completed && (
            <div className="mt-3 ml-8 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">调整紧迫度 / 重要度</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowEditors(v => !v); }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                >
                  {showEditors ? '收起' : '编辑'}
                </button>
              </div>
              {showEditors && (
                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">紧迫度</span>
                      <span className="text-cyan-400 font-semibold">{task.urgency}</span>
                    </div>
                    <input
                      type="range"
                      min={-5}
                      max={5}
                      step={1}
                      value={task.urgency}
                      onChange={(e) => onUpdateUrgency(Number(e.target.value))}
                      className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[#2a2d33] accent-cyan-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">重要度</span>
                      <span className="text-cyan-400 font-semibold">{task.importance}</span>
                    </div>
                    <input
                      type="range"
                      min={-5}
                      max={5}
                      step={1}
                      value={task.importance}
                      onChange={(e) => onUpdateImportance(Number(e.target.value))}
                      className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[#2a2d33] accent-cyan-400"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
