import type { Task } from '../types';
import { QUADRANTS } from './QuadrantChart';

interface Props {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export default function TaskCard({ task, isSelected, onClick, onDelete }: Props) {
  const q = QUADRANTS.find(q => q.id === task.quadrant)!;

  return (
    <div
      onClick={onClick}
      className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/10'
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: q.color }}
          />
          <h4 className="text-sm font-semibold text-gray-200 truncate">{task.title}</h4>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
          title="删除"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
            <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
          </svg>
        </button>
      </div>
      {task.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-gray-400">
          紧迫度 <span className="text-gray-200 font-semibold">{task.urgency}</span>
        </span>
        <span className="text-gray-400">
          重要性 <span className="text-gray-200 font-semibold">{task.importance}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: q.color + '20', color: q.color }}
        >
          {q.name}
        </span>
        <span className="text-xs text-gray-500">{q.strategy}</span>
      </div>
    </div>
  );
}
