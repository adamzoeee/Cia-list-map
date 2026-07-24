import { useState, useCallback, useEffect } from 'react';
import type { Task, ImageTaskDraft, CollabState, WsMessage } from './types';
import { wsClient } from './api/websocket';
import { recognizeTextFromImage } from './api/ocr';
import TaskInputForm from './components/TaskInputForm';
import QuadrantChart from './components/QuadrantChart';
import TaskList from './components/TaskList';
import ActionPanel from './components/ActionPanel';
import CollaborationPanel from './components/CollaborationPanel';
import ImageTaskPreview from './components/ImageTaskPreview';
import { Button, Panel, SectionTitle } from './components/ui';

const TASKS_STORAGE_KEY = 'quadrant_tasks';

let taskIdCounter = 0;
function nextId(): string {
  return `task_${Date.now()}_${++taskIdCounter}`;
}

function loadStoredTasks(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Task, 'createdAt'> & { createdAt: string; completed?: boolean }>;
    return parsed.map(task => ({
      ...task,
      completed: task.completed ?? false,
      createdAt: new Date(task.createdAt),
    }));
  } catch {
    return [];
  }
}

function saveStoredTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

function getQuadrant(urgency: number, importance: number): 1 | 2 | 3 | 4 {
  if (urgency >= 0 && importance >= 0) return 1; // 重要且紧急
  if (urgency < 0 && importance >= 0) return 2;  // 重要不紧急
  if (urgency < 0 && importance < 0) return 3;   // 不重要不紧急
  return 4; // 紧急不重要
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(loadStoredTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imageDrafts, setImageDrafts] = useState<ImageTaskDraft[] | null>(null);
  const [lastOcrText, setLastOcrText] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [collabState, setCollabState] = useState<CollabState>({
    isJoined: false, groupId: '', nickname: '', members: [],
  });

  // ---- WebSocket 连接 & 全局消息处理 ----
  useEffect(() => {
    wsClient.connect();
    const unsubState = wsClient.onStateChange(s => setWsConnected(s === 'connected'));

    // 单机：文字分析结果
    const unsub1 = wsClient.on('analyze_result', (msg: WsMessage) => {
      const r = msg.task as Record<string, unknown> | undefined;
      if (!r) { setLoading(false); return; }
      const quadrant = getQuadrant(Number(r.urgency ?? 0), Number(r.importance ?? 0));
      const task: Task = {
        id: nextId(),
        title: String(r.title || ''),
        description: String(r.description || r.suggestion || ''),
        urgency: Number(r.urgency ?? 0),
        importance: Number(r.importance ?? 0),
        quadrant,
        completed: false,
        createdAt: new Date(),
      };
      setTasks(prev => { const next = [task, ...prev]; saveStoredTasks(next); return next; });
      setSelectedTaskId(task.id);
      setLoading(false);
      setLoadingMessage('');
    });

    // 单机：批量分析结果
    const unsub2 = wsClient.on('analyze_batch_result', (msg: WsMessage) => {
      const results = (msg.tasks as Array<Record<string, unknown>>) || [];
      const drafts: ImageTaskDraft[] = results.map(t => ({
        title: String(t.title || ''),
        description: String(t.description || ''),
        urgency: Number(t.urgency ?? 0),
        importance: Number(t.importance ?? 0),
      }));
      setImageDrafts(drafts);
      setLoading(false);
      setLoadingMessage('');
    });

    // 全局错误
    const unsub3 = wsClient.on('error', (msg: WsMessage) => {
      setError(msg.message as string || '未知错误');
      setLoading(false);
      setLoadingMessage('');
    });

    // ---- 协作模式消息（仅在已加入组时生效） ----
    const unsub4 = wsClient.on('task_added', (msg: WsMessage) => {
      const t = msg.task as Record<string, unknown>;
      if (!t) return;
      const task: Task = {
        id: t.id as string,
        title: String(t.title || ''),
        description: String(t.description || ''),
        urgency: Number(t.urgency ?? 0),
        importance: Number(t.importance ?? 0),
        quadrant: Number(t.quadrant ?? 1) as 1 | 2 | 3 | 4,
        completed: Boolean(t.completed),
        assignees: (t.assignees as string[]) || [],
        createdAt: new Date(t.createdAt as string),
      };
      setTasks(prev => [task, ...prev]);
    });

    const unsub5 = wsClient.on('task_updated', (msg: WsMessage) => {
      const t = msg.task as Record<string, unknown>;
      if (!t) return;
      setTasks(prev => prev.map(task =>
        task.id === t.id
          ? { ...task, urgency: Number(t.urgency), importance: Number(t.importance), quadrant: Number(t.quadrant) as 1|2|3|4 }
          : task
      ));
    });

    const unsub6 = wsClient.on('task_deleted', (msg: WsMessage) => {
      const tid = msg.task_id as string;
      setTasks(prev => prev.filter(t => t.id !== tid));
      setSelectedTaskId(prev => prev === tid ? null : prev);
    });

    const unsub7 = wsClient.on('task_toggled', (msg: WsMessage) => {
      const tid = msg.task_id as string;
      const completed = msg.completed as boolean;
      setTasks(prev => prev.map(t => t.id === tid ? { ...t, completed } : t));
    });

    const unsub8 = wsClient.on('task_assigned', (msg: WsMessage) => {
      const tid = msg.task_id as string;
      const assignees = msg.assignees as string[];
      setTasks(prev => prev.map(t => t.id === tid ? { ...t, assignees } : t));
    });

    return () => {
      unsubState(); unsub1(); unsub2(); unsub3();
      unsub4(); unsub5(); unsub6(); unsub7(); unsub8();
    };
  }, []);

  const handleTextSubmit = useCallback((title: string, description: string) => {
    setError(null);
    setLoading(true);
    setLoadingMessage('正在调用模型分析...');
    if (collabState.isJoined) {
      wsClient.send({ type: 'task_add', title, description } as WsMessage);
      setTimeout(() => { setLoading(false); setLoadingMessage(''); }, 15000);
    } else {
      wsClient.send({ type: 'analyze_text', title, description } as WsMessage);
    }
  }, [collabState.isJoined]);

  const handleImageReady = useCallback(async (base64: string) => {
    setError(null);
    setLoading(true);
    setLoadingMessage('正在识别图片文字...');
    try {
      const ocrText = await recognizeTextFromImage(base64);
      setLastOcrText(ocrText);
      const lines = ocrText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !/^[\s\p{P}]+$/u.test(l));
      if (lines.length === 0) {
        setError('OCR 未识别出有效任务文字，请换一张更清晰的图片');
        setLoading(false);
        setLoadingMessage('');
        return;
      }
      setLoadingMessage('正在调用模型评分...');
      wsClient.send({
        type: 'analyze_batch',
        texts: lines.map(title => ({ title, description: '' })),
      } as WsMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR 识别失败');
      setLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const handleConfirmImageTasks = useCallback((drafts: ImageTaskDraft[]) => {
    const newTasks: Task[] = drafts.map(draft => {
      const quadrant = getQuadrant(draft.urgency, draft.importance);
      return {
        id: nextId(),
        title: draft.title,
        description: draft.description,
        urgency: draft.urgency,
        importance: draft.importance,
        quadrant,
        completed: false,
        createdAt: new Date(),
      };
    });
    setTasks(prev => {
      const next = [...newTasks, ...prev];
      saveStoredTasks(next);
      return next;
    });
    if (newTasks.length > 0) {
      setSelectedTaskId(newTasks[0].id);
    }
    setImageDrafts(null);
    setLastOcrText('');
  }, []);

  const handleCancelImageTasks = useCallback(() => {
    setImageDrafts(null);
    setLastOcrText('');
  }, []);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTaskId(prev => prev === task.id ? null : task.id);
  }, []);

  const handleTaskDelete = useCallback((id: string) => {
    if (collabState.isJoined) {
      wsClient.send({ type: 'task_delete', task_id: id } as WsMessage);
      return;
    }
    setTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      saveStoredTasks(next);
      return next;
    });
    setSelectedTaskId(prev => prev === id ? null : prev);
  }, [collabState.isJoined]);

  const handleToggleComplete = useCallback((id: string) => {
    if (collabState.isJoined) {
      wsClient.send({ type: 'task_toggle', task_id: id } as WsMessage);
      return;
    }
    setTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
      saveStoredTasks(next);
      return next;
    });
  }, [collabState.isJoined]);

  const handleUpdateTask = useCallback((id: string, updates: Partial<Pick<Task, 'urgency' | 'importance'>>) => {
    if (collabState.isJoined) {
      wsClient.send({ type: 'task_update', task_id: id, ...updates } as WsMessage);
      return;
    }
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const urgency = updates.urgency ?? t.urgency;
        const importance = updates.importance ?? t.importance;
        return { ...t, urgency, importance, quadrant: getQuadrant(urgency, importance) };
      });
      saveStoredTasks(next);
      return next;
    });
  }, [collabState.isJoined]);

  const handleAssign = useCallback((taskId: string, action: 'claim' | 'unclaim') => {
    if (!collabState.isJoined) return;
    wsClient.send({ type: 'task_assign', task_id: taskId, action } as WsMessage);
  }, [collabState.isJoined]);

  const handleCollabStateChange = useCallback((s: CollabState) => {
    setCollabState(s);
  }, []);

  const handleCollabTasksReceived = useCallback((serverTasks: Array<Record<string, unknown>>) => {
    const parsed: Task[] = serverTasks.map(t => ({
      id: t.id as string,
      title: String(t.title || ''),
      description: String(t.description || ''),
      urgency: Number(t.urgency ?? 0),
      importance: Number(t.importance ?? 0),
      quadrant: Number(t.quadrant ?? 1) as 1 | 2 | 3 | 4,
      completed: Boolean(t.completed),
      assignees: (t.assignees as string[]) || [],
      createdAt: new Date(t.createdAt as string),
    }));
    setTasks(parsed);
  }, []);

  const handleMemberJoin = useCallback((nickname: string) => {
    setCollabState(prev => {
      const members = prev.members.map(m =>
        m.nickname === nickname ? { ...m, online: true } : m
      );
      if (!members.find(m => m.nickname === nickname)) {
        members.push({ nickname, online: true });
      }
      return { ...prev, members };
    });
  }, []);

  const handleMemberLeave = useCallback((nickname: string) => {
    setCollabState(prev => ({
      ...prev,
      members: prev.members.map(m =>
        m.nickname === nickname ? { ...m, online: false } : m
      ),
    }));
  }, []);


  return (
    <div className="min-h-screen bg-[#111827] text-slate-100">
      {/* Header — neumorphic raised bar */}
      <header className="sticky top-0 z-10 border-b border-white/4 bg-[#111827] shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="neu-raised-sm grid h-9 w-9 place-items-center rounded-xl text-cyan-200 text-sm font-bold">
              Q
            </span>
            <div>
              <h1 className="text-lg font-bold text-white">优先级矩阵</h1>
              <p className="text-xs text-slate-500">AI Task Prioritization Workspace</p>
            </div>
          </div>
          <div className="text-xs text-slate-500 hidden sm:block">
            {tasks.length} 个任务
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Error */}
        {error && (
          <div className="neu-raised rounded-2xl mb-6 flex items-start gap-3 p-4 border-red-400/15">
            <span className="text-red-300 flex-shrink-0 mt-0.5">!</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-200">{error}</p>
            </div>
            <Button
              onClick={() => setError(null)}
              variant="ghost"
              className="h-7 px-2 text-red-300"
            >
              ✕
            </Button>
          </div>
        )}

        {/* Main layout */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left sidebar: Input + Actions */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-6 order-2 lg:order-1">
            {/* Input form */}
            <TaskInputForm
              onTextSubmit={handleTextSubmit}
              onImageReady={handleImageReady}
              loading={loading}
              loadingMessage={loadingMessage}
            />

            {/* Action Advice Panel */}
            <div>
              <ActionPanel tasks={tasks} />
            </div>

            {/* Collaboration Panel */}
            <div>
              <CollaborationPanel
                collabState={collabState}
                wsConnected={wsConnected}
                onCollabStateChange={handleCollabStateChange}
                onTasksReceived={handleCollabTasksReceived}
                onMemberJoin={handleMemberJoin}
                onMemberLeave={handleMemberLeave}
              />
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2 text-xs">
              <span className={wsConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {wsConnected ? '●' : '○'}
              </span>
              <span className="text-slate-500">
                {wsConnected ? '后端已连接' : '后端未连接'}
              </span>
            </div>
          </div>

          {/* Right / Main: Chart + Task List */}
          <div className="lg:col-span-8 xl:col-span-9 order-1 lg:order-2">
            <Panel className="p-4 lg:p-6">
              {tasks.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-slate-600">
                  <div className="text-center">
                    <div className="neu-inset mx-auto mb-4 h-12 w-12 rounded-2xl" />
                    <p className="text-sm text-slate-500">输入任务后，这里将展示四象限分布</p>
                    <p className="text-xs mt-1 text-slate-600">AI 会自动分析紧迫度和重要性</p>
                  </div>
                </div>
              ) : (
                <QuadrantChart
                  tasks={tasks.filter(t => !t.completed)}
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
                  <div key={item.label} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                    <span className="text-slate-600">· {item.desc}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Task list */}
            <div className="mt-6">
              <SectionTitle eyebrow="Tasks" title="任务列表" />
              <TaskList
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                onTaskClick={handleTaskClick}
                onTaskDelete={handleTaskDelete}
                onToggleComplete={handleToggleComplete}
                onUpdateTask={handleUpdateTask}
                onAssign={handleAssign}
                collabNickname={collabState.nickname}
                isCollab={collabState.isJoined}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/4 mt-8 py-4 text-center text-xs text-slate-600">
        Powered by Compatible AI API · 四象限法则（Eisenhower Matrix）
      </footer>

      {/* Image Task Preview Modal */}
      {imageDrafts && (
        <ImageTaskPreview
          drafts={imageDrafts}
          ocrText={lastOcrText}
          onConfirm={handleConfirmImageTasks}
          onCancel={handleCancelImageTasks}
        />
      )}
    </div>
  );
}
