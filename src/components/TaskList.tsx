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
  // Sort: pending by urgency, completed at bottom
  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return b.importance - a.importance;
  });

  const completedCount = tasks.filter(t => t.completed).length;
  const pendingCount = tasks.length - completedCount;

  if (tasks.length === 0) {
    return (
      <div className="neu-inset rounded-2xl text-center py-10">
        <div className="neu-raised mx-auto mb-3 h-10 w-10 rounded-2xl" />
        <p className="text-slate-500 text-sm">还没有任务</p>
        <p className="text-slate-500 text-xs mt-1">在左侧输入任务，AI 会自动分析并归类</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>共 {tasks.length} 个任务</span>
        {pendingCount > 0 && <span className="text-cyan-400 font-medium">{pendingCount} 待办</span>}
        {completedCount > 0 && <span className="text-emerald-400 font-medium">{completedCount} 已完成</span>}
      </div>

      {/* Task rows */}
      <div className="space-y-2.5">
        {sorted.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
            onClick={() => onTaskClick(task)}
            onDelete={() => onTaskDelete(task.id)}
            onToggleComplete={() => onToggleComplete(task.id)}
            onUpdateUrgency={(v) => onUpdateTask(task.id, { urgency: v })}
            onUpdateImportance={(v) => onUpdateTask(task.id, { importance: v })}
          />
        ))}
      </div>
    </div>
  );
}
