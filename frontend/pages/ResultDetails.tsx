import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StudentExamSession, Exam, Question, QuestionType } from '../types';
import { fetchExams, fetchAllQuestions, getExamResult, updateSessionScore } from '../services/api';

export const ResultDetails: React.FC<{ currentUser: { id: string, role: string } }> = ({ currentUser }) => {
  const { examId, studentId } = useParams<{ examId: string, studentId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<StudentExamSession | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingQ, setUpdatingQ] = useState<string | null>(null);

  useEffect(() => {
    if (examId && studentId) {
      loadData();
    }
  }, [examId, studentId]);

  const loadData = async () => {
    if (!examId || !studentId) return;
    

    if (currentUser.role === 'student' && currentUser.id !== studentId) {
      alert("Unauthorized");
      navigate('/');
      return;
    }

    try {
      const [sess, exams, allQuestions] = await Promise.all([
        getExamResult(examId, studentId),
        fetchExams(currentUser.role),
        fetchAllQuestions()
      ]);

      if (!sess) {
        alert("Result not found");
        navigate(-1);
        return;
      }

      const ex = exams.find(e => e.id === examId) || null;
      setSession(sess);
      setExam(ex);

      if (ex) {
         const examQuestions = ex.question_ids
        .map(id => allQuestions.find(q => q.id === id))
        .filter(q => q !== undefined) as Question[];
        setQuestions(examQuestions);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isCorrect = (q: Question, userAnswer: any) => {
     if (q.type === QuestionType.SINGLE_CHOICE) {
       return userAnswer === q.correct_answers;
     }
     if (q.type === QuestionType.MULTI_CHOICE) {
        const correct = q.correct_answers as string[];
        const given = userAnswer as string[];
        return Array.isArray(given) && Array.isArray(correct) &&
                correct.length === given.length &&
                correct.every(v => given.includes(v));
     }
     return false; 
  };

  const handleGrade = async (qId: string, newScore: number, maxScore?: number) => {
    if (!examId || !studentId) return;
    // validate numeric
    const ns = Number(newScore);
    if (isNaN(ns)) {
      alert('Grade must be a number');
      return;
    }
    if (maxScore !== undefined && (ns < 0 || ns > Number(maxScore))) {
      alert(`Grade must be between 0 and ${maxScore}`);
      return;
    }

    setUpdatingQ(qId);
    try {
        const updated = await updateSessionScore(examId, studentId, qId, ns);
        setSession(updated);
    } catch(e) {
        alert("Failed to update score");
    } finally {
        setUpdatingQ(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center h-64">
        <div className="text-gray-500 font-medium">Loading result details...</div>
    </div>
  );
  
  if (!session || !exam) return <div className="p-8 text-center text-red-500">Data not found</div>;

  const totalMaxScore = questions.reduce((acc, q) => acc + q.max_score, 0);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6 flex justify-between items-start bg-white p-6 rounded-lg shadow">
         <div>
           <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-3 hover:underline inline-flex items-center">
             <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
             Back to list
           </button>
           <h1 className="text-2xl font-bold text-gray-800">{exam.title}</h1>
           <div className="mt-2 space-y-1">
               <p className="text-gray-600 text-sm">Student: <span className="font-medium text-gray-900">{studentId === 'u2' ? 'Sam Student' : studentId}</span></p>
               <p className="text-gray-600 text-sm">Submitted: <span className="font-medium text-gray-900">{new Date(session.startTime).toLocaleDateString()}</span></p>
           </div>
         </div>
         <div className="text-right">
            <div className="text-5xl font-bold text-blue-600">{session.score} <span className="text-2xl text-gray-400 font-normal">/ {totalMaxScore}</span></div>
            <div className="text-sm font-bold text-gray-500 uppercase tracking-wide mt-1">Total Score</div>
            <div className="mt-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 uppercase">Submitted</span>
            </div>
         </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-800 px-2">Question Breakdown</h2>
        {questions.map((q, idx) => {
            const userAnswer = session.answers[q.id];
            const isManual = q.type === QuestionType.TEXT || q.type === QuestionType.IMAGE_UPLOAD;
            const correct = !isManual && isCorrect(q, userAnswer);
            const score = session.questionScores?.[q.id];
            
            let statusBorder = 'border-gray-200';
            let statusBadge = null;

            if (isManual) {
                if (score !== undefined) {
                    statusBorder = 'border-blue-500';
                    statusBadge = <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded">Graded ({score}/{q.max_score})</span>;
                } else {
                    statusBorder = 'border-yellow-400';
                    statusBadge = <span className="text-xs font-bold bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Pending Evaluation</span>;
                }
            } else if (correct) {
                statusBorder = 'border-green-500';
                statusBadge = <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded">Correct ({score ?? q.max_score}/{q.max_score})</span>;
            } else {
                statusBorder = 'border-red-500';
                statusBadge = <span className="text-xs font-bold bg-red-100 text-red-800 px-2 py-1 rounded">Incorrect ({score ?? 0}/{q.max_score})</span>;
            }

            return (
              <div key={q.id} className={`bg-white rounded-lg shadow-sm p-6 border-l-4 ${statusBorder}`}>
                <div className="flex justify-between mb-4 items-start">
                  <div className="flex-1 pr-4">
                     <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs font-bold mr-2 mb-2">{q.type.replace('_', ' ').toUpperCase()}</span>
                     <h3 className="text-lg font-medium text-gray-900"><span className="text-gray-400 font-normal mr-2">Q{idx+1}.</span> {q.title}</h3>
                  </div>
                  <div className="shrink-0">
                    {statusBadge}
                  </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <div className="text-xs uppercase text-gray-500 font-bold mb-2">Student's Answer</div>
                        <div className={`p-4 rounded border ${!isManual && correct ? 'bg-green-50 border-green-100' : (isManual ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100')}`}>
                            {q.type === QuestionType.IMAGE_UPLOAD ? (
                                userAnswer ? (
                                  // Normalize relative URLs (e.g. "/media/...") to absolute so images render in admin and student views.
                                  (() => {
                                    let imageUrl = userAnswer as string;
                                    try {
                                      if (typeof imageUrl === 'string') {
                                        // 1) Relative path like '/media/...' -> prefix with current origin
                                        if (imageUrl.startsWith('/')) {
                                          imageUrl = window.location.origin + imageUrl;
                                        } else {
                                          // 2) Absolute URL (maybe pointing to backend) whose path starts with /media/
                                          //    -> rewrite to use the frontend origin so Vite proxy handles it in dev.
                                          try {
                                            const parsed = new URL(imageUrl);
                                            if (parsed.pathname.startsWith('/media/') && parsed.origin !== window.location.origin) {
                                              imageUrl = window.location.origin + parsed.pathname;
                                            }
                                          } catch (e) {
                                            // not a valid URL, leave as-is
                                          }
                                        }
                                      }
                                    } catch (e) {
                                      // ignore and use original
                                    }
                                    return (
                                      <div className="flex flex-col items-start gap-2 w-full">
                                        <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                                          <div className="h-48 w-full flex items-center justify-center overflow-hidden bg-gray-50 rounded">
                                            <img src={imageUrl} alt={`upload-${q.id}`} className="max-h-full max-w-full object-contain rounded shadow-sm" />
                                          </div>
                                        </a>
                                        <a className="text-blue-600 underline text-sm" href={imageUrl} target="_blank" rel="noopener noreferrer">Open image in new tab</a>
                                      </div>
                                    );
                                  })()
                                ) : <span className="text-gray-400 italic">No image uploaded</span>
                            ) : (
                                <div className="text-gray-800 font-medium">
                                    {userAnswer ? (Array.isArray(userAnswer) ? userAnswer.join(', ') : userAnswer) : <span className="text-gray-400 italic">No answer provided</span>}
                                </div>
                            )}
                        </div>
                    </div>

                    {!correct && !isManual && (
                        <div>
                            <div className="text-xs uppercase text-gray-500 font-bold mb-2">Correct Answer</div>
                            <div className="p-4 bg-white rounded border border-gray-200 text-gray-700 font-medium">
                            {Array.isArray(q.correct_answers) ? q.correct_answers.join(', ') : q.correct_answers}
                            </div>
                        </div>
                    )}

                    {/* Manual Grading Controls for Admin */}
                    {isManual && currentUser.role === 'admin' && (
                        <div className="mt-4 p-4 bg-gray-50 rounded border border-gray-200">
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Admin Grading (Max: {q.max_score})</label>
                            <div className="flex items-center gap-3">
                                {/*TODO : greater than max_value input throws error !*/}
                                <input
                                    type="number" 
                                    min={0} 
                                    max={q.max_score}
                                    className="border rounded px-3 py-2 w-24 text-sm"
                                    defaultValue={score ?? ''}
                                    placeholder="0"
                                    id={`grade-input-${q.id}`}
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter') {
                                            const val = (e.target as HTMLInputElement).value;
                                            if(val !== '') {
                                                const parsed = Number(val);
                                                handleGrade(q.id, parsed, q.max_score);
                                            }
                                        }
                                    }}
                                />
                                <button 
                                    onClick={() => {
                                        const el = document.getElementById(`grade-input-${q.id}`) as HTMLInputElement;
                                        if(el && el.value !== '') {
                                            const parsed = Number(el.value);
                                            handleGrade(q.id, parsed, q.max_score);
                                        }
                                    }}
                                    disabled={updatingQ === q.id}
                                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition"
                                >
                                    {updatingQ === q.id ? 'Saving...' : 'Update Grade'}
                                </button>
                                {score !== undefined && <span className="text-xs text-green-600 font-bold ml-2 flex items-center">
                                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                                    Saved
                                </span>}
                            </div>
                        </div>
                    )}
                    
                    {isManual && currentUser.role === 'student' && (
                         <div className="flex items-start p-3 bg-blue-50 text-blue-700 text-sm rounded">
                            {score !== undefined ? (
                                <span className="font-bold">Instructor Grade: {score} / {q.max_score}</span>
                            ) : (
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
                                    This question is pending manual grading by an instructor.
                                </div>
                            )}
                        </div>
                    )}
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};