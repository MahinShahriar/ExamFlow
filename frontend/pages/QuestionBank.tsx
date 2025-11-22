import React, { useEffect, useState } from 'react';
import { Question, QuestionType } from '../types';
import { fetchQuestions, uploadExcelQuestions, confirmImportQuestions, getQuestionById } from '../services/api';
import { useNotification } from '../context/NotificationContext';

export const QuestionBank: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<Question[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const PER_PAGE = 20; // 20 questions per page

  // View Details State
  const [viewingQuestion, setViewingQuestion] = useState<Question | null>(null);

  // Filter State
  const [titleSearch, setTitleSearch] = useState('');
  const [complexitySearch, setComplexitySearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ title: '', complexity: '', tag: '' });

  // Editing State within Preview
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Question | null>(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async (params?: { search?: string; tags?: string[]; page?: number }) => {
    setLoading(true);
    try {
      const page = params?.page && params.page > 0 ? params.page : currentPage;
      const resp = await fetchQuestions({ search: params?.search, tags: params?.tags, page, per_page: PER_PAGE });
      setQuestions(resp.items || []);
      setTotalItems(resp.total || 0);
      setCurrentPage(page);
    } catch (e) {
      console.error('Failed to load questions', e);
      setQuestions([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const parsed = await uploadExcelQuestions(file);
      setPreviewData(parsed);
      setShowPreview(true);
    } catch (err) {
      console.error(err);
      alert("Failed to parse file");
    } finally {
      setUploading(false);
      e.target.value = ''; // reset input
    }
  };

  const { addNotification } = useNotification();

  const handleConfirmImport = async () => {
    setLoading(true);
    try {
      const res = await confirmImportQuestions(previewData);
      // Use backend/fallback message if available
      const msg = (res && (res.message || (res as any).message)) || `${previewData.length} questions saved successfully!`;
      addNotification('success', msg);
      setShowPreview(false);
      setPreviewData([]);
      // Reload from backend starting at page 1
      const combined = [appliedFilters.title, appliedFilters.complexity].filter(Boolean).join(' ');
      await loadQuestions({ search: combined || undefined, tags: appliedFilters.tag ? [appliedFilters.tag] : undefined, page: 1 });
    } catch (e: any) {
      console.error('Import failed', e);
      addNotification('error', e?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setAppliedFilters({
      title: titleSearch,
      complexity: complexitySearch,
      tag: tagSearch
    });

    // Build backend params: use titleSearch + complexitySearch in search, tags from tagSearch (comma separated)
    const params: { search?: string; tags?: string[]; page?: number } = {};
    const combinedSearch = [titleSearch, complexitySearch].filter(s => s && s.trim().length > 0).join(' ');
    if (combinedSearch) params.search = combinedSearch;
    if (tagSearch && tagSearch.trim().length > 0) params.tags = tagSearch.split(',').map(t => t.trim()).filter(Boolean);
    // Reset to page 1 on new search
    params.page = 1;
    loadQuestions(params);
  };

  // Preview Edit Handlers
  const handleRemoveQ = (id: string) => {
    if(!window.confirm("Remove this question from import?")) return;
    
    // Filter by ID instead of index for safer removal
    const newData = previewData.filter(q => q.id !== id);
    setPreviewData(newData);
    
    // Reset edit state if we are modifying the list to prevent index mismatches
    setEditingIndex(null);
    setEditForm(null);

    if (newData.length === 0) setShowPreview(false);
  };

  const handleEditQ = (index: number) => {
    setEditingIndex(index);
    setEditForm(JSON.parse(JSON.stringify(previewData[index])));
  };

  const handleSaveQ = () => {
    if (editForm && editingIndex !== null) {
      const newData = [...previewData];
      newData[editingIndex] = editForm;
      setPreviewData(newData);
      setEditingIndex(null);
      setEditForm(null);
    }
  };

  const handleOptionChange = (idx: number, val: string) => {
    if (!editForm) return;
    const newOpts = [...(editForm.options || [])];
    newOpts[idx] = val;
    setEditForm({ ...editForm, options: newOpts });
  };

  const addOption = () => {
    if (!editForm) return;
    setEditForm({ ...editForm, options: [...(editForm.options || []), `Option ${(editForm.options?.length || 0) + 1}`] });
  };

  const removeOption = (idx: number) => {
    if (!editForm) return;
    const newOpts = [...(editForm.options || [])];
    newOpts.splice(idx, 1);
    setEditForm({ ...editForm, options: newOpts });
  };

  // When using server-side pagination, use the questions array from backend directly.
  const filteredQuestions = questions;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Question Bank</h1>
        <div className="flex gap-4">
           <div className="relative">
             <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
             />
             <button className={`px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition flex items-center ${uploading ? 'opacity-50' : ''}`}>
               {uploading ? 'Parsing...' : 'Import Excel'}
             </button>
           </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Filter Questions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">By Title</label>
            <input 
              type="text"
              placeholder="Search title..."
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={titleSearch}
              onChange={(e) => setTitleSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">By Complexity</label>
            <input 
              type="text"
              placeholder="Search complexity..."
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={complexitySearch}
              onChange={(e) => setComplexitySearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">By Tag</label>
            <input 
              type="text"
              placeholder="Search tag..."
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-medium h-[38px]"
          >
            Search
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading questions...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
            {filteredQuestions.map(q => (
                <div key={q.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow duration-200">
                    <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                            <div className="flex items-center space-x-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                    q.type === QuestionType.SINGLE_CHOICE || q.type === QuestionType.MULTI_CHOICE 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-purple-100 text-purple-800'
                                }`}>
                                    {q.type.replace('_', ' ')}
                                </span>
                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
                                    {q.complexity}
                                </span>
                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-700 border border-green-100">
                                    Score: {q.max_score}
                                </span>
                            </div>
                            
                            <h3 className="text-lg font-semibold text-gray-900">{q.title}</h3>
                            
                            {q.tags && q.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {q.tags.map((tag, idx) => (
                                        <span key={idx} className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full border">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <button 
                            onClick={async () => {
                              // fetch full details from backend
                              try {
                                const detailed = await getQuestionById(q.id);
                                if (detailed) setViewingQuestion(detailed);
                                else setViewingQuestion(q);
                              } catch (e) {
                                console.error('Failed to fetch question details', e);
                                setViewingQuestion(q);
                              }
                            }}
                            className="ml-4 shrink-0 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition"
                        >
                            View Details
                        </button>
                    </div>
                </div>
            ))}
            
            {filteredQuestions.length === 0 && (
                <div className="text-center py-10 bg-white rounded-lg border border-dashed border-gray-300 text-gray-500">
                    No questions found matching your filters.
                </div>
            )}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalItems > PER_PAGE && (
        <div className="mt-6 flex items-center justify-center space-x-3">
          <button
            onClick={() => { if (currentPage > 1) {
                const combined = [appliedFilters.title, appliedFilters.complexity].filter(Boolean).join(' ');
                loadQuestions({ search: combined || undefined, tags: appliedFilters.tag ? [appliedFilters.tag] : undefined, page: currentPage - 1 });
              } }}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded bg-white disabled:opacity-50"
          >Prev</button>

          {/* Simple page numbers around current */}
          {Array.from({ length: Math.ceil(totalItems / PER_PAGE) }).map((_, idx) => {
            const pageNum = idx + 1;
            // only show nearby pages to avoid too many buttons
            if (Math.abs(pageNum - currentPage) > 3 && pageNum !== 1 && pageNum !== Math.ceil(totalItems / PER_PAGE)) return null;
            return (
              <button key={pageNum}
                onClick={() => {
                  const combined = [appliedFilters.title, appliedFilters.complexity].filter(Boolean).join(' ');
                  loadQuestions({ search: combined || undefined, tags: appliedFilters.tag ? [appliedFilters.tag] : undefined, page: pageNum });
                }}
                className={`px-3 py-1 border rounded ${pageNum === currentPage ? 'bg-blue-600 text-white' : 'bg-white'}`}
              >{pageNum}</button>
            );
          })}

          <button
            onClick={() => { if (currentPage < Math.ceil(totalItems / PER_PAGE)) {
                const combined = [appliedFilters.title, appliedFilters.complexity].filter(Boolean).join(' ');
                loadQuestions({ search: combined || undefined, tags: appliedFilters.tag ? [appliedFilters.tag] : undefined, page: currentPage + 1 });
              } }}
            disabled={currentPage >= Math.ceil(totalItems / PER_PAGE)}
            className="px-3 py-1 border rounded bg-white disabled:opacity-50"
          >Next</button>
        </div>
      )}

     {/* Question Detail Modal */}
     {viewingQuestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-bold text-gray-800">Question Details</h2>
                    <button onClick={() => setViewingQuestion(null)} className="text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Title</h3>
                        <p className="text-lg text-gray-900 font-medium">{viewingQuestion.title}</p>
                    </div>

                    {viewingQuestion.description && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Description</h3>
                            <div className="bg-gray-50 p-3 rounded text-gray-700 text-sm border">
                                {/* description may contain HTML from backend, render safely as text */}
                                <div dangerouslySetInnerHTML={{ __html: viewingQuestion.description }} />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 p-3 rounded border">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Type</h3>
                            <p className="font-medium capitalize">{viewingQuestion.type.replace('_', ' ')}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded border">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Complexity</h3>
                            <p className="font-medium">{viewingQuestion.complexity}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded border">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Max Score</h3>
                            <p className="font-medium">{viewingQuestion.max_score}</p>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Tags</h3>
                        <div className="flex flex-wrap gap-2">
                            {viewingQuestion.tags?.map((tag, i) => (
                                <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                                    #{tag}
                                </span>
                            ))}
                            {(!viewingQuestion.tags || viewingQuestion.tags.length === 0) && <span className="text-gray-400 italic text-sm">No tags</span>}
                        </div>
                    </div>

                    {/* Options / Correct Answer */}
                    <div className="border-t pt-6">
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4">Answer Configuration</h3>
                        
                        {(viewingQuestion.type === QuestionType.SINGLE_CHOICE || viewingQuestion.type === QuestionType.MULTI_CHOICE) && (
                            <div className="space-y-2">
                                {viewingQuestion.options?.map((opt, idx) => {
                                    const isCorrect = Array.isArray(viewingQuestion.correct_answers) 
                                        ? viewingQuestion.correct_answers.includes(opt)
                                        : viewingQuestion.correct_answers === opt;
                                    
                                    return (
                                        <div key={idx} className={`flex items-center justify-between p-3 rounded border ${isCorrect ? 'bg-green-50 border-green-200' : 'border-gray-200'}`}>
                                            <span className={`text-sm ${isCorrect ? 'text-green-800 font-medium' : 'text-gray-700'}`}>{opt}</span>
                                            {isCorrect && <span className="text-xs font-bold bg-green-200 text-green-800 px-2 py-1 rounded">CORRECT</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {(viewingQuestion.type === QuestionType.TEXT || viewingQuestion.type === QuestionType.IMAGE_UPLOAD) && (
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Reference Answer / Key:</p>
                                <div className="p-3 bg-gray-100 rounded text-gray-800 font-mono text-sm">
                                    {viewingQuestion.correct_answers as string || 'N/A'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end">
                    <button 
                        onClick={() => setViewingQuestion(null)}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium shadow-sm transition"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Preview Import Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-y-auto flex flex-col">
            {editingIndex !== null && editForm ? (
               // --- EDIT MODE ---
               <div className="flex flex-col h-full">
                 <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Edit Question</h2>
                    <button onClick={() => setEditingIndex(null)} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Question Title</label>
                                <input type="text" className="w-full border rounded px-3 py-2" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea className="w-full border rounded px-3 py-2" rows={3} value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} />
                            </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select 
                                        className="w-full border rounded px-3 py-2" 
                                        value={editForm.type} 
                                        onChange={e => setEditForm({ ...editForm, type: e.target.value as QuestionType, correct_answers: e.target.value === QuestionType.MULTI_CHOICE ? [] : '' })}
                                    >
                                        {Object.values(QuestionType).map(t => (
                                            <option key={t} value={t}>{t.replace('_', ' ')}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Complexity</label>
                                    <input type="text" className="w-full border rounded px-3 py-2" value={editForm.complexity} onChange={e => setEditForm({...editForm, complexity: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Score</label>
                                    <input type="number" className="w-full border rounded px-3 py-2" value={editForm.max_score} onChange={e => setEditForm({...editForm, max_score: parseInt(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                                    <input type="text" className="w-full border rounded px-3 py-2" value={editForm.tags?.join(', ') || ''} onChange={e => setEditForm({...editForm, tags: e.target.value.split(',').map(t => t.trim())})} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 bg-gray-50 p-4 rounded border">
                            <h3 className="font-bold text-sm text-gray-700">Answer Configuration</h3>
                            
                            {(editForm.type === QuestionType.SINGLE_CHOICE || editForm.type === QuestionType.MULTI_CHOICE) && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
                                    <div className="space-y-2">
                                        {editForm.options?.map((opt, i) => (
                                            <div key={i} className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    className="flex-1 border rounded px-2 py-1 text-sm" 
                                                    value={opt} 
                                                    onChange={e => handleOptionChange(i, e.target.value)} 
                                                />
                                                <button onClick={() => removeOption(i)} className="text-red-500 text-sm px-2 hover:bg-red-50 rounded">&times;</button>
                                            </div>
                                        ))}
                                        <button onClick={addOption} className="text-sm text-blue-600 font-medium hover:underline">+ Add Option</button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer(s)</label>
                                {editForm.type === QuestionType.SINGLE_CHOICE ? (
                                    <select 
                                        className="w-full border rounded px-3 py-2" 
                                        value={editForm.correct_answers as string || ''} 
                                        onChange={e => setEditForm({...editForm, correct_answers: e.target.value})}
                                    >
                                        <option value="">Select Correct Option</option>
                                        {editForm.options?.map((opt, i) => (
                                            <option key={i} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                ) : editForm.type === QuestionType.MULTI_CHOICE ? (
                                    <div className="space-y-1 border rounded p-2 bg-white max-h-40 overflow-y-auto">
                                        {editForm.options?.map((opt, i) => (
                                            <label key={i} className="flex items-center space-x-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={(editForm.correct_answers as string[])?.includes(opt)} 
                                                    onChange={(e) => {
                                                        const current = (editForm.correct_answers as string[]) || [];
                                                        const next = e.target.checked ? [...current, opt] : current.filter(x => x !== opt);
                                                        setEditForm({...editForm, correct_answers: next});
                                                    }}
                                                />
                                                <span className="text-sm">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <textarea 
                                        className="w-full border rounded px-3 py-2" 
                                        placeholder="Enter reference answer..."
                                        value={editForm.correct_answers as string || ''}
                                        onChange={e => setEditForm({...editForm, correct_answers: e.target.value})} 
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                 </div>
                 <div className="p-4 border-t bg-gray-50 flex justify-end space-x-4">
                    <button onClick={() => setEditingIndex(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                    <button onClick={handleSaveQ} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Changes</button>
                 </div>
               </div>
            ) : (
               // --- LIST MODE ---
               <div className="flex flex-col h-full">
                    <div className="p-6 border-b flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">Preview Import</h2>
                            <p className="text-sm text-gray-600 mt-1">Reviewing {previewData.length} questions from file.</p>
                        </div>
                        <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
                        <div className="grid grid-cols-1 gap-4">
                            {previewData.map((q, i) => (
                                <div key={q.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 relative group hover:shadow-md transition">
                                    <div className="absolute top-4 right-4 flex space-x-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleEditQ(i)}
                                            className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded"
                                            title="Edit"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRemoveQ(q.id); }}
                                            className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded"
                                            title="Remove"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        </button>
                                    </div>

                                    <div className="pr-20">
                                        <div className="flex items-center space-x-2 mb-2">
                                            <span className="px-2 py-0.5 text-xs font-bold uppercase bg-blue-100 text-blue-800 rounded">{q.type.replace('_', ' ')}</span>
                                            <span className="px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded">Score: {q.max_score}</span>
                                            <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 rounded">{q.complexity}</span>
                                        </div>
                                        <h3 className="text-md font-medium text-gray-900 mb-2">{q.title}</h3>
                                        
                                        {q.description && <p className="text-sm text-gray-500 mb-3 italic">{q.description}</p>}
                                        
                                        {q.tags && q.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {q.tags.map((t, idx) => (
                                                    <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full border">#{t}</span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-3 text-sm bg-gray-50 p-3 rounded border border-gray-100">
                                            <span className="font-semibold text-gray-700 text-xs uppercase tracking-wide block mb-1">Correct Answer:</span>
                                            <span className="text-gray-800 font-mono text-xs">
                                                {Array.isArray(q.correct_answers) ? q.correct_answers.join(', ') : (q.correct_answers || 'N/A')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-6 border-t bg-white flex justify-end space-x-4">
                        <button 
                            onClick={() => setShowPreview(false)} 
                            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                        >
                            Cancel Import
                        </button>
                        <button 
                            onClick={handleConfirmImport} 
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium shadow"
                        >
                            Confirm Import ({previewData.length})
                        </button>
                    </div>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

