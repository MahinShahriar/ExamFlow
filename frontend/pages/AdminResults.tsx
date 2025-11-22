import React, { useEffect, useState } from 'react';
import { Exam, StudentExamSession } from '../types';
import { fetchExams, getAllExamResults } from '../services/api';
import { Link } from 'react-router-dom';

export const AdminResults: React.FC = () => {
  const [results, setResults] = useState<StudentExamSession[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExam, setFilterExam] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const [resData, examData] = await Promise.all([getAllExamResults(), fetchExams()]);
      setResults(resData);
      setExams(examData);
      setLoading(false);
    };
    loadData();
  }, []);

  const getExamTitle = (id: string) => exams.find(e => e.id === id)?.title || 'Unknown Exam';

  const filteredResults = filterExam 
    ? results.filter(r => r.examId === filterExam)
    : results;

  // Statistics
  const totalSubmissions = filteredResults.length;
  const avgScore = totalSubmissions > 0 
    ? (filteredResults.reduce((acc, r) => acc + (r.score || 0), 0) / totalSubmissions).toFixed(1) 
    : '0';

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">All Exam Results</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="text-sm text-gray-500 uppercase font-bold">Total Submissions</div>
          <div className="mt-2 text-3xl font-bold text-gray-800">{totalSubmissions}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="text-sm text-gray-500 uppercase font-bold">Average Score</div>
          <div className="mt-2 text-3xl font-bold text-gray-800">{avgScore}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow flex flex-col justify-center">
           <label className="text-sm text-gray-500 uppercase font-bold mb-2">Filter by Exam</label>
           <select 
             className="w-full border-gray-300 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
             value={filterExam}
             onChange={(e) => setFilterExam(e.target.value)}
           >
             <option value="">All Exams</option>
             {exams.map(e => (
               <option key={e.id} value={e.id}>{e.title}</option>
             ))}
           </select>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exam Title</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted At</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Loading results...</td></tr>
            ) : filteredResults.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">No results found.</td></tr>
            ) : (
              filteredResults.map((r, idx) => (
                <tr key={`${r.examId}-${r.studentId}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {r.studentId === 'u2' ? 'Sam Student (u2)' : r.studentId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getExamTitle(r.examId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(r.startTime).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                    {r.score}
                  </td>
                   <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link to={`/result/${r.examId}/${r.studentId}`} className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded border border-blue-200 hover:bg-blue-100 transition">
                        View Details
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};