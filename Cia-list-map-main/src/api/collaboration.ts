import type { Team, Member, Task } from '../types';

const BASE = 'http://localhost:8001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    if (typeof detail === 'object' && detail !== null && 'task' in detail) {
      // 409 乐观锁冲突：保留 task 数据供上层恢复
      const err = new Error(detail.message || '冲突');
      (err as any).data = detail;
      throw err;
    }
    throw new Error(typeof detail === 'string' ? detail : `HTTP ${res.status}`);
  }
  return res.json();
}

export const collabApi = {
  // ── 团队 ──
  createTeam(name: string, creatorUserId: string, creatorNickname: string) {
    return request<{ team: Team }>('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name, creator_user_id: creatorUserId, creator_nickname: creatorNickname }),
    });
  },

  joinTeam(inviteCode: string, userId: string, nickname: string) {
    return request<{ team: Team; tasks: Task[]; members: Member[] }>('/api/teams/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCode.toUpperCase(), user_id: userId, nickname }),
    });
  },

  getTeam(teamId: string) {
    return request<{ team: Team }>(`/api/teams/${teamId}`);
  },

  getMembers(teamId: string) {
    return request<{ members: Member[] }>(`/api/teams/${teamId}/members`);
  },

  leaveTeam(teamId: string, userId: string) {
    return request<{ ok: boolean }>(`/api/teams/${teamId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  deleteTeam(teamId: string, userId: string) {
    return request<{ ok: boolean }>(`/api/teams/${teamId}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },

  // ── 任务 ──
  listTasks(teamId: string) {
    return request<{ tasks: Task[] }>(`/api/teams/${teamId}/tasks`);
  },

  createTask(teamId: string, task: {
    title: string; description: string; urgency: number;
    importance: number; quadrant: number; createdBy: string;
  }) {
    return request<{ task: Task }>(`/api/teams/${teamId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        title: task.title, description: task.description,
        urgency: task.urgency, importance: task.importance,
        quadrant: task.quadrant, created_by: task.createdBy,
      }),
    });
  },

  updateTask(teamId: string, taskId: string, updates: {
    userId: string; version: number;
    title?: string; description?: string; urgency?: number;
    importance?: number; quadrant?: number;
    completed?: boolean; assignedTo?: string;
  }) {
    return request<{ task: Task }>(`/api/teams/${teamId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({
        user_id: updates.userId, version: updates.version,
        title: updates.title, description: updates.description,
        urgency: updates.urgency, importance: updates.importance,
        quadrant: updates.quadrant, completed: updates.completed,
        assigned_to: updates.assignedTo,
      }),
    });
  },

  deleteTask(teamId: string, taskId: string, userId: string) {
    return request<{ ok: boolean }>(`/api/teams/${teamId}/tasks/${taskId}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },
};
