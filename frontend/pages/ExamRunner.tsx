import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Question, QuestionType, StudentExamSession } from '../types';
import { fetchExams, fetchAllQuestions, startExamSession, saveExamProgress, submitExam, uploadMedia } from '../services/api';

export const ExamRunner: React.FC<{ currentUser: { id: string } }> = ({ currentUser }) => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  
  const [session, setSession] = useState<StudentExamSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingImageForQ, setUploadingImageForQ] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (examId) {
      initializeExam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // Timer Effect - Runs independently of session content
  useEffect(() => {
    if (!session || session.status === 'submitted') return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
           clearInterval(timer);
           return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session?.status]); 

  // Auto-submit watcher
  useEffect(() => {
    if (timeLeft === 0 && session && session.status !== 'submitted' && !loading && session.startTime > 0) {
       // Time ran out, submit automatically without confirmation
       // Ensure we only do this if session is loaded and active
       handleFinishExam(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, session, loading]);

  // Fallback auto-save watcher (debounced shorter)
  useEffect(() => {
    if (!session || session.status === 'submitted' || loading) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // keep a short debounce as a fallback
    saveTimeoutRef.current = setTimeout(() => {
      const updatedSession = { ...session, remainingSeconds: timeLeft };
      // best-effort save
      saveExamProgress(updatedSession).catch(() => {});
    }, 800);

    return () => {
        if(saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }
  }, [session?.answers, timeLeft, loading]); 

  // Save session on tab close / navigation away so the student can resume
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Persist latest session synchronously to localStorage via saveExamProgress
      try {
        if (session && session.status !== 'submitted') {
          // save synchronously: the implementation writes to localStorage synchronously
          // we won't await since unload disallows async waits
          saveExamProgress({ ...session, remainingSeconds: timeLeft });
        }
      } catch (err) {
        // ignore
      }
      // Standard prompt suppression: do not show a confirmation prompt, but returning undefined is fine
      // e.preventDefault();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (session && session.status !== 'submitted') {
          saveExamProgress({ ...session, remainingSeconds: timeLeft });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, timeLeft]);

  const initializeExam = async () => {
    if(!examId) return;
    try {
      // 1. Start/Resume Session
      const sess = await startExamSession(examId, currentUser.id);
      
      if (sess.status === 'submitted') {
        // If already submitted, redirect to the result detail page
        navigate(`/result/${examId}/${currentUser.id}`);
        return;
      }

      // 2. Load Questions
      const allQuestions = await fetchAllQuestions();
      const exams = await fetchExams();
      const examDef = exams.find(e => e.id === examId);
      
      if(!examDef) throw new Error("Exam def missing");

      // Filter and order questions as per exam definition
      const examQuestions = examDef.question_ids
        .map(id => allQuestions.find(q => q.id === id))
        .filter(q => q !== undefined) as Question[];

      setQuestions(examQuestions);
      setSession(sess);
      setTimeLeft(sess.remainingSeconds);
      setLoading(false);
    } catch (e) {
      console.error(e);
      alert("Failed to load exam");
      navigate('/student/dashboard');
    }
  };

  const saveProgressNow = async (sessToSave: StudentExamSession | null) => {
    if (!sessToSave) return;
    try {
      setSaving(true);
      await saveExamProgress({ ...sessToSave, remainingSeconds: timeLeft });
    } catch (err) {
      console.error('Auto-save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAnswerChange = (val: any) => {
    if (!session) return;
    const currentQ = questions[currentQIndex];
    if (!currentQ) return;

    const updatedSession: StudentExamSession = {
      ...session,
      answers: {
        ...session.answers,
        [currentQ.id]: val
      }
    };

    // update state and immediately persist the change
    setSession(updatedSession);
    // cancel any scheduled debounce
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveProgressNow(updatedSession);
  };

  const handleFinishExam = async (manual = true) => {
    if (!session || loading) return;
    
    if (manual) {
        const confirm = window.confirm("Are you sure you want to submit? You cannot change answers after submission.");
        if (!confirm) return;
    }

    setLoading(true);
    setSaving(false); // Stop showing saving indicator during submit
    
    // Cancel any pending auto-save
    if(saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    try {
        await submitExam({ ...session, remainingSeconds: timeLeft });
        // Redirect to result detail page for this exam/student
        navigate(`/result/${examId}/${currentUser.id}`);
    } catch (error) {
        console.error("Submission failed", error);
        setLoading(false);
        alert("Failed to submit exam. Please try again.");
    }
  };

  const formatTime = (sec: number) => {
    if (sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading || !session) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">
                {session ? 'Submitting Exam...' : 'Loading Exam Environment...'}
            </p>
        </div>
    </div>
  );

  const currentQ = questions[currentQIndex];
  const currentAnswer = session.answers[currentQ.id];

  const handleImageSelect = async (file: File | null) => {
    if (!file || !session) return;
    const currentQ = questions[currentQIndex];
    if (!currentQ) return;

    try {
      setUploadingImageForQ(currentQ.id);
      const res = await uploadMedia(file);
      // store the returned URL as the answer for this question
      const updatedSession: StudentExamSession = {
        ...session,
        answers: {
          ...session.answers,
          [currentQ.id]: res.url
        }
      };
      setSession(updatedSession);
      // persist immediately
      await saveProgressNow(updatedSession);
    } catch (err) {
      console.error('Image upload failed', err);
      alert('Failed to upload image');
    } finally {
      setUploadingImageForQ(null);
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow p-4 flex flex-col sm:flex-row justify-between items-center px-4 sm:px-8 gap-4">
        <div>
            <h2 className="font-bold text-lg text-gray-800">Exam in Progress</h2>
            <span className="text-xs text-gray-500">Question {currentQIndex + 1} of {questions.length}</span>
        </div>
        <div className="flex items-center space-x-6">
            <div className={`flex items-center px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                saving ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
            }`}>
                {saving ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-yellow-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                    </>
                ) : (
                    <>
                        <span className="mr-1">✓</span> Saved
                    </>
                )}
            </div>
            <div className={`text-xl font-mono font-bold ${timeLeft < 300 ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
                {formatTime(timeLeft)}
            </div>
            <button 
                onClick={() => handleFinishExam(true)}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Submitting...' : 'Finish Exam'}
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Navigation Palette */}
        <div className="w-64 bg-white border-r overflow-y-auto p-4 hidden md:block">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-4">Question Palette</h3>
            <div className="grid grid-cols-4 gap-2">
                {questions.map((q, idx) => {
                    const isAnswered = session.answers[q.id] !== undefined;
                    const isCurrent = idx === currentQIndex;
                    return (
                        <button
                            key={q.id}
                            onClick={() => setCurrentQIndex(idx)}
                            className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition
                                ${isCurrent ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 
                                  isAnswered ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {idx + 1}
                        </button>
                    );
                })}
            </div>
        </div>

        {/* Center: Question */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-6 sm:p-8 min-h-[400px]">
                <div className="mb-6">
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded uppercase">{currentQ.type.replace('_', ' ')}</span>
                    <span className="ml-2 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Marks: {currentQ.max_score}</span>
                </div>
                
                <h1 className="text-xl font-medium text-gray-900 mb-8 leading-relaxed">
                    {currentQ.title}
                </h1>

                {/* Question Input Rendering */}
                <div className="space-y-4">
                    {currentQ.type === QuestionType.SINGLE_CHOICE && currentQ.options?.map((opt, i) => (
                        <label key={i} className={`flex items-center p-4 border rounded-lg cursor-pointer transition ${currentAnswer === opt ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}>
                            <input 
                                type="radio" 
                                name={`q-${currentQ.id}`} 
                                value={opt}
                                checked={currentAnswer === opt}
                                onChange={() => handleAnswerChange(opt)}
                                className="h-4 w-4 text-blue-600"
                            />
                            <span className="ml-3 text-gray-700">{opt}</span>
                        </label>
                    ))}

                    {currentQ.type === QuestionType.MULTI_CHOICE && currentQ.options?.map((opt, i) => (
                        <label key={i} className={`flex items-center p-4 border rounded-lg cursor-pointer transition ${currentAnswer?.includes(opt) ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}>
                            <input 
                                type="checkbox" 
                                checked={currentAnswer?.includes(opt) || false}
                                onChange={(e) => {
                                    const current = currentAnswer || [];
                                    const newVal = e.target.checked 
                                        ? [...current, opt]
                                        : current.filter((x: string) => x !== opt);
                                    handleAnswerChange(newVal);
                                }}
                                className="h-4 w-4 text-blue-600 rounded"
                            />
                            <span className="ml-3 text-gray-700">{opt}</span>
                        </label>
                    ))}

                    {currentQ.type === QuestionType.TEXT && (
                        <textarea
                            className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={6}
                            placeholder="Type your answer here..."
                            value={currentAnswer || ''}
                            onChange={(e) => handleAnswerChange(e.target.value)}
                        />
                    )}

                    {currentQ.type === QuestionType.IMAGE_UPLOAD && (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition">
                           <input type="file" className="hidden" id={`img-upload-${currentQ.id}`} onChange={(e) => {
                             const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                             handleImageSelect(f);
                           }} accept="image/*" />
                           <label htmlFor={`img-upload-${currentQ.id}`} className="cursor-pointer flex flex-col items-center">
                               <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                               <span className="text-sm text-gray-600">{session.answers[currentQ.id] ? `Uploaded` : 'Click to upload image'}</span>
                           </label>
                           {uploadingImageForQ === currentQ.id && <div className="text-xs text-gray-500 mt-2">Uploading...</div>}
                           {session.answers[currentQ.id] && (
                             <div className="mt-4">
                               <img src={session.answers[currentQ.id]} alt="uploaded" className="max-h-40 mx-auto rounded" />
                             </div>
                           )}
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-3xl mx-auto mt-6 flex justify-between">
                <button 
                    onClick={async () => {
                      // Save before navigating back
                      await saveProgressNow(session);
                      setCurrentQIndex(prev => Math.max(0, prev - 1));
                    }}
                    disabled={currentQIndex === 0}
                    className="px-6 py-2 bg-white border rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 shadow-sm"
                >
                    Previous
                </button>
                <button 
                    onClick={async () => {
                      // Save before moving forward
                      await saveProgressNow(session);
                      setCurrentQIndex(prev => Math.min(questions.length - 1, prev + 1));
                    }}
                    disabled={currentQIndex === questions.length - 1}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                >
                    Next
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};