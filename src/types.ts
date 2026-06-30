export interface Task {
  id: string;
  title: string;
  description: string;
  urgency: number;   // 0-10, 横轴：时间紧迫度
  importance: number; // 0-10, 纵轴：任务重要性
  quadrant: 1 | 2 | 3 | 4;
  createdAt: Date;
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
