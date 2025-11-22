import { Exam, Question, QuestionType, StudentExamSession, User, AuthResponse } from '../types';
import axios from "axios";

// Use relative URLs so Vite dev server proxy forwards requests to backend during development.
const BACKEND = "";

// Small delay value used in a few places (keeps UX consistent when mocking is removed)
const DELAY = 500;

// Helper: try to decode token to find a user when backend call fails
const decodeTokenLocal = (token: string) => {
  try {
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
};

// --- Auth API ---

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  // Call backend login. If backend is down we surface an error to UI.
  try {
    const resp = await axios.post(`${BACKEND}/auth/login`, { email, password });
    const data = resp.data;
    if (!data || !data.user || !data.token) throw new Error('Invalid response from auth server');
    return { user: data.user, token: data.token };
  } catch (err: any) {
    if (err?.response?.data?.detail) throw new Error(err.response.data.detail);
    throw new Error(err?.message || 'Login failed: backend not reachable');
  }
};

export const register = async (name: string, email: string, password: string): Promise<AuthResponse> => {
  // Call backend register endpoint. If it returns created user without token we try to login.
  try {
    const resp = await axios.post(`${BACKEND}/auth/register`, { email, password, full_name: name });
    const data = resp.data;
    if (data && data.id && data.email) {
      if (data.token) return { user: data, token: data.token } as AuthResponse;
      const loginResp = await axios.post(`${BACKEND}/auth/login`, { email, password });
      const loginData = loginResp.data;
      if (loginData && loginData.user && loginData.token) return { user: loginData.user, token: loginData.token };
      // If no token, throw so UI can show message.
      throw new Error('Registration succeeded but token not returned');
    }
    throw new Error('Invalid response from register endpoint');
  } catch (err: any) {
    if (err?.response?.data?.detail) throw new Error(err.response.data.detail);
    throw new Error(err?.message || 'Register failed: backend not reachable');
  }
};

export const getCurrentUser = async (token: string): Promise<User | null> => {
  if (!token) return null;
  try {
    const resp = await axios.get(`${BACKEND}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    return resp.data as User;
  } catch (err) {
    // Try a local decode if token is not a real JWT (fallback limited)
    try {
      const decoded = decodeTokenLocal(token);
      if (!decoded) return null;
      return { id: decoded.id, name: decoded.name || '', email: decoded.email || '', role: decoded.role || 'student' } as User;
    } catch {
      return null;
    }
  }
};

// --- Question Bank API ---

export const fetchQuestions = async (params?: { search?: string; tags?: string[]; page?: number; per_page?: number }): Promise<{ items: Question[]; total: number }> => {
  try {
    const queryParams: Record<string, string | number> = {};
    if (params?.search) queryParams['search'] = params.search;
    if (params?.tags && params.tags.length > 0) queryParams['tags'] = params.tags.join(',');
    if (params?.page) queryParams['page'] = params.page;
    if (params?.per_page) queryParams['per_page'] = params.per_page;

    const resp = await axios.get(`${BACKEND}/api/questionbank/list`, { params: queryParams });
    if (resp.data && Array.isArray(resp.data.items) && typeof resp.data.total === 'number') {
      return { items: resp.data.items as Question[], total: resp.data.total };
    }
    throw new Error('Invalid response from questions endpoint');
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to fetch questions from backend');
  }
};

export const uploadExcelQuestions = async (file: File): Promise<Question[]> => {
  const form = new FormData();
  form.append('file', file);
  try {
    const resp = await axios.post(`${BACKEND}/api/questionbank/upload`, form);
    const data = resp.data;
    if (data && Array.isArray(data.preview)) {
      const mapped: Question[] = data.preview.map((p: any) => ({
        id: p.id || crypto.randomUUID(),
        title: p.title || p.text || '',
        description: p.description || '',
        complexity: p.complexity || '',
        type: p.type as QuestionType,
        options: p.options || [],
        correct_answers: p.correct_answers || (p.correct_answer ?? ''),
        max_score: p.max_score || 1,
        tags: p.tags || []
      }));
      return mapped;
    }
    throw new Error('Invalid upload response');
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to upload/parse excel on backend');
  }
};

export const confirmImportQuestions = async (newQuestions: Question[]): Promise<{ message?: string; created_count?: number }> => {
  try {
    const payload = newQuestions.map(q => ({
      title: q.title,
      description: q.description || '',
      complexity: q.complexity || '',
      type: q.type,
      options: q.options || [],
      correct_answers: q.correct_answers || [],
      max_score: q.max_score || 1,
      tags: q.tags || []
    }));

    const resp = await axios.post(`${BACKEND}/api/questionbank/confirm-import`, payload);
    return resp.data || { message: 'Import successful' };
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to confirm import on backend');
  }
};

export const getQuestionById = async (id: string): Promise<Question | null> => {
  try {
    const resp = await axios.get(`${BACKEND}/api/questionbank/${id}`);
    return resp.data as Question;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to get question from backend');
  }
};

// --- Exam Management API ---

export const fetchExams = async (): Promise<Exam[]> => {
  try {
    const resp = await axios.get(`${BACKEND}/api/exams`);
    if (Array.isArray(resp.data)) {
      const mapped: Exam[] = resp.data.map((e: any) => ({
        id: e.id,
        title: e.title,
        description: e.description || '',
        start_time: e.start_time,
        end_time: e.end_time,
        duration_minutes: e.duration ?? e.duration_minutes ?? 0,
        question_ids: e.questions || e.question_ids || [],
        is_published: e.is_published ?? false,
      }));
      return mapped;
    }
    throw new Error('Invalid response from exams endpoint');
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to fetch exams from backend');
  }
};

export const fetchAllQuestions = async (): Promise<Question[]> => {
  try {
    const resp = await fetchQuestions({ page: 1, per_page: 10000 });
    return resp.items;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to fetch all questions from backend');
  }
};

export const getExamById = async (id: string): Promise<Exam | null> => {
  try {
    const resp = await axios.get(`${BACKEND}/api/exams/${id}`);
    const e = resp.data;
    return {
      id: e.id,
      title: e.title,
      description: e.description || '',
      start_time: e.start_time,
      end_time: e.end_time,
      duration_minutes: e.duration ?? e.duration_minutes ?? 0,
      question_ids: e.questions || e.question_ids || [],
      is_published: e.is_published ?? false,
    } as Exam;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to get exam from backend');
  }
};

export const createExam = async (exam: Omit<Exam, 'id'>): Promise<Exam> => {
  try {
    const payload = {
      title: exam.title,
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration: exam.duration_minutes ?? 0,
      is_published: exam.is_published ?? false,
      questions: exam.question_ids || [],
    };
    const resp = await axios.post(`${BACKEND}/api/exams`, payload);
    const e = resp.data;
    return {
      id: e.id,
      title: e.title,
      description: e.description || '',
      start_time: e.start_time,
      end_time: e.end_time,
      duration_minutes: e.duration ?? e.duration_minutes ?? 0,
      question_ids: e.questions || e.question_ids || [],
      is_published: e.is_published ?? false,
    } as Exam;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to create exam on backend');
  }
};

export const updateExam = async (exam: Exam): Promise<Exam> => {
  try {
    const payload: any = {};
    if (exam.title !== undefined) payload.title = exam.title;
    if (exam.start_time !== undefined) payload.start_time = exam.start_time;
    if (exam.end_time !== undefined) payload.end_time = exam.end_time;
    if (exam.duration_minutes !== undefined) payload.duration = exam.duration_minutes;
    if (exam.question_ids !== undefined) payload.questions = exam.question_ids;
    if (exam.is_published !== undefined) payload.is_published = exam.is_published;

    const resp = await axios.put(`${BACKEND}/api/exams/${exam.id}`, payload);
    const e = resp.data;
    return {
      id: e.id,
      title: e.title,
      description: e.description || '',
      start_time: e.start_time,
      end_time: e.end_time,
      duration_minutes: e.duration ?? e.duration_minutes ?? 0,
      question_ids: e.questions || e.question_ids || [],
      is_published: e.is_published ?? false,
    } as Exam;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to update exam on backend');
  }
};

export const deleteExam = async (examId: string): Promise<void> => {
  try {
    await axios.delete(`${BACKEND}/api/exams/${examId}`);
    return;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to delete exam on backend');
  }
};

export const publishExam = async (examId: string, isPublished: boolean): Promise<Exam> => {
  try {
    const url = isPublished ? `${BACKEND}/api/exams/${examId}/publish` : `${BACKEND}/api/exams/${examId}/unpublish`;
    const resp = await axios.post(url);
    const e = resp.data;
    return {
      id: e.id,
      title: e.title,
      description: e.description || '',
      start_time: e.start_time,
      end_time: e.end_time,
      duration_minutes: e.duration ?? e.duration_minutes ?? 0,
      question_ids: e.questions || e.question_ids || [],
      is_published: e.is_published ?? false,
    } as Exam;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to toggle publish on backend');
  }
};

// --- Student Exam API ---

export const startExamSession = async (examId: string, studentId: string): Promise<StudentExamSession> => {
  try {
    const resp = await axios.post(`${BACKEND}/api/exams/${examId}/start`);
    const data = resp.data;
    // Map backend session response to local shape
    return {
      examId: data.exam_id || data.examId || examId,
      studentId: data.student_id || data.studentId || studentId,
      startTime: data.start_time ? new Date(data.start_time).getTime() : Date.now(),
      answers: data.answers || {},
      remainingSeconds: data.remaining_seconds ?? data.remainingSeconds ?? 0,
      status: data.status || 'in_progress',
      questions: data.questions || []
    } as StudentExamSession;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to start exam session on backend');
  }
};

export const saveExamProgress = async (session: StudentExamSession): Promise<void> => {
  try {
    const payload = { answers: session.answers || {}, remaining_seconds: session.remainingSeconds ?? 0 };
    await axios.put(`${BACKEND}/api/exams/${session.examId}/session`, payload);
    return;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to autosave session on backend');
  }
};

export const submitExam = async (session: StudentExamSession): Promise<StudentExamSession> => {
  try {
    const payload = { answers: session.answers || {} };
    const resp = await axios.post(`${BACKEND}/api/exams/${session.examId}/submit`, payload);
    const data = resp.data;
    return {
      examId: data.exam_id || data.examId || session.examId,
      studentId: data.student_id || data.studentId || session.studentId,
      startTime: data.start_time ? new Date(data.start_time).getTime() : (session.startTime || Date.now()),
      answers: data.answers || session.answers || {},
      remainingSeconds: data.remaining_seconds ?? 0,
      status: data.status || 'submitted',
      score: typeof data.score === 'number' ? data.score : session.score,
      questionScores: data.question_scores || session.questionScores || {}
    } as StudentExamSession;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to submit session to backend');
  }
};

export const updateSessionScore = async (examId: string, studentId: string, questionId: string, newScore: number): Promise<StudentExamSession> => {
  try {
    const payload = { exam_id: examId, student_id: studentId, question_id: questionId, new_score: newScore };
    const resp = await axios.post(`${BACKEND}/api/student/results/grade`, payload);
    const data = resp.data;
    // Map backend response to StudentExamSession
    return {
      examId: data.exam_id,
      studentId: data.student_id,
      startTime: data.start_time ? new Date(data.start_time).getTime() : Date.now(),
      answers: data.answers || {},
      remainingSeconds: data.remaining_seconds ?? 0,
      status: data.status || 'submitted',
      score: typeof data.score === 'number' ? data.score : undefined,
      questionScores: data.question_scores || {}
    } as StudentExamSession;
  } catch (err: any) {
    if (err?.response?.data?.detail) throw new Error(err.response.data.detail);
    throw new Error(err?.message || 'Failed to update session score on backend');
  }
};

export const getStudentResults = async (studentId: string): Promise<StudentExamSession[]> => {
  try {
    const payload = studentId ? { student_id: studentId } : {};
    const resp = await axios.post(`${BACKEND}/api/student/results`, payload);
    if (Array.isArray(resp.data)) {
      return resp.data.map((d: any) => ({
        examId: d.exam_id,
        studentId: d.student_id,
        startTime: d.start_time ? new Date(d.start_time).getTime() : Date.now(),
        status: d.status,
        score: d.score,
        questionScores: d.question_scores || {},
        answers: d.answers || {},
        remainingSeconds: d.remaining_seconds ?? 0
      } as StudentExamSession));
    }
    throw new Error('Invalid response from student results endpoint');
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to fetch student results from backend');
  }
};

export const getAllExamResults = async (): Promise<StudentExamSession[]> => {
  try {
    const resp = await axios.post(`${BACKEND}/api/student/results`, {});
    if (Array.isArray(resp.data)) {
      return resp.data.map((d: any) => ({
        examId: d.exam_id,
        studentId: d.student_id,
        startTime: d.start_time ? new Date(d.start_time).getTime() : Date.now(),
        status: d.status,
        score: d.score,
        questionScores: d.question_scores || {},
        answers: d.answers || {},
        remainingSeconds: d.remaining_seconds ?? 0
      } as StudentExamSession));
    }
    throw new Error('Invalid response from student results endpoint');
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to fetch all exam results from backend');
  }
};

export const getExamResult = async (examId: string, studentId: string): Promise<StudentExamSession | null> => {
  try {
    const payload = { exam_id: examId, student_id: studentId };
    const resp = await axios.post(`${BACKEND}/api/student/results`, payload);
    if (Array.isArray(resp.data) && resp.data.length > 0) {
      const d = resp.data[0];
      return {
        examId: d.exam_id,
        studentId: d.student_id,
        startTime: d.start_time ? new Date(d.start_time).getTime() : Date.now(),
        status: d.status,
        score: d.score,
        questionScores: d.question_scores || {},
        answers: d.answers || {},
        remainingSeconds: d.remaining_seconds ?? 0
      } as StudentExamSession;
    }
    return null;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to fetch exam result from backend');
  }
};

// --- Media API ---

export const uploadMedia = async (file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.append('file', file);
  try {
    const resp = await axios.post(`${BACKEND}/api/media/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    const data = resp.data;
    if (data && data.url) return { url: data.url };
    throw new Error('Invalid upload response');
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to upload media to backend');
  }
};
