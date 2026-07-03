import { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task, QuadrantInfo } from '../types';

const QUADRANTS: QuadrantInfo[] = [
  {
    id: 2,
    name: '重要不紧急',
    strategy: '计划去做',
    color: '#d97706',
    bgColor: 'rgba(217,119,6,0.06)',
    borderColor: 'rgba(217,119,6,0.15)',
  },
  {
    id: 1,
    name: '重要且紧急',
    strategy: '立即去做',
    color: '#dc2626',
    bgColor: 'rgba(220,38,38,0.06)',
    borderColor: 'rgba(220,38,38,0.15)',
  },
  {
    id: 3,
    name: '不重要不紧急',
    strategy: '减少或消除',
    color: '#6b7280',
    bgColor: 'rgba(107,114,128,0.05)',
    borderColor: 'rgba(107,114,128,0.12)',
  },
  {
    id: 4,
    name: '紧急不重要',
    strategy: '委派或压缩',
    color: '#2563eb',
    bgColor: 'rgba(37,99,235,0.06)',
    borderColor: 'rgba(37,99,235,0.15)',
  },
];

const PARTICLE_COUNT = 14;

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

interface Explosion {
  cx: number;
  cy: number;
  color: string;
}

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  selectedTaskId: string | null;
}

export default function QuadrantChart({ tasks, onTaskClick, selectedTaskId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 500, height: 500 });
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const [explosions, setExplosions] = useState<Map<string, Explosion>>(new Map());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const size = Math.min(w, 700);
      setDims({ width: size, height: size });
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = dims;
  const margin = 40;
  const plotW = width - margin * 2;
  const plotH = height - margin * 2;

  const toX = (urgency: number) => margin + ((urgency + 5) / 10) * plotW;
  const toY = (importance: number) => margin + plotH - ((importance + 5) / 10) * plotH;

  const xTicks = [-5, -3, -1, 1, 3, 5];
  const yTicks = [-5, -3, -1, 1, 3, 5];

  // Build card position cache and detect newly completed tasks
  const cardPositions = useMemo(() => {
    const map = new Map<string, { cx: number; cy: number; qColor: string }>();
    tasks.forEach(task => {
      map.set(task.id, {
        cx: toX(task.urgency),
        cy: toY(task.importance),
        qColor: QUADRANTS.find(q => q.id === task.quadrant)?.color || '#8b8f98',
      });
    });
    return map;
  }, [tasks, toX, toY]);

  // Detect newly completed tasks and start explosions
  useEffect(() => {
    const currentCompleted = new Set(tasks.filter(t => t.completed).map(t => t.id));
    const prevCompleted = prevCompletedRef.current;

    const newlyCompleted = [...currentCompleted].filter(id => !prevCompleted.has(id));
    if (newlyCompleted.length > 0) {
      const newExplosions = new Map(explosions);
      newlyCompleted.forEach(id => {
        const pos = cardPositions.get(id);
        if (pos) {
          newExplosions.set(id, {
            cx: pos.cx,
            cy: pos.cy,
            color: pos.qColor,
          });
        }
      });
      setExplosions(newExplosions);

      // Clean up after animation
      setTimeout(() => {
        setExplosions(prev => {
          const next = new Map(prev);
          newlyCompleted.forEach(id => next.delete(id));
          return next;
        });
      }, 650);
    }

    prevCompletedRef.current = currentCompleted;
  }, [tasks, cardPositions, explosions]);

  // Only show tasks that are NOT completed (completed ones explode and vanish)
  const visibleTasks = tasks.filter(t => !t.completed);

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="select-none"
      >
        {/* Plot area background */}
        <rect
          x={margin} y={margin} width={plotW} height={plotH}
          rx={8}
          fill="#1a1d22"
          stroke="#2d3038"
          strokeWidth={1}
        />

        {/* Quadrant backgrounds */}
        <rect x={margin} y={margin} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[2].bgColor} />
        <rect x={margin + plotW / 2} y={margin} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[3].bgColor} />
        <rect x={margin} y={margin + plotH / 2} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[0].bgColor} />
        <rect x={margin + plotW / 2} y={margin + plotH / 2} width={plotW / 2} height={plotH / 2} fill={QUADRANTS[1].bgColor} />

        {/* Quadrant dividing lines */}
        <line x1={margin + plotW / 2} y1={margin} x2={margin + plotW / 2} y2={margin + plotH}
          stroke="#2d3038" strokeWidth={1.5} strokeDasharray="6,3" />
        <line x1={margin} y1={margin + plotH / 2} x2={margin + plotW} y2={margin + plotH / 2}
          stroke="#2d3038" strokeWidth={1.5} strokeDasharray="6,3" />

        {/* Quadrant labels */}
        {QUADRANTS.map((q) => {
          let qx: number, qy: number;
          if (q.id === 2) { qx = margin + plotW * 0.25; qy = margin + plotH * 0.25; }
          else if (q.id === 1) { qx = margin + plotW * 0.75; qy = margin + plotH * 0.25; }
          else if (q.id === 3) { qx = margin + plotW * 0.25; qy = margin + plotH * 0.75; }
          else { qx = margin + plotW * 0.75; qy = margin + plotH * 0.75; }

          const count = visibleTasks.filter(t => t.quadrant === q.id).length;
          return (
            <g key={q.id}>
              <text x={qx} y={qy - 6} textAnchor="middle" fill={q.color} fontSize={11} fontWeight={600} opacity={0.8}>
                {q.name}
              </text>
              <text x={qx} y={qy + 12} textAnchor="middle" fill="#6b6f78" fontSize={10} opacity={0.8}>
                {q.strategy} {count > 0 && `(${count})`}
              </text>
            </g>
          );
        })}

        {/* X axis */}
        <line x1={margin} y1={margin + plotH} x2={margin + plotW} y2={margin + plotH} stroke="#4a4e56" strokeWidth={1} />
        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line x1={toX(t)} y1={margin + plotH} x2={toX(t)} y2={margin + plotH + 5} stroke="#4a4e56" strokeWidth={1} />
            <text x={toX(t)} y={margin + plotH + 18} textAnchor="middle" fill="#8b8f98" fontSize={10}>
              {t}
            </text>
          </g>
        ))}
        <text x={margin + plotW / 2} y={margin + plotH + 35} textAnchor="middle" fill="#8b8f98" fontSize={11} fontWeight={600}>
          时间紧迫度 →
        </text>

        {/* Y axis */}
        <line x1={margin} y1={margin} x2={margin} y2={margin + plotH} stroke="#4a4e56" strokeWidth={1} />
        {yTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line x1={margin - 5} y1={toY(t)} x2={margin} y2={toY(t)} stroke="#4a4e56" strokeWidth={1} />
            <text x={margin - 8} y={toY(t) + 4} textAnchor="end" fill="#8b8f98" fontSize={10}>
              {t}
            </text>
          </g>
        ))}
        <text x={14} y={margin + plotH / 2} textAnchor="middle" fill="#8b8f98" fontSize={11} fontWeight={600}
          transform={`rotate(-90, 14, ${margin + plotH / 2})`}>
          任务重要性 →
        </text>

        {/* Visible task cards (non-completed) */}
        {visibleTasks.map((task) => {
          const cx = toX(task.urgency);
          const cy = toY(task.importance);
          const isSelected = task.id === selectedTaskId;
          const qColor = QUADRANTS.find(q => q.id === task.quadrant)?.color || '#8b8f98';
          const cardW = visibleTasks.length > 14 ? 88 : 108;
          const cardH = visibleTasks.length > 14 ? 36 : 42;
          const cardX = Math.max(margin + 4, Math.min(cx - cardW / 2, margin + plotW - cardW - 4));
          const cardY = Math.max(margin + 4, Math.min(cy - cardH / 2, margin + plotH - cardH - 4));
          const titleMax = visibleTasks.length > 14 ? 6 : 8;
          const title = shortText(task.title, titleMax);
          const timeHint = getTimeHint(task);
          const meta = timeHint
            ? `U${task.urgency} · I${task.importance} · ${shortText(timeHint, 4)}`
            : `U${task.urgency} · I${task.importance}`;

          return (
            <g
              key={task.id}
              onClick={() => onTaskClick(task)}
              className="cursor-pointer transition-transform"
            >
              {isSelected && (
                <rect
                  x={cardX - 4}
                  y={cardY - 4}
                  width={cardW + 8}
                  height={cardH + 8}
                  rx={12}
                  fill={qColor}
                  opacity={0.1}
                />
              )}
              <rect
                x={cardX}
                y={cardY}
                width={cardW}
                height={cardH}
                rx={10}
                fill="#1e2127"
                stroke={isSelected ? qColor : '#2d3038'}
                strokeWidth={isSelected ? 2 : 1}
              />
              <rect
                x={cardX + 6}
                y={cardY + 8}
                width={3}
                height={cardH - 16}
                rx={2}
                fill={qColor}
                opacity={0.95}
              />
              <text
                x={cardX + 15}
                y={cardY + (visibleTasks.length > 14 ? 14 : 16)}
                fill="#e2e4e9"
                fontSize={visibleTasks.length > 14 ? 9 : 10.5}
                fontWeight={700}
                style={{ pointerEvents: 'none' }}>
                {title}
              </text>
              <text
                x={cardX + 15}
                y={cardY + (visibleTasks.length > 14 ? 28 : 32)}
                fill={qColor}
                fontSize={visibleTasks.length > 14 ? 8 : 9}
                fontWeight={600}
                opacity={0.9}
                style={{ pointerEvents: 'none' }}>
                {meta}
              </text>
              <title>{`${task.title}\n紧迫度 ${task.urgency} · 重要性 ${task.importance}${timeHint ? ` · ${timeHint}` : ''}`}</title>
            </g>
          );
        })}

        {/* Explosion particles for newly completed tasks */}
        <AnimatePresence>
          {[...explosions.entries()].map(([id, exp]) => {
            const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
              const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
              const dist = 35 + Math.random() * 55;
              return {
                key: i,
                dx: Math.cos(angle) * dist,
                dy: Math.sin(angle) * dist,
                rotation: (Math.random() - 0.5) * 360,
                size: 3 + Math.random() * 10,
                delay: Math.random() * 0.06,
              };
            });

            return (
              <g key={`explosion-${id}`}>
                {particles.map((p) => (
                  <motion.rect
                    key={p.key}
                    initial={{ x: exp.cx - p.size / 2, y: exp.cy - p.size / 2, opacity: 1, rotate: 0, scale: 0 }}
                    animate={{
                      x: exp.cx - p.size / 2 + p.dx,
                      y: exp.cy - p.size / 2 + p.dy,
                      opacity: 0,
                      rotate: p.rotation,
                      scale: 1,
                    }}
                    transition={{ duration: 0.5 + Math.random() * 0.2, delay: p.delay, ease: 'easeOut' }}
                    width={p.size}
                    height={p.size}
                    rx={1.5}
                    fill={exp.color}
                  />
                ))}
              </g>
            );
          })}
        </AnimatePresence>
      </svg>
    </div>
  );
}

export { QUADRANTS };
