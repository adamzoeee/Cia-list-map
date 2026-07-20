import type { Task } from '../types';
import TaskCard from './TaskCard';

interface Props {
  tasks: Task[];
  selectedTaskId: string | null;
  onTaskClick: (task: Task) => void;
  onTaskDelete: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Pick<Task, 'urgency' | 'importance'>>) => void;
}

export default function TaskList({ tasks, selectedTaskId, onTaskClick, onTaskDelete, onToggleComplete, onUpdateTask }: Props) {
  // Flat sort: pending by U+I desc, completed at bottom
  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (b.urgency + b.importance) - (a.urgency + a.importance);
  });

  const completedCount = tasks.filter(t => t.completed).length;
  const pendingCount = tasks.length - completedCount;

  if (tasks.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="neu-inset mx-auto mb-3 h-10 w-10 rounded-2xl" />
        <p className="text-slate-500 text-sm">还没有任务</p>
        <p className="text-slate-600 text-xs mt-1">在上方输入任务，AI 会自动分析并归类</p>
      </div>
    );
  }

  // Detect if there's a transition point where pending→completed
  const firstCompletedIdx = sorted.findIndex(t => t.completed);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>共 {tasks.length} 个任务</span>
        {pendingCount > 0 && <span className="text-cyan-300">{pendingCount} 待办</span>}
        {completedCount > 0 && <span className="text-emerald-400/80">{completedCount} 已完成</span>}
      </div>

      {/* Flat card list */}
      <div className="flex flex-col gap-1.5">
        {sorted.map((task, idx) => (
          <div key={task.id}>
            {/* Groove divider before completed section */}
            {firstCompletedIdx !== -1 && idx === firstCompletedIdx && (
              <div className="flex items-center gap-2 py-2">
                <span className="flex-1 neu-divider" />
                <span className="text-[10px] text-slate-600 font-medium tracking-wider">已完成</span>
                <span className="flex-1 neu-divider" />
              </div>
            )}
            <TaskCard
              task={task}
              isSelected={task.id === selectedTaskId}
              onClick={() => onTaskClick(task)}
              onDelete={() => onTaskDelete(task.id)}
              onToggleComplete={() => onToggleComplete(task.id)}
              onUpdateUrgency={(v) => onUpdateTask(task.id, { urgency: v })}
              onUpdateImportance={(v) => onUpdateTask(task.id, { importance: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
