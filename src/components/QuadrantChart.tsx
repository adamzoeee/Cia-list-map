import { useRef, useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Task, QuadrantInfo } from '../types';

const QUADRANTS: QuadrantInfo[] = [
  {
    id: 2,
    name: '重要不紧急',
    strategy: '计划去做',
    color: '#f6b73c',
    bgColor: 'rgba(246,183,60,0.07)',
    borderColor: 'rgba(246,183,60,0.18)',
  },
  {
    id: 1,
    name: '重要且紧急',
    strategy: '立即去做',
    color: '#fb7185',
    bgColor: 'rgba(251,113,133,0.07)',
    borderColor: 'rgba(251,113,133,0.18)',
  },
  {
    id: 3,
    name: '不重要不紧急',
    strategy: '减少或消除',
    color: '#94a3b8',
    bgColor: 'rgba(148,163,184,0.055)',
    borderColor: 'rgba(148,163,184,0.16)',
  },
  {
    id: 4,
    name: '紧急不重要',
    strategy: '委派或压缩',
    color: '#38bdf8',
    bgColor: 'rgba(56,189,248,0.07)',
    borderColor: 'rgba(56,189,248,0.18)',
  },
];

function getTimeHint(task: Task): string | null {
  const text = `${task.title} ${task.description}`;
  const patterns = [
    '今天', '今日', '今晚',
    '明天', '明日',
    '后天',
    '本周', '这周', '周一', '周二', '周三', '周四', '周五', '周六', '周日',
    '下周', '月底', '月末',
    'DDL', 'deadline', 'Deadline',
  ];
  return patterns.find(pattern => text.includes(pattern)) || null;
}

function shortText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  selectedTaskId: string | null;
}

export default function QuadrantChart({ tasks, onTaskClick, selectedTaskId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 500, height: 500 });

  const measure = useCallback(() => {
    if (containerRef.current) {
      const w = containerRef.current.clientWidth;
      const size = w;
      setDims({ width: size, height: size });
    }
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const { width, height } = dims;
  const margin = 40;
  const plotW = width - margin * 2;
  const plotH = height - margin * 2;

  const toX = (urgency: number) => margin + ((urgency + 5) / 10) * plotW;
  const toY = (importance: number) => margin + plotH - ((importance + 5) / 10) * plotH;

  // Axis ticks
  const xTicks = [-5, -3, -1, 0, 1, 3, 5];
  const yTicks = [-5, -3, -1, 0, 1, 3, 5];

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="select-none"
      >
        {/* Quadrant backgrounds */}
        <rect x={margin} y={margin} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[2].bgColor} />
        <rect x={margin + plotW / 2} y={margin} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[3].bgColor} />
        <rect x={margin} y={margin + plotH / 2} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[0].bgColor} />
        <rect x={margin + plotW / 2} y={margin + plotH / 2} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[1].bgColor} />

        {/* Quadrant dividing lines */}
        <line x1={margin + plotW / 2} y1={margin} x2={margin + plotW / 2} y2={margin + plotH}
          stroke="#374151" strokeWidth={1.5} strokeDasharray="6,3" />
        <line x1={margin} y1={margin + plotH / 2} x2={margin + plotW} y2={margin + plotH / 2}
          stroke="#374151" strokeWidth={1.5} strokeDasharray="6,3" />

        {/* Quadrant labels */}
        {QUADRANTS.map((q) => {
          let qx: number, qy: number;
          if (q.id === 2) { qx = margin + plotW * 0.25; qy = margin + plotH * 0.25; }
          else if (q.id === 1) { qx = margin + plotW * 0.75; qy = margin + plotH * 0.25; }
          else if (q.id === 3) { qx = margin + plotW * 0.25; qy = margin + plotH * 0.75; }
          else { qx = margin + plotW * 0.75; qy = margin + plotH * 0.75; }

          const count = tasks.filter(t => t.quadrant === q.id).length;
          return (
            <g key={q.id}>
              <text x={qx} y={qy - 6} textAnchor="middle" fill={q.color} fontSize={11} fontWeight={600} opacity={0.7}>
                {q.name}
              </text>
              <text x={qx} y={qy + 12} textAnchor="middle" fill="#9ca3af" fontSize={10} opacity={0.6}>
                {q.strategy} {count > 0 && `(${count})`}
              </text>
            </g>
          );
        })}

        {/* X axis */}
        <line x1={margin} y1={margin + plotH} x2={margin + plotW} y2={margin + plotH} stroke="#4b5563" strokeWidth={1} />
        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line x1={toX(t)} y1={margin + plotH} x2={toX(t)} y2={margin + plotH + 5} stroke="#4b5563" strokeWidth={1} />
            <text x={toX(t)} y={margin + plotH + 18} textAnchor="middle" fill="#6b7280" fontSize={10}>
              {t}
            </text>
          </g>
        ))}
        <text x={margin + plotW / 2} y={margin + plotH + 35} textAnchor="middle" fill="#9ca3af" fontSize={11} fontWeight={600}>
          时间紧迫度 →
        </text>

        {/* Y axis */}
        <line x1={margin} y1={margin} x2={margin} y2={margin + plotH} stroke="#4b5563" strokeWidth={1} />
        {yTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line x1={margin - 5} y1={toY(t)} x2={margin} y2={toY(t)} stroke="#4b5563" strokeWidth={1} />
            <text x={margin - 8} y={toY(t) + 4} textAnchor="end" fill="#6b7280" fontSize={10}>
              {t}
            </text>
          </g>
        ))}
        <text x={14} y={margin + plotH / 2} textAnchor="middle" fill="#9ca3af" fontSize={11} fontWeight={600}
          transform={`rotate(-90, 14, ${margin + plotH / 2})`}>
          任务重要性 →
        </text>

        {/* Task cards */}
        <AnimatePresence>
          {tasks.map((task) => {
          const cx = toX(task.urgency);
          const cy = toY(task.importance);
          const isSelected = task.id === selectedTaskId;
          const qColor = QUADRANTS.find(q => q.id === task.quadrant)?.color || '#6b7280';
          const cardW = tasks.length > 14 ? 88 : 108;
          const cardH = tasks.length > 14 ? 36 : 42;
          const cardX = Math.max(margin + 4, Math.min(cx - cardW / 2, margin + plotW - cardW - 4));
          const cardY = Math.max(margin + 4, Math.min(cy - cardH / 2, margin + plotH - cardH - 4));
          const titleMax = tasks.length > 14 ? 6 : 8;
          const title = shortText(task.title, titleMax);
          const timeHint = getTimeHint(task);
          const meta = timeHint
            ? `U${task.urgency} · I${task.importance} · ${shortText(timeHint, 4)}`
            : `U${task.urgency} · I${task.importance}`;

          return (
            <motion.g
              key={task.id}
              onClick={() => onTaskClick(task)}
              className="cursor-pointer"
              initial={{ opacity: 0, scale: 0.6, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
              exit={{ opacity: 0, scale: 1.5, y: -12, transition: { duration: 0.4, ease: 'easeOut' } }}
              style={{ transformOrigin: `${cardX + cardW / 2}px ${cardY + cardH / 2}px` }}
            >
              {isSelected && (
                <rect
                  x={cardX - 5}
                  y={cardY - 5}
                  width={cardW + 10}
                  height={cardH + 10}
                  rx={14}
                  fill={qColor}
                  opacity={0.12}
                />
              )}
              <rect
                x={cardX}
                y={cardY}
                width={cardW}
                height={cardH}
                rx={12}
                fill={qColor}
                opacity={isSelected ? 0.24 : 0.16}
                stroke={qColor}
                strokeWidth={isSelected ? 1.8 : 1}
              />
              <rect
                x={cardX + 1}
                y={cardY + 1}
                width={cardW - 2}
                height={cardH - 2}
                rx={11}
                fill="#111827"
                opacity={isSelected ? 0.72 : 0.62}
              />
              <rect
                x={cardX + 7}
                y={cardY + 8}
                width={3}
                height={cardH - 16}
                rx={2}
                fill={qColor}
                opacity={0.95}
              />
              <text
                x={cardX + 16}
                y={cardY + (tasks.length > 14 ? 14 : 16)}
                fill="#f8fafc"
                fontSize={tasks.length > 14 ? 9 : 10.5}
                fontWeight={700}
                style={{ pointerEvents: 'none' }}>
                {title}
              </text>
              <text
                x={cardX + 16}
                y={cardY + (tasks.length > 14 ? 28 : 32)}
                fill={qColor}
                fontSize={tasks.length > 14 ? 8 : 9}
                fontWeight={600}
                opacity={0.95}
                style={{ pointerEvents: 'none' }}>
                {meta}
              </text>
              <title>{`${task.title}
紧迫度 ${task.urgency} · 重要性 ${task.importance}${timeHint ? ` · ${timeHint}` : ''}`}</title>
            </motion.g>
          );
        })}
        </AnimatePresence>
      </svg>
    </div>
  );
}

export { QUADRANTS };
