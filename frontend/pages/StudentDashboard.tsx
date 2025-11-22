import React, { useEffect, useState } from 'react';
import { Exam } from '../types';
import { fetchExams, getExamResult } from '../services/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const StudentDashboard: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  // map of examId -> 'resumable' | 'submitted' | undefined
  const [examStatusMap, setExamStatusMap] = useState<Record<string, 'resumable' | 'submitted' | undefined>>({});
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      const data = await fetchExams();
      // Filter published exams
      const published = data.filter(e => e.is_published);
      setExams(published);

      // Build resumable map for this student
      if (user) {
        const map: Record<string, 'resumable' | 'submitted' | undefined> = {};
        await Promise.all(published.map(async (e) => {
          try {
            const sess = await getExamResult(e.id, user.id);
            const now = new Date();
            const end = new Date(e.end_time);
            if (sess) {
              if (sess.status === 'submitted') {
                map[e.id] = 'submitted';
              } else if (sess.remainingSeconds > 0 && now <= end) {
                map[e.id] = 'resumable';
              }
            }
          } catch (err) {
            // ignore
          }
        }));
        setExamStatusMap(map);
      }

      setLoading(false);
    };
    load();
  }, [user]);

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

            const status = examStatusMap[exam.id];
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
                      <Link
                        to={`/student/exam/${exam.id}`}
                        className="block w-full text-center bg-blue-600 text-white py-2 rounded-md font-semibold hover:bg-blue-700 transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                      >
                        Start Exam
                      </Link>
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