import React, { useEffect, useState } from 'react';
import { StudentExamSession, Exam } from '../types';
import { fetchExams, getStudentResults } from '../services/api';
import { Link } from 'react-router-dom';

export const Results: React.FC<{ currentUser: { id: string } }> = ({ currentUser }) => {
  const [results, setResults] = useState<StudentExamSession[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    const load = async () => {
      const [r, e] = await Promise.all([getStudentResults(currentUser.id), fetchExams()]);
      setResults(r);
      setExams(e);
    };
    load();
  }, [currentUser.id]);

  const getExamTitle = (id: string) => exams.find(e => e.id === id)?.title || 'Unknown Exam';

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Results</h1>
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exam</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Taken</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.map((res, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{getExamTitle(res.examId)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(res.startTime).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Submitted
                    </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                    {res.score !== undefined ? res.score : 'Pending'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link to={`/result/${res.examId}/${currentUser.id}`} className="text-blue-600 hover:text-blue-900 hover:underline">
                        View Breakdown
                    </Link>
                </td>
              </tr>
            ))}
            {results.length === 0 && (
                <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No results found. Go take an exam!</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};