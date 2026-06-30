import { useRef, useEffect, useState, useCallback } from 'react';
import type { Task, QuadrantInfo } from '../types';

const QUADRANTS: QuadrantInfo[] = [
  {
    id: 2,
    name: '重要不紧急',
    strategy: '📅 计划去做',
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.08)',
    borderColor: 'rgba(245,158,11,0.2)',
  },
  {
    id: 1,
    name: '重要且紧急',
    strategy: '🔥 立即去做',
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.2)',
  },
  {
    id: 3,
    name: '不重要不紧急',
    strategy: '🗑️ 减少/消除',
    color: '#6b7280',
    bgColor: 'rgba(107,114,128,0.08)',
    borderColor: 'rgba(107,114,128,0.2)',
  },
  {
    id: 4,
    name: '紧急不重要',
    strategy: '🔀 委派他人',
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.2)',
  },
];

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
      const size = Math.min(w, 500);
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

  const toX = (urgency: number) => margin + (urgency / 10) * plotW;
  const toY = (importance: number) => margin + plotH - (importance / 10) * plotH;

  // Axis ticks
  const xTicks = [0, 2, 4, 6, 8, 10];
  const yTicks = [0, 2, 4, 6, 8, 10];

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

        {/* Task bubbles */}
        {tasks.map((task) => {
          const cx = toX(task.urgency);
          const cy = toY(task.importance);
          const isSelected = task.id === selectedTaskId;
          const r = isSelected ? 11 : 8;
          const qColor = QUADRANTS.find(q => q.id === task.quadrant)?.color || '#6b7280';

          return (
            <g
              key={task.id}
              onClick={() => onTaskClick(task)}
              className="cursor-pointer"
            >
              {/* Glow for selected */}
              {isSelected && (
                <circle cx={cx} cy={cy} r={r + 6} fill={qColor} opacity={0.2} />
              )}
              <circle cx={cx} cy={cy} r={r} fill={qColor} opacity={isSelected ? 1 : 0.8}
                stroke={isSelected ? '#fff' : qColor} strokeWidth={isSelected ? 2 : 0} />
              <text x={cx} y={cy + 1} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}
                style={{ pointerEvents: 'none' }}>
                {task.title.length > 3 ? task.title.slice(0, 3) + '…' : task.title}
              </text>
              {/* Tooltip label */}
              {(isSelected || tasks.length <= 6) && (
                <text x={cx} y={cy - r - 6} textAnchor="middle" fill="#d1d5db" fontSize={10}
                  style={{ pointerEvents: 'none' }}>
                  {task.title.length > 8 ? task.title.slice(0, 8) + '…' : task.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export { QUADRANTS };
