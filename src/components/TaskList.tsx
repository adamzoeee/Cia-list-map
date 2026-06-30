import type { Task } from '../types';
import TaskCard from './TaskCard';
import { QUADRANTS } from './QuadrantChart';

interface Props {
  tasks: Task[];
  selectedTaskId: string | null;
  onTaskClick: (task: Task) => void;
  onTaskDelete: (id: string) => void;
}

export default function TaskList({ tasks, selectedTaskId, onTaskClick, onTaskDelete }: Props) {
  // Group by quadrant
  const grouped: Record<number, Task[]> = { 1: [], 2: [], 3: [], 4: [] };
  tasks.forEach(t => grouped[t.quadrant].push(t));

  if (tasks.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-gray-500 text-sm">还没有任务</p>
        <p className="text-gray-600 text-xs mt-1">在上方输入任务，AI 会自动分析并归类</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {QUADRANTS.map((q) => {
        const qtasks = grouped[q.id];
        if (qtasks.length === 0) return null;
        return (
          <div key={q.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.color }} />
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: q.color }}>
                {q.name}
              </h3>
              <span className="text-xs text-gray-600">({qtasks.length})</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {qtasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isSelected={task.id === selectedTaskId}
                  onClick={() => onTaskClick(task)}
                  onDelete={() => onTaskDelete(task.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
