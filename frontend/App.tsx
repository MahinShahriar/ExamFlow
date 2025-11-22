import React from 'react';
import axios from 'axios';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { QuestionBank } from './pages/QuestionBank';
import { ExamManager } from './pages/ExamManager';
import { AdminResults } from './pages/AdminResults';
import { StudentDashboard } from './pages/StudentDashboard';
import { ExamRunner } from './pages/ExamRunner';
import { Results } from './pages/Results';
import { ResultDetails } from './pages/ResultDetails';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { NotificationToast } from './components/NotificationToast';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactElement, roles?: string[] }> = ({ children, roles }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Auth Redirect Component (Prevents logged in users from seeing login/register)
const AuthRedirect: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { user, isLoading } = useAuth();
    if (isLoading) return null;
    if (user) {
        return <Navigate to={user.role === 'admin' ? '/admin/questions' : '/student/dashboard'} replace />;
    }
    return children;
}

const AppContent: React.FC = () => {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-gray-50">
        <Navbar />
        <NotificationToast />
        
        <div className="py-6">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
            <Route path="/register" element={<AuthRedirect><Register /></AuthRedirect>} />

            {/* Redirect Root */}
            <Route path="/" element={
                user 
                ? <Navigate to={user.role === 'admin' ? "/admin/questions" : "/student/dashboard"} replace /> 
                : <Navigate to="/login" replace />
            } />

            {/* Admin Routes */}
            <Route path="/admin/questions" element={<ProtectedRoute roles={['admin']}><QuestionBank /></ProtectedRoute>} />
            <Route path="/admin/exams" element={<ProtectedRoute roles={['admin']}><ExamManager /></ProtectedRoute>} />
            <Route path="/admin/results" element={<ProtectedRoute roles={['admin']}><AdminResults /></ProtectedRoute>} />

            {/* Student Routes */}
            <Route path="/student/dashboard" element={<ProtectedRoute roles={['student']}><StudentDashboard /></ProtectedRoute>} />
            <Route path="/student/exam/:examId" element={<ProtectedRoute roles={['student']}><ExamRunner currentUser={user!} /></ProtectedRoute>} />
            <Route path="/student/results" element={<ProtectedRoute roles={['student']}><Results currentUser={user!} /></ProtectedRoute>} />
            
            {/* Shared/Details Route */}
            <Route path="/result/:examId/:studentId" element={<ProtectedRoute><ResultDetails currentUser={user!} /></ProtectedRoute>} />
          </Routes>
        </div>
    </div>
  );
}

const App: React.FC = () => {
  return (
    <HashRouter>
      <NotificationProvider>
        <AuthProvider>
           <AppContent />
        </AuthProvider>
      </NotificationProvider>
    </HashRouter>
  );
};

export default App;