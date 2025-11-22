import React, { useEffect, useState } from 'react';
import { Exam, Question } from '../types';
import { fetchExams, fetchAllQuestions, createExam, updateExam, publishExam, deleteExam } from '../services/api';
import { useNotification } from '../context/NotificationContext';

export const ExamManager: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  // Intern: state for question search inputs
  const [qTitleSearch, setQTitleSearch] = useState('');
  const [qComplexitySearch, setQComplexitySearch] = useState('');
  const [qTagSearch, setQTagSearch] = useState('');
  const [appliedQFilters, setAppliedQFilters] = useState({ title: '', complexity: '', tag: '' });

  // Intern: form state for new or edited exam
  const [newExam, setNewExam] = useState<Partial<Exam>>({
    title: '',
    duration_minutes: 60,
    question_ids: [],
    is_published: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [eData, qData] = await Promise.all([fetchExams(), fetchAllQuestions()]);
      setExams(eData);
      setQuestions(qData);
    } catch (err) {
      console.error('Failed to load exams/questions', err);
      setExams([]);
      setQuestions([]);
    }
  };

  const resetFilters = () => {
    // Intern: clear search inputs and applied filters
    setQTitleSearch('');
    setQComplexitySearch('');
    setQTagSearch('');
    setAppliedQFilters({ title: '', complexity: '', tag: '' });
  };

  const handleCreateOrUpdate = async () => {
    if (!newExam.title || !newExam.start_time || !newExam.end_time || (newExam.question_ids?.length || 0) === 0) {
      alert("Please fill all fields and select at least one question.");
      return;
    }

    // Validate that start_time is strictly before end_time
    try {
      const startTs = new Date(newExam.start_time!).getTime();
      const endTs = new Date(newExam.end_time!).getTime();
      if (isNaN(startTs) || isNaN(endTs)) {
        addNotification('error', 'Invalid start or end time');
        return;
      }
      if (startTs >= endTs) {
        addNotification('error', 'Start time must be before end time');
        return;
      }
    } catch (err) {
      addNotification('error', 'Invalid date values');
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        await updateExam({ ...(newExam as Exam), id: editingId });
        addNotification('success', 'Exam updated successfully');
      } else {
        await createExam(newExam as Exam);
        addNotification('success', 'Exam created successfully');
      }
      setIsCreating(false);
      setEditingId(null);
      setNewExam({ title: '', duration_minutes: 60, question_ids: [], is_published: false });
      resetFilters();
      await loadData();
    } catch (e: any) {
      console.error('Create/Update exam failed', e);
      addNotification('error', e?.message || 'Failed to save exam');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (exam: Exam) => {
    setEditingId(exam.id);
    setNewExam({ ...exam });
    resetFilters();
    setIsCreating(true);
  };

  const handleCancel = () => {
    // Intern: stop creating or editing, clear form
    setIsCreating(false);
    setEditingId(null);
    setNewExam({ title: '', duration_minutes: 60, question_ids: [], is_published: false });
    resetFilters();
  };

  const toggleQuestion = (qId: string) => {
    const current = newExam.question_ids || [];
    if (current.includes(qId)) {
      setNewExam({ ...newExam, question_ids: current.filter(id => id !== qId) });
    } else {
      setNewExam({ ...newExam, question_ids: [...current, qId] });
    }
  };

  const handlePublishToggle = async (exam: Exam) => {
      try {
        await publishExam(exam.id, !exam.is_published);
        addNotification('success', exam.is_published ? 'Exam unpublished' : 'Exam published');
        await loadData();
      } catch (e: any) {
        console.error('Publish toggle failed', e);
        addNotification('error', e?.message || 'Failed to toggle publish');
      }
   }

  const handleSearch = () => {
    // Intern: apply filter inputs to search
    setAppliedQFilters({
      title: qTitleSearch,
      complexity: qComplexitySearch,
      tag: qTagSearch
    });
  };

  // Intern: format ISO time to input[type=datetime-local] value
  const formatDateForInput = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
  };

  // Filter questions for selection
  const filteredQuestions = questions.filter(q => {
    const matchTitle = q.title.toLowerCase().includes(appliedQFilters.title.toLowerCase());
    const matchComplexity = q.complexity.toLowerCase().includes(appliedQFilters.complexity.toLowerCase());
    const matchTag = appliedQFilters.tag === '' || (q.tags || []).some(t => t.toLowerCase().includes(appliedQFilters.tag.toLowerCase()));
    return matchTitle && matchComplexity && matchTag;
  });

  if (isCreating) {
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <h2 className="text-2xl font-bold mb-6">{editingId ? 'Edit Exam' : 'Create New Exam'}</h2>
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exam Title</label>
            <input 
              type="text" 
              className="w-full border rounded px-3 py-2"
              value={newExam.title}
              onChange={e => setNewExam({...newExam, title: e.target.value})}
              placeholder="e.g. Final Physics Exam"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input 
                type="datetime-local" 
                className="w-full border rounded px-3 py-2"
                value={formatDateForInput(newExam.start_time)}
                onChange={e => setNewExam({...newExam, start_time: new Date(e.target.value).toISOString()})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input 
                type="datetime-local" 
                className="w-full border rounded px-3 py-2"
                value={formatDateForInput(newExam.end_time)}
                onChange={e => setNewExam({...newExam, end_time: new Date(e.target.value).toISOString()})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Minutes)</label>
            <input 
              type="number" 
              className="w-full border rounded px-3 py-2"
              value={newExam.duration_minutes}
              onChange={e => setNewExam({...newExam, duration_minutes: parseInt(e.target.value)})}
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-4">
                <label className="block text-sm font-medium text-gray-700">Select Questions ({newExam.question_ids?.length} selected)</label>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4 items-end bg-gray-50 p-3 rounded">
                <div className="col-span-1">
                    <input 
                        type="text"
                        placeholder="Title..."
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={qTitleSearch}
                        onChange={(e) => setQTitleSearch(e.target.value)}
                    />
                </div>
                <div className="col-span-1">
                    <input 
                        type="text"
                        placeholder="Complexity..."
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={qComplexitySearch}
                        onChange={(e) => setQComplexitySearch(e.target.value)}
                    />
                </div>
                <div className="col-span-1">
                    <input 
                        type="text"
                        placeholder="Tag..."
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={qTagSearch}
                        onChange={(e) => setQTagSearch(e.target.value)}
                    />
                </div>
                <div className="col-span-1">
                    <button 
                        onClick={handleSearch}
                        className="w-full bg-gray-600 text-white rounded px-2 py-1 text-sm hover:bg-gray-700 h-[30px]"
                    >
                        Search
                    </button>
                </div>
            </div>

            <div className="border rounded h-64 overflow-y-auto p-2 space-y-2 bg-gray-50">
              {filteredQuestions.map(q => (
                <div key={q.id} className="flex items-start space-x-2 p-2 bg-white rounded border hover:bg-blue-50 cursor-pointer" onClick={() => toggleQuestion(q.id)}>
                  <input 
                    type="checkbox" 
                    checked={newExam.question_ids?.includes(q.id)}
                    readOnly
                    className="mt-1"
                  />
                  <div className="text-sm">
                    <p className="font-medium">{q.title}</p>
                    <p className="text-xs text-gray-500">{q.type} | {q.complexity} | {q.tags?.join(', ')}</p>
                  </div>
                </div>
              ))}
              {filteredQuestions.length === 0 && (
                <div className="text-center text-gray-500 py-4 text-sm">No questions match your search.</div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button 
              onClick={handleCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreateOrUpdate}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (editingId ? 'Update Exam' : 'Create Exam')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Exam Management</h1>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Exam
        </button>
      </div>

      <div className="grid gap-6">
        {exams.map(exam => (
          <div key={exam.id} className="bg-white p-6 rounded-lg shadow flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{exam.title}</h3>
              <p className="text-sm text-gray-600">
                {new Date(exam.start_time).toLocaleString()} - {new Date(exam.end_time).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Duration: {exam.duration_minutes} mins | Questions: {exam.question_ids.length}
              </p>
            </div>
            <div className="flex items-center space-x-4">
               <span className={`px-3 py-1 rounded-full text-xs font-bold ${exam.is_published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                   {exam.is_published ? 'Published' : 'Draft'}
               </span>
               
               {!exam.is_published && (
                 <button 
                   onClick={() => handleEdit(exam)}
                   className="text-sm text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-3 py-1 rounded hover:bg-blue-50"
                 >
                   Edit
                 </button>
               )}

               <button 
                 onClick={() => handlePublishToggle(exam)}
                 className={`text-sm font-medium hover:underline ${exam.is_published ? 'text-red-600' : 'text-green-600'}`}
               >
                 {exam.is_published ? 'Unpublish' : 'Publish'}
               </button>

               <button
                 onClick={async () => {
                   if (!window.confirm('Delete this exam? This action cannot be undone.')) return;
                   try {
                     await deleteExam(exam.id);
                     addNotification('error', 'Exam deleted successfully');
                     await loadData();
                   } catch (e: any) {
                     console.error('Delete exam failed', e);
                     addNotification('error', e?.message || 'Failed to delete exam');
                   }
                 }}
                 className="text-sm text-red-600 hover:text-red-800 font-medium border border-red-200 px-3 py-1 rounded hover:bg-red-50"
               >
                 Delete
               </button>
             </div>
           </div>
         ))}
         {exams.length === 0 && <p className="text-gray-500 text-center py-8">No exams created yet.</p>}
       </div>
     </div>
   );
 };
