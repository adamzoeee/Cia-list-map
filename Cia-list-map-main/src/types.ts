export interface Task {
  id: string;
  title: string;
  description: string;
  urgency: number;   // -5~5, 横轴：时间紧迫度
  importance: number; // -5~5, 纵轴：任务重要性
  quadrant: 1 | 2 | 3 | 4;
  completed: boolean;
  createdAt: string;
  // 协作新增字段
  createdBy: string;
  assignedTo?: string;
  updatedAt: string;
  version: number;
}

export interface TaskInput {
  title: string;
  description: string;
}

export interface AIAnalysisResult {
  title: string;
  description: string;
  urgency: number;
  importance: number;
  suggestion: string;
}

export interface QuadrantInfo {
  id: 1 | 2 | 3 | 4;
  name: string;
  strategy: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export type AnalysisMode = 'text' | 'image';

export interface ImageTaskDraft {
  title: string;
  description: string;
  urgency: number;
  importance: number;
}

export interface ImageAnalysisResult {
  tasks: ImageTaskDraft[];
}

// ── 协作相关类型 ──

export interface Team {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
}

export interface Member {
  id: string;
  teamId: string;
  userId: string;
  nickname: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface UserProfile {
  userId: string;
  nickname: string;
}

export type WsEventType = 'task_created' | 'task_updated' | 'task_deleted' | 'member_joined' | 'member_left';

export interface WsMessage {
  type: WsEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}
