import type { Task } from '../types';
import TaskCard from './TaskCard';
import { QUADRANTS } from './QuadrantChart';

interface Props {
  tasks: Task[];
  selectedTaskId: string | null;
  onTaskClick: (task: Task) => void;
  onTaskDelete: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Pick<Task, 'urgency' | 'importance'>>) => void;
}

export default function TaskList({ tasks, selectedTaskId, onTaskClick, onTaskDelete, onToggleComplete, onUpdateTask }: Props) {
  // Group by quadrant, with completed tasks sorted to bottom within each group
  const grouped: Record<number, Task[]> = { 1: [], 2: [], 3: [], 4: [] };
  tasks.forEach(t => grouped[t.quadrant].push(t));
  (Object.keys(grouped) as unknown as number[]).forEach(qid => {
    grouped[qid].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.urgency + b.importance - (a.urgency + a.importance);
    });
  });

  const completedCount = tasks.filter(t => t.completed).length;
  const pendingCount = tasks.length - completedCount;

  if (tasks.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="mx-auto mb-3 h-10 w-10 rounded-2xl border border-slate-800 bg-slate-950/70" />
        <p className="text-slate-500 text-sm">还没有任务</p>
        <p className="text-slate-600 text-xs mt-1">在上方输入任务，AI 会自动分析并归类</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>共 {tasks.length} 个任务</span>
        {pendingCount > 0 && <span className="text-cyan-300">{pendingCount} 待办</span>}
        {completedCount > 0 && <span className="text-emerald-400/80">{completedCount} 已完成</span>}
      </div>

      {QUADRANTS.map((q) => {
        const qtasks = grouped[q.id];
        if (qtasks.length === 0) return null;
        const qCompleted = qtasks.filter(t => t.completed).length;
        return (
          <div key={q.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.color }} />
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: q.color }}>
                {q.name}
              </h3>
              <span className="text-xs text-slate-600">({qtasks.length}{qCompleted > 0 && ` · ${qCompleted} 已完成`})</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {qtasks.map(task => (
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
      })}
    </div>
  );
}
