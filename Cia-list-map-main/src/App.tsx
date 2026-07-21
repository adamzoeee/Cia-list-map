import { useState, useCallback } from 'react';
import type { Task, TaskInput, ImageTaskDraft, Team, UserProfile } from './types';
import { analyzeTask, analyzeOcrText, getApiKey } from './api/deepseek';
import { recognizeTextFromImage } from './api/ocr';
import ApiKeyInput from './components/ApiKeyInput';
import TaskInputForm from './components/TaskInputForm';
import QuadrantChart from './components/QuadrantChart';
import TaskList from './components/TaskList';
import ActionPanel from './components/ActionPanel';
import ImageTaskPreview from './components/ImageTaskPreview';
import TeamSetup from './components/TeamSetup';
import TeamPanel from './components/TeamPanel';
import { useCollaboration } from './hooks/useCollaboration';
import { Badge, Button, Panel, SectionTitle } from './components/ui';

const TASKS_STORAGE_KEY = 'quadrant_tasks';

let taskIdCounter = 0;
function nextId(): string {
  return `task_${Date.now()}_${++taskIdCounter}`;
}

function loadStoredTasks(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as any[];
    return parsed.map(task => ({
      ...task,
      completed: task.completed ?? false,
      createdAt: task.createdAt || new Date().toISOString(),
      createdBy: task.createdBy || '',
      updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
      version: task.version ?? 1,
    }));
  } catch { return []; }
}

function saveStoredTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

const USER_PROFILE_KEY = 'cia_user_profile';

function loadUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveUserProfile(profile: UserProfile) {
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
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
  const [hasKey, setHasKey] = useState(!!getApiKey());
  const [imageDrafts, setImageDrafts] = useState<ImageTaskDraft[] | null>(null);
  const [lastOcrText, setLastOcrText] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(loadUserProfile);
  const [team, setTeam] = useState<Team | null>(null);

  const collab = useCollaboration(
    team?.id ?? null,
    team?.inviteCode ?? null,
    userProfile?.userId ?? '',
  );

  const isCollabMode = team !== null;
  const activeTasks = isCollabMode ? collab.tasks : tasks;

  const handleAddTask = useCallback(async (input: TaskInput) => {
    setError(null);
    setLoading(true);
    setLoadingMessage('正在调用 AI 分析任务...');
    try {
      const result = await analyzeTask(input);
      const quadrant = getQuadrant(result.urgency, result.importance);
      if (isCollabMode && team) {
        // 协作模式：通过 Hook 创建任务
        await collab.createTask({
          title: result.title,
          description: result.description || result.suggestion,
          urgency: result.urgency,
          importance: result.importance,
          quadrant,
        });
      } else {
        // 本地模式
        const task: Task = {
          id: nextId(),
          title: result.title,
          description: result.description || result.suggestion,
          urgency: result.urgency,
          importance: result.importance,
          quadrant,
          completed: false,
          createdAt: new Date().toISOString(),
          createdBy: '',
          updatedAt: new Date().toISOString(),
          version: 1,
        };
        setTasks(prev => { const next = [task, ...prev]; saveStoredTasks(next); return next; });
        setSelectedTaskId(task.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [isCollabMode, team, collab]);

  const handleImageSubmit = useCallback(async (base64: string) => {
    setError(null);
    setLoading(true);
    setLoadingMessage('正在识别图片文字...');
    try {
      const ocrText = await recognizeTextFromImage(base64);
      setLastOcrText(ocrText);
      setLoadingMessage('正在调用 AI 拆分并分类任务...');
      const drafts = await analyzeOcrText(ocrText);
      if (drafts.length === 0) {
        setError('未从图片中识别出任何未完成任务，请检查图片内容或重试');
        return;
      }
      setImageDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
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
        createdAt: new Date().toISOString(),
        createdBy: '',
        updatedAt: new Date().toISOString(),
        version: 1,
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
    if (isCollabMode) {
      collab.deleteTask(id).catch(e => setError(e.message));
    } else {
      setTasks(prev => {
        const next = prev.filter(t => t.id !== id);
        saveStoredTasks(next);
        return next;
      });
    }
    setSelectedTaskId(prev => prev === id ? null : prev);
  }, [isCollabMode, collab]);

  const handleToggleComplete = useCallback((id: string) => {
    if (isCollabMode) {
      collab.completeTask(id).catch(e => setError(e.message));
    } else {
      setTasks(prev => {
        const next = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
        saveStoredTasks(next);
        return next;
      });
    }
  }, [isCollabMode, collab]);

  const handleUpdateTask = useCallback((id: string, updates: Partial<Pick<Task, 'urgency' | 'importance'>>) => {
    if (isCollabMode) {
      collab.updateTask(id, updates).catch(e => setError(e.message));
    } else {
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
    }
  }, [isCollabMode, collab]);


  // 未设置用户身份 → 显示 TeamSetup 向导
  if (!userProfile) {
    return (
      <TeamSetup
        onComplete={(profile, newTeam, _initTasks, _initMembers) => {
          setUserProfile(profile);
          setTeam(newTeam);
          saveUserProfile(profile);
        }}
      />
    );
  }

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
            {activeTasks.length} 个任务
          </div>
        </div>
      </header>

      {/* TeamPanel（仅协作模式） */}
      {isCollabMode && team && (
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <TeamPanel
            team={team}
            members={collab.members}
            userId={userProfile!.userId}
            connected={collab.connected}
            onLeave={() => { setTeam(null); }}
            onDelete={() => { setTeam(null); }}
          />
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* API Key */}
        {!hasKey && (
          <ApiKeyInput onKeySet={() => setHasKey(true)} />
        )}

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
            {/* API Key (collapsed when set) */}
            {hasKey && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Badge tone="success">API 已连接</Badge>
                <button
                  onClick={() => { setHasKey(false); }}
                  className="ml-auto text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
                >
                  更换 Key
                </button>
              </div>
            )}

            {/* Input form */}
            <TaskInputForm
              onSubmit={handleAddTask}
              onImageSubmit={handleImageSubmit}
              loading={loading}
              loadingMessage={loadingMessage}
            />

            {/* Action Advice Panel */}
            <div>
              <ActionPanel tasks={activeTasks} />
            </div>
          </div>

          {/* Right / Main: Chart + Task List */}
          <div className="lg:col-span-8 xl:col-span-9 order-1 lg:order-2">
            <Panel className="p-4 lg:p-6">
              {activeTasks.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-slate-600">
                  <div className="text-center">
                    <div className="neu-inset mx-auto mb-4 h-12 w-12 rounded-2xl" />
                    <p className="text-sm text-slate-500">输入任务后，这里将展示四象限分布</p>
                    <p className="text-xs mt-1 text-slate-600">AI 会自动分析紧迫度和重要性</p>
                  </div>
                </div>
              ) : (
                <QuadrantChart
                  tasks={activeTasks.filter(t => !t.completed)}
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
                tasks={activeTasks}
                selectedTaskId={selectedTaskId}
                onTaskClick={handleTaskClick}
                onTaskDelete={handleTaskDelete}
                onToggleComplete={handleToggleComplete}
                onUpdateTask={handleUpdateTask}
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
