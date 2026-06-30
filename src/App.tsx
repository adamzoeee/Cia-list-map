import { useState, useCallback } from 'react';
import type { Task, TaskInput } from './types';
import { analyzeTask, getApiKey } from './api/deepseek';
import ApiKeyInput from './components/ApiKeyInput';
import TaskInputForm from './components/TaskInputForm';
import QuadrantChart from './components/QuadrantChart';
import TaskList from './components/TaskList';

let taskIdCounter = 0;
function nextId(): string {
  return `task_${Date.now()}_${++taskIdCounter}`;
}

function getQuadrant(urgency: number, importance: number): 1 | 2 | 3 | 4 {
  if (urgency >= 5 && importance >= 5) return 1; // 重要且紧急
  if (urgency < 5 && importance >= 5) return 2;  // 重要不紧急
  if (urgency < 5 && importance < 5) return 3;   // 不重要不紧急
  return 4; // 紧急不重要
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(!!getApiKey());

  const handleAddTask = useCallback(async (input: TaskInput) => {
    setError(null);
    setLoading(true);
    try {
      const result = await analyzeTask(input);
      const quadrant = getQuadrant(result.urgency, result.importance);
      const task: Task = {
        id: nextId(),
        title: result.title,
        description: result.description || result.suggestion,
        urgency: result.urgency,
        importance: result.importance,
        quadrant,
        createdAt: new Date(),
      };
      setTasks(prev => [task, ...prev]);
      setSelectedTaskId(task.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTaskId(prev => prev === task.id ? null : task.id);
  }, []);

  const handleTaskDelete = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setSelectedTaskId(prev => prev === id ? null : prev);
  }, []);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h1 className="text-lg font-bold text-white">四象限任务管理</h1>
              <p className="text-xs text-gray-500">Eisenhower Matrix · Powered by DeepSeek AI</p>
            </div>
          </div>
          <div className="text-xs text-gray-600 hidden sm:block">
            {tasks.length} 个任务
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* API Key */}
        {!hasKey && (
          <ApiKeyInput onKeySet={() => setHasKey(true)} />
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-red-400 flex-shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-300">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main layout */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left sidebar: Input + List */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-6 order-2 lg:order-1">
            {/* API Key (collapsed when set) */}
            {hasKey && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                DeepSeek API 已连接
                <button
                  onClick={() => { setHasKey(false); }}
                  className="ml-auto text-gray-500 hover:text-gray-300 underline"
                >
                  更换 Key
                </button>
              </div>
            )}

            {/* Input form */}
            <TaskInputForm onSubmit={handleAddTask} loading={loading} />

            {/* Task list */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                📋 任务列表
              </h3>
              <TaskList
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                onTaskClick={handleTaskClick}
                onTaskDelete={handleTaskDelete}
              />
            </div>
          </div>

          {/* Right / Main: Chart */}
          <div className="lg:col-span-8 xl:col-span-9 order-1 lg:order-2">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 lg:p-6 sticky top-20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-300">
                  🎯 四象限矩阵
                </h2>
                {selectedTask && (
                  <div className="text-xs text-gray-500">
                    已选：<span className="text-gray-300 font-medium">{selectedTask.title}</span>
                  </div>
                )}
              </div>

              {tasks.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-gray-600">
                  <div className="text-center">
                    <div className="text-5xl mb-3">🗺️</div>
                    <p className="text-sm">输入任务后，这里将展示四象限分布</p>
                    <p className="text-xs mt-1 text-gray-700">AI 会自动分析紧迫度和重要性</p>
                  </div>
                </div>
              ) : (
                <QuadrantChart
                  tasks={tasks}
                  onTaskClick={handleTaskClick}
                  selectedTaskId={selectedTaskId}
                />
              )}

              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[
                  { label: '紧急且重要', color: '#ef4444', desc: '立即去做' },
                  { label: '重要不紧急', color: '#f59e0b', desc: '计划去做' },
                  { label: '不重要不紧急', color: '#6b7280', desc: '减少/消除' },
                  { label: '紧急不重要', color: '#3b82f6', desc: '委派他人' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                    <span className="text-gray-700">· {item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-8 py-4 text-center text-xs text-gray-700">
        Powered by DeepSeek AI · 四象限法则（Eisenhower Matrix）
      </footer>
    </div>
  );
}
