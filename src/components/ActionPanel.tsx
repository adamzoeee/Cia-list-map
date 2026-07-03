import type { Task } from '../types';
import { QUADRANTS } from './QuadrantChart';
import { Panel, SectionTitle, cn } from './ui';

const MOTIVATIONS = [
  '先把最难的事情做完，剩下的都是奖励。',
  '专注当下，每一个小步都在靠近目标。',
  '行动是焦虑的解药，开始就是最好的时机。',
  '完成比完美更重要，先做出来再优化。',
  '你今天做的每一件事，都是在给未来的自己铺路。',
  '保持节奏，不疾不徐，稳定输出胜过间歇爆发。',
  '最难的部分往往是开始，一旦启动，惯性会带你前进。',
  '把大任务拆成小步骤，每一步都算数。',
];

function getMotivation(): string {
  return MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];
}

function sortActionTasks(tasks: Task[]): Task[] {
  const pending = tasks.filter(t => !t.completed);
  const q1 = pending.filter(t => t.quadrant === 1).sort((a, b) => (b.urgency + b.importance) - (a.urgency + a.importance));
  const q2 = pending.filter(t => t.quadrant === 2).sort((a, b) => b.importance - a.importance);
  const q4 = pending.filter(t => t.quadrant === 4).sort((a, b) => b.urgency - a.urgency);
  const q3 = pending.filter(t => t.quadrant === 3).sort((a, b) => (b.urgency + b.importance) - (a.urgency + a.importance));
  return [...q1, ...q2, ...q4, ...q3];
}

interface Props {
  tasks: Task[];
}

export default function ActionPanel({ tasks }: Props) {
  const actionList = sortActionTasks(tasks);
  const topTasks = actionList.slice(0, 5);
  const motivation = getMotivation();

  return (
    <Panel className="p-4">
      <SectionTitle eyebrow="Action" title="执行建议" />

      {topTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="neu-raised w-12 h-12 rounded-2xl flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <p className="text-sm text-emerald-400 font-medium">所有任务已完成</p>
          <p className="text-xs text-slate-500 mt-1">可以好好休息，或者添加新目标</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topTasks.map((task, idx) => {
            const q = QUADRANTS.find(q => q.id === task.quadrant)!;
            return (
              <div
                key={task.id}
                className="neu-raised flex items-center gap-3 rounded-xl px-3 py-2.5"
              >
                <span
                  className={cn(
                    'neu-raised flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold transition-all',
                    idx === 0
                      ? 'text-cyan-400'
                      : 'text-slate-500',
                  )}
                >
                  {idx + 1}
                </span>
                <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: q.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-300 font-medium leading-snug" style={{ wordBreak: 'break-word' }}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                    <span style={{ color: q.color }}>{q.name}</span>
                    <span>·</span>
                    <span>U{task.urgency} I{task.importance}</span>
                    <span>·</span>
                    <span className="text-slate-500">{q.strategy}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {actionList.length > 5 && (
            <p className="text-center text-[10px] text-slate-500 pt-1">
              还有 {actionList.length - 5} 个待办任务
            </p>
          )}
        </div>
      )}

      {/* Motivation */}
      <div className="mt-4 pt-3">
        <p className="text-xs text-slate-500 italic text-center leading-relaxed">
          "{motivation}"
        </p>
      </div>
    </Panel>
  );
}
