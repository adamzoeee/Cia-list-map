import { useState, useEffect, useRef, useCallback } from 'react';
import type { Task, Member, WsMessage } from '../types';
import { collabApi } from '../api/collaboration';

interface UseCollaborationReturn {
  tasks: Task[];
  members: Member[];
  connected: boolean;
  createTask: (input: { title: string; description: string; urgency: number; importance: number; quadrant: number }) => Promise<Task>;
  updateTask: (taskId: string, updates: { title?: string; description?: string; urgency?: number; importance?: number; quadrant?: number; completed?: boolean; assignedTo?: string }) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  claimTask: (taskId: string) => Promise<Task>;
  completeTask: (taskId: string) => Promise<Task>;
}

export function useCollaboration(
  teamId: string | null,
  inviteCode: string | null,
  userId: string,
): UseCollaborationReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retryDelay = useRef(1000);
  const tasksRef = useRef<Task[]>([]);

  tasksRef.current = tasks;

  const connect = useCallback(() => {
    if (!inviteCode) return () => {};
    const ws = new WebSocket(`ws://localhost:8001/ws/${inviteCode}`);

    ws.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000;
      if (teamId) {
        collabApi.listTasks(teamId).then(res => setTasks(res.tasks)).catch(() => {});
        collabApi.getMembers(teamId).then(res => setMembers(res.members)).catch(() => {});
      }
    };

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'task_created': {
          const task = msg.payload.task as Task;
          setTasks(prev => [task, ...prev]);
          break;
        }
        case 'task_updated': {
          const task = msg.payload.task as Task;
          setTasks(prev => prev.map(t => t.id === task.id ? task : t));
          break;
        }
        case 'task_deleted': {
          const taskId = msg.payload.taskId as string;
          setTasks(prev => prev.filter(t => t.id !== taskId));
          break;
        }
        case 'member_joined':
        case 'member_left':
          setMembers(msg.payload.members as Member[]);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, [inviteCode, teamId]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const getLatestVersion = useCallback((taskId: string): number => {
    const task = tasksRef.current.find(t => t.id === taskId);
    return task?.version ?? 1;
  }, []);

  const createTask = useCallback(async (input: {
    title: string; description: string; urgency: number;
    importance: number; quadrant: number;
  }): Promise<Task> => {
    if (!teamId) throw new Error('无团队');
    const tempId = `temp-${Date.now()}`;
    const optimistic: Task = {
      id: tempId, title: input.title, description: input.description,
      urgency: input.urgency, importance: input.importance,
      quadrant: input.quadrant as 1 | 2 | 3 | 4,
      completed: false,
      createdBy: userId, assignedTo: undefined,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      version: 0,
    };
    setTasks(prev => [optimistic, ...prev]);
    try {
      const res = await collabApi.createTask(teamId, { ...input, createdBy: userId });
      setTasks(prev => prev.map(t => t.id === tempId ? res.task : t));
      return res.task;
    } catch (e) {
      setTasks(prev => prev.filter(t => t.id !== tempId));
      throw e;
    }
  }, [teamId, userId]);

  const updateTask = useCallback(async (taskId: string, updates: Record<string, unknown>) => {
    if (!teamId) throw new Error('无团队');
    const version = getLatestVersion(taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } as Task : t));
    try {
      const res = await collabApi.updateTask(teamId, taskId, { userId, version, ...updates });
      setTasks(prev => prev.map(t => t.id === taskId ? res.task : t));
      return res.task;
    } catch (e: any) {
      if (e.data?.task) {
        setTasks(prev => prev.map(t => t.id === taskId ? e.data.task : t));
      }
      throw e;
    }
  }, [teamId, userId, getLatestVersion]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!teamId) throw new Error('无团队');
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await collabApi.deleteTask(teamId, taskId, userId);
    } catch {
      if (teamId) {
        collabApi.listTasks(teamId).then(res => setTasks(res.tasks));
      }
      throw new Error('删除失败，已刷新');
    }
  }, [teamId, userId]);

  const claimTask = useCallback(async (taskId: string) => {
    return updateTask(taskId, { assignedTo: userId });
  }, [updateTask, userId]);

  const completeTask = useCallback(async (taskId: string) => {
    return updateTask(taskId, { completed: true });
  }, [updateTask]);

  return { tasks, members, connected, createTask, updateTask, deleteTask, claimTask, completeTask };
}
