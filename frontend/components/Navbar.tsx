import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path ? 'bg-blue-700' : '';

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
      navigate('/login');
    }
  };

  return (
    <nav className="bg-blue-600 text-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold tracking-tight">ExamFlow</Link>
            
            {user && user.role === 'admin' && (
              <div className="hidden md:flex space-x-4">
                <Link to="/admin/questions" className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition ${isActive('/admin/questions')}`}>Question Bank</Link>
                <Link to="/admin/exams" className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition ${isActive('/admin/exams')}`}>Exams</Link>
                <Link to="/admin/results" className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition ${isActive('/admin/results')}`}>Results</Link>
              </div>
            )}

            {user && user.role === 'student' && (
               <div className="hidden md:flex space-x-4">
                <Link to="/student/dashboard" className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition ${isActive('/student/dashboard')}`}>My Exams</Link>
                <Link to="/student/results" className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition ${isActive('/student/results')}`}>My Results</Link>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-sm opacity-90 hidden sm:inline">
                  Signed in as: <strong>{user.email}</strong>
                </span>
                <button 
                  onClick={handleLogout}
                  className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wide hover:bg-red-600 transition shadow-sm"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="space-x-2">
                <Link to="/login" className="bg-white text-blue-600 px-3 py-1.5 rounded text-sm font-bold hover:bg-blue-50 transition">Login</Link>
                <Link to="/register" className="bg-blue-700 text-white border border-blue-500 px-3 py-1.5 rounded text-sm font-bold hover:bg-blue-800 transition">Register</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};