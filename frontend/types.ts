export enum QuestionType {
  SINGLE_CHOICE = 'single_choice',
  MULTI_CHOICE = 'multi_choice',
  TEXT = 'text',
  IMAGE_UPLOAD = 'image_upload'
}

//  Like Schemas in Backend

export interface Question {
  id: string;
  title: string;
  description?: string;
  complexity: string; // 'Class 1', 'Class 2', etc.
  type: QuestionType;
  options?: string[]; // For choice questions
  correct_answers?: string | string[];
  max_score: number;
  tags?: string[];
}

export interface Exam {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  question_ids: string[];
  is_published: boolean;
}

export interface StudentExamSession {
  examId: string;
  studentId: string;
  startTime: number;
  answers: Record<string, any>; // questionId -> answer
  remainingSeconds: number;
  status: 'in_progress' | 'submitted';
  score?: number;
  questionScores?: Record<string, number>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}