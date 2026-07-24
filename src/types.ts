export interface Task {
  id: string;
  title: string;
  description: string;
  urgency: number;   // -5~5, 横轴：时间紧迫度
  importance: number; // -5~5, 纵轴：任务重要性
  quadrant: 1 | 2 | 3 | 4;
  completed: boolean;
  createdAt: Date;
  assignees?: string[];  // 认领人昵称列表（协作模式）
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

// ========== WebSocket 消息 & 协作类型 ==========

export type WsMessageType =
  | 'analyze_text' | 'analyze_result'
  | 'analyze_batch' | 'analyze_batch_result'
  | 'auth' | 'auth_ok' | 'auth_fail'
  | 'task_add' | 'task_added'
  | 'task_update' | 'task_updated'
  | 'task_delete' | 'task_deleted'
  | 'task_toggle' | 'task_toggled'
  | 'task_assign' | 'task_assigned'
  | 'member_join' | 'member_leave' | 'members_list'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}

export interface Collaborator {
  nickname: string;
  online: boolean;
}

export interface CollabState {
  isJoined: boolean;
  groupId: string;
  nickname: string;
  members: Collaborator[];
}
