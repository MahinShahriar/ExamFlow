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

// New helper: read token from localStorage and return headers object
const getAuthHeaders = (): Record<string, any> => {
  try {
    const token = localStorage.getItem('authToken');
    const defaults: any = (axios.defaults && axios.defaults.headers && axios.defaults.headers.common) ? axios.defaults.headers.common : {};
    const headers: Record<string, any> = { ...defaults };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  } catch (e) {
  }
  return {};
};

// --- Auth API ---

export const login = async (email: string, password: string): Promise<AuthResponse> => {

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
  // Call backend to get user info based on token
  try {
    const resp = await axios.get(`${BACKEND}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    return resp.data as User;
  } catch (err: any) {
      console.error('Failed to get current user from backend, trying to decode token locally', err);
      // fallback: attempt to decode token locally (useful for tests/mocked tokens)
      try {
        const decoded = decodeTokenLocal(token);
        if (!decoded) return null;
        // Ensure we satisfy the frontend User interface (id, name, email, role)
        const user: User = {
          id: String(decoded.id || decoded.user_id || ''),
          name: String(decoded.name || decoded.full_name || decoded.username || ''),
          email: String(decoded.email || ''),
          role: (decoded.role === 'admin' ? 'admin' : 'student')
        };
        return user;
      } catch {
        return null;
      }
  }
};

// --- Question Bank API ---

export const fetchQuestions = async (params?: { search?: string; tags?: string[]; page?: number; per_page?: number; complexity?: string }): Promise<{ items: Question[]; total: number }> => {
  try {
    const queryParams: Record<string, string | number> = {};
    if (params?.search) queryParams['search'] = params.search;
    if (params?.tags && params.tags.length > 0) queryParams['tags'] = params.tags.join(',');
    if (params?.page) queryParams['page'] = params.page;
    if (params?.per_page) queryParams['per_page'] = params.per_page;
    if (params?.complexity) queryParams['complexity'] = params.complexity;

    const resp = await axios.get(`${BACKEND}/api/questionbank/list`, { params: queryParams });
    if (resp.data && Array.isArray(resp.data.items) && typeof resp.data.total === 'number') {
      return { items: resp.data.items as Question[], total: resp.data.total };
    }
    throw new Error('Invalid response from questions endpoint');
  } catch (err: any) {
    // surface backend detail if present
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to fetch questions from backend';
    throw new Error(detail);
  }
};

export const uploadExcelQuestions = async (file: File): Promise<Question[]> => {
  const form = new FormData();
  form.append('file', file);
  try {
    const resp = await axios.post(`${BACKEND}/api/questionbank/upload`, form, { headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' } });
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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to upload/parse excel on backend';
    throw new Error(detail);
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

    const resp = await axios.post(`${BACKEND}/api/questionbank/confirm-import`, payload, { headers: getAuthHeaders() });
    return resp.data || { message: 'Import successful' };
  } catch (err: any) {
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to confirm import on backend';
    throw new Error(detail);
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

//  if user.role === 'admin' , endpoint is : /api/exams
//  if user.role === 'student' , endpoint is : /api/student/exams



export const fetchExams = async (role: 'admin' | 'student' = 'admin'): Promise<Exam[]> => {
  try {
    // choose endpoint based on role to ensure Student and Admin use the correct backend route
    const endpoint = role === 'student' ? '/api/student/exams' : '/api/exams/';
    const resp = await axios.get(`${BACKEND}${endpoint}`, { headers: getAuthHeaders() });
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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to fetch exams from backend';
    throw new Error(detail);
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
    const resp = await axios.get(`${BACKEND}/api/exams/${id}`, { headers: getAuthHeaders() });
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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to get exam from backend';
    throw new Error(detail);
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
    // POST to the exams root with trailing slash to avoid redirects
    const resp = await axios.post(`${BACKEND}/api/exams/`, payload, { headers: getAuthHeaders() });
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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to create exam on backend';
    throw new Error(detail);
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

    const resp = await axios.put(`${BACKEND}/api/exams/${exam.id}`, payload, { headers: getAuthHeaders() });
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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to update exam on backend';
    throw new Error(detail);
  }
};

export const deleteExam = async (examId: string): Promise<void> => {
  try {
    await axios.delete(`${BACKEND}/api/exams/${examId}`, { headers: getAuthHeaders() });
    return;
  } catch (err: any) {
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to delete exam on backend';
    throw new Error(detail);
  }
};

export const publishExam = async (examId: string, isPublished: boolean): Promise<Exam> => {
  try {
    const url = isPublished ? `${BACKEND}/api/exams/${examId}/publish` : `${BACKEND}/api/exams/${examId}/unpublish`;
    const resp = await axios.post(url, {}, { headers: getAuthHeaders() });
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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to toggle publish on backend';
    throw new Error(detail);
  }
};

// --- Student Exam API ---

export const startExamSession = async (examId: string, studentId: string): Promise<StudentExamSession> => {
  try {
    const resp = await axios.post(`${BACKEND}/api/exams/${examId}/start` , {}, { headers: getAuthHeaders() });
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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to start exam session on backend';
    throw new Error(detail);
  }
};

export const saveExamProgress = async (session: StudentExamSession): Promise<void> => {
  try {
    const payload = { answers: session.answers || {}, remaining_seconds: session.remainingSeconds ?? 0 };
    // persist locally as a fallback so users can still resume even if network fails
    try {
      const key = `exam_session_${session.examId}_${session.studentId}`;
      localStorage.setItem(key, JSON.stringify({ ...session }));
    } catch (e) {
      // ignore localStorage errors
    }

    console.log("🔥 Saving exam progress payload:", JSON.stringify(payload, null, 2));
    await axios.put(`${BACKEND}/api/exams/${session.examId}/session`, payload, { headers: getAuthHeaders() });
    return;
  } catch (err: any) {
    console.error('Failed to autosave session on backend', err?.response || err?.message || err);
    // return silently so callers (like unload handlers) do not get blocked
    return;
  }
};

// Enhance submit to remove local fallback on success and surface errors
export const submitExam = async (session: StudentExamSession): Promise<StudentExamSession> => {
  try {
    const payload = { answers: session.answers || {} };
    const resp = await axios.post(`${BACKEND}/api/exams/${session.examId}/submit`, payload, { headers: getAuthHeaders() });
    const data = resp.data;

    // Cleanup local fallback on successful submit
    try {
      const key = `exam_session_${session.examId}_${session.studentId}`;
      localStorage.removeItem(key);
    } catch (e) { /* ignore */ }

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
    const detail = err?.response?.data?.detail || err?.response?.data || err?.message || 'Failed to submit session to backend';
    throw new Error(detail);
  }
};

export const updateSessionScore = async (examId: string, studentId: string, questionId: string, newScore: number): Promise<StudentExamSession> => {
  try {
    const payload = { exam_id: examId, student_id: studentId, question_id: questionId, new_score: newScore };
    const resp = await axios.post(`${BACKEND}/api/student/results/grade`, payload, { headers: getAuthHeaders() });
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
    const detail = err?.response?.data || err?.message || 'Failed to update session score on backend';
    throw new Error(detail);
  }
};

export const getStudentResults = async (studentId: string): Promise<StudentExamSession[]> => {
  try {
    const payload = studentId ? { student_id: studentId } : {};
    const resp = await axios.post(`${BACKEND}/api/student/results`, payload, { headers: getAuthHeaders() });
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
    const resp = await axios.post(`${BACKEND}/api/student/results`, {}, { headers: getAuthHeaders() });
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
    const resp = await axios.post(`${BACKEND}/api/student/results`, payload, { headers: getAuthHeaders() });
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
    // Send auth headers as well (if present) so backend can verify the user
    const resp = await axios.post(`${BACKEND}/api/media/upload`, form, { headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' } });
    const data = resp.data;
    if (data && data.url) {
      // Normalize relative URLs returned by the backend (e.g. '/media/..') into absolute URLs
      let url = data.url as string;
      if (url.startsWith('/')) {
        try {
          url = window.location.origin + url;
        } catch (e) {
          // fallback: return as-is
        }
      }
      return { url };
    }
    throw new Error('Invalid upload response');
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to upload media to backend');
  }
};
