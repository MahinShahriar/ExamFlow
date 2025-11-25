import React, { useEffect, useState } from 'react';
import { Exam } from '../types';
import { fetchExams, getExamResult, startExamSession, getStudentResults } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const StudentDashboard: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  // map of examId -> 'resumable' | 'submitted' | undefined
  const [examStatusMap, setExamStatusMap] = useState<Record<string, 'resumable' | 'submitted' | undefined>>({});
  // map of examId -> reason object (for debugging / UI badge)
  const [examReasonMap, setExamReasonMap] = useState<Record<string, any>>({});
  const [startingMap, setStartingMap] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const data = await fetchExams('student');
      // backend /api/student/exams returns only published/allowed exams for students
      setExams(data);

      // Build resumable map for this student
      if (user) {
        // use a null-prototype object to avoid prototype pollution
        const map: Record<string, 'resumable' | 'submitted' | undefined> = Object.create(null);
        const reasonMap: Record<string, any> = Object.create(null);

        // Fetch all results once to avoid per-exam calls that may return unrelated data
        let studentResults: any[] = [];
        try {
          studentResults = await getStudentResults(user.id);
        } catch (err) {
          // ignore — we'll still rely on per-exam local fallback
          console.debug('[StudentDashboard] failed to fetch student results, falling back to per-exam local checks', err);
          studentResults = [];
        }

        const resultsMap: Record<string, any> = Object.create(null);
        for (const r of studentResults) {
          try {
            const rid = r?.examId ?? r?.exam_id ?? null;
            const rStudent = r?.studentId ?? r?.student_id ?? null;
            if (rid != null && rStudent != null && String(rStudent) === String(user.id)) {
              resultsMap[String(rid)] = r;
            }
          } catch (e) {
            // ignore malformed result
          }
        }

        // helper to validate a server-provided session belongs to this exam + user
        const isServerSessionValid = (sess: any, examId: string, userId: string) => {
          if (!sess) return false;
          // Expect server/session-mapped object to include examId and studentId
          const sessExamId = sess.examId ?? sess.exam_id ?? null;
          const sessStudentId = sess.studentId ?? sess.student_id ?? null;
          if (sessExamId == null || sessStudentId == null) return false;
          return String(sessExamId) === String(examId) && String(sessStudentId) === String(userId);
        };

        // helper to validate a locally-stored session before we mark it resumable
        // NOTE: require the stored session explicitly include both examId and studentId
        const isLocalSessionResumable = (localSess: any, examId: string, userId: string, now: Date, end: Date) => {
          if (!localSess) return false;
          // Do NOT default missing ids to the current examId/userId — require them to be present and match
          const sessExamId = localSess.examId ?? localSess.exam_id ?? null;
          const sessStudentId = localSess.studentId ?? localSess.student_id ?? localSess.student ?? null;
          if (sessExamId == null || sessStudentId == null) return false;

          const remaining = localSess.remainingSeconds ?? localSess.remaining_seconds ?? 0;
          const status = localSess.status ?? 'in_progress';
          const start = localSess.startTime ?? localSess.start_time ?? 0;

          // require: not submitted, positive remaining, not expired, positive start time, and matching ids
          if (status === 'submitted') return false;
          if (typeof remaining !== 'number' || remaining <= 0) return false;
          if (!(start && typeof start === 'number' && start > 0)) return false;
          if (now > end) return false;
          if (String(sessExamId) !== String(examId)) return false;
          if (String(sessStudentId) !== String(userId)) return false;
          return true;
        };

        // Iterate exams sequentially and compute status per exam to avoid any accidental cross-exam leakage
        for (const e of data) {
          let marked: string | undefined = undefined;
          let reason: any = null;
          try {
            const now = new Date();
            const end = new Date(e.end_time);

            const sess = resultsMap[String(e.id)] ?? null;

            if (sess && isServerSessionValid(sess, e.id, user.id)) {
              // Extra server-side sanity: ensure sess.student matches current user
              const sessStudentId = sess.studentId ?? sess.student_id ?? null;
              if (String(sessStudentId) !== String(user.id)) {
                reason = { source: 'server', sess, valid: false };
              } else if (sess.status === 'submitted') {
                map[String(e.id)] = 'submitted';
                reasonMap[String(e.id)] = { source: 'server', type: 'submitted' };
                marked = 'submitted';
                reason = { source: 'server', sess };
              } else if ((sess.remainingSeconds ?? 0) > 0 && now <= end) {
                map[String(e.id)] = 'resumable';
                reasonMap[String(e.id)] = { source: 'server', type: 'resumable' };
                marked = 'resumable';
                reason = { source: 'server', sess };
              }
            } else {
              // Fallback: check localStorage saved session (client-side autosave/local persistence)
              try {
                const key = `exam_session_${e.id}_${user.id}`;
                const raw = localStorage.getItem(key);
                if (raw) {
                  const localSess = JSON.parse(raw) as any;
                  if (isLocalSessionResumable(localSess, e.id, user.id, now, end)) {
                    map[String(e.id)] = 'resumable';
                    reasonMap[String(e.id)] = { source: 'local', type: 'resumable' };
                    marked = 'resumable';
                    reason = { source: 'local', localSess };
                  } else {
                    reason = { source: 'local', localSess, valid: false };
                    reasonMap[String(e.id)] = { source: 'local', valid: false };
                  }
                } else {
                  reason = { source: 'local', found: false };
                }
              } catch (err) {
                // ignore localStorage parse errors
                reason = { source: 'local', error: err };
                reasonMap[String(e.id)] = { source: 'local', error: String(err) };
              }
            }
          } catch (err) {
            // ignore backend error and try local fallback only for this specific exam
            try {
              const now = new Date();
              const end = new Date(e.end_time);
              const key = `exam_session_${e.id}_${user.id}`;
              const raw = localStorage.getItem(key);
              if (raw) {
                const localSess = JSON.parse(raw) as any;
                if (isLocalSessionResumable(localSess, e.id, user.id, now, end)) {
                  map[String(e.id)] = 'resumable';
                  reasonMap[String(e.id)] = { source: 'local', type: 'resumable' };
                  marked = 'resumable';
                  reason = { source: 'local', localSess };
                } else {
                  reason = { source: 'local', localSess, valid: false };
                  reasonMap[String(e.id)] = { source: 'local', valid: false };
                }
              } else {
                reason = { source: 'local', found: false };
              }
            } catch (e2) {
              // ignore
              reason = { source: 'local', error: e2 };
              reasonMap[String(e.id)] = { source: 'local', error: String(e2) };
            }
          }

          // debug log per exam to help trace why it's marked
          console.debug('[StudentDashboard] examStatusCheck', { examId: e.id, marked, reason });
        }

        // final map debug - shows exactly which exams we marked and why
        console.debug('[StudentDashboard] finalExamStatusMap', map, reasonMap);

        setExamStatusMap(map);
        setExamReasonMap(reasonMap);
      }

      setLoading(false);
    };
    load();
  }, [user]);

  const handleStart = async (examId: string) => {
    if (!user) return;
    // prevent duplicate clicks
    setStartingMap(prev => ({ ...prev, [examId]: true }));
    try {
      // ensure the backend creates the session before navigating
      await startExamSession(examId, user.id);
      navigate(`/student/exam/${examId}`);
    } catch (err: any) {
      console.error('Failed to start exam', err);
      alert(err?.message || 'Failed to start exam. Please try again.');
    } finally {
      setStartingMap(prev => ({ ...prev, [examId]: false }));
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Available Exams</h1>
      
      {loading ? <p>Loading...</p> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map(exam => {
            const now = new Date();
            const start = new Date(exam.start_time);
            const end = new Date(exam.end_time);
            const isActive = now >= start && now <= end;

            const status = examStatusMap[String(exam.id)];
            const reason = examReasonMap[String(exam.id)];
            const isResumable = status === 'resumable';
            const isSubmitted = status === 'submitted';

            return (
              <div key={exam.id} className="bg-white rounded-lg shadow-lg overflow-hidden border-t-4 border-blue-500">
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{exam.title}</h3>
                  <p className="text-sm text-gray-600 mb-4">{exam.description || 'No description provided.'}</p>
                  
                  <div className="space-y-2 text-sm text-gray-500 mb-6">
                    <div className="flex justify-between">
                        <span>Duration:</span>
                        <span className="font-medium">{exam.duration_minutes} Mins</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Questions:</span>
                        <span className="font-medium">{exam.question_ids.length}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Ends:</span>
                        <span className="font-medium">{end.toLocaleDateString()}</span>
                    </div>
                  </div>

                  {isActive ? (
                    isSubmitted ? (
                      <div className="flex gap-2">
                        <button disabled className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-md font-semibold cursor-not-allowed">
                          Submitted
                        </button>
                        <Link to={`/result/${exam.id}/${user?.id}`} className="flex-1 text-center bg-blue-600 text-white py-2 rounded-md font-semibold hover:bg-blue-700 transition">
                          See result detail
                        </Link>
                      </div>
                    ) : isResumable ? (
                      <Link
                        to={`/student/exam/${exam.id}`}
                        className="block w-full text-center bg-orange-500 text-white py-2 rounded-md font-semibold hover:bg-orange-600 transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                      >
                        Resume Exam
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleStart(exam.id)}
                        disabled={!!startingMap[exam.id]}
                        className={`block w-full text-center py-2 rounded-md font-semibold transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${startingMap[exam.id] ? 'bg-gray-300 text-gray-700 cursor-wait' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        {startingMap[exam.id] ? 'Starting...' : 'Start Exam'}
                      </button>
                    )
                  ) : (
                    <button disabled className="w-full bg-gray-300 text-gray-500 py-2 rounded-md font-semibold cursor-not-allowed">
                      {now < start ? 'Not Started Yet' : 'Expired'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};