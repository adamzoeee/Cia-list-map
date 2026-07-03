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

  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-pointer rounded-xl transition-all',
        isSelected
          ? 'neu-selected'
          : 'neu-raised-sm hover:shadow-[6px_6px_14px_rgba(0,0,0,0.45),-3px_-3px_8px_rgba(255,255,255,0.03)]',
        task.completed && 'opacity-50',
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Complete checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
          className={cn(
            'flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all',
            task.completed
              ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.15)]'
              : 'border-white/8 text-transparent shadow-[inset_1px_1px_3px_rgba(0,0,0,0.35)] hover:border-white/15',
          )}
          title={task.completed ? '标记为未完成' : '标记为已完成'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 6 5 9 10 3" />
          </svg>
        </button>

        {/* Color bar */}
        <span
          className="flex-shrink-0 w-1 self-stretch rounded-full"
          style={{ backgroundColor: q.color }}
        />

        {/* Title + description */}
        <div className="min-w-0 flex-1">
          <h4 className={cn(
            'text-sm font-semibold truncate',
            task.completed ? 'text-slate-500 line-through' : 'text-slate-100',
          )}>
            {task.title}
          </h4>
          {task.description && (
            <p className="text-[11px] text-slate-500 truncate leading-relaxed">{task.description}</p>
          )}
        </div>

        {/* Right side: U/I + badge + delete */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[11px] text-slate-500 tabular-nums">
            <span className="text-slate-400">U</span>
            <span className="text-slate-200 font-semibold ml-0.5">{task.urgency}</span>
          </span>
          <span className="text-[11px] text-slate-500 tabular-nums">
            <span className="text-slate-400">I</span>
            <span className="text-slate-200 font-semibold ml-0.5">{task.importance}</span>
          </span>
          <Badge
            className="!border-0 text-[10px] px-2 py-0"
            style={{ backgroundColor: q.color + '20', color: q.color }}
          >
            {q.name}
          </Badge>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex-shrink-0 text-slate-600 opacity-0 transition-all hover:text-red-300 group-hover:opacity-100"
            title="删除"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
              <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable U/I editor */}
      {isSelected && (
        <div className="px-3 pb-3 pt-1 mt-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="grid grid-cols-2 gap-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
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
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.4)' }}
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
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
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.4)' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
