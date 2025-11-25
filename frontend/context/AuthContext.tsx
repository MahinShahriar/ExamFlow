import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { login as apiLogin, register as apiRegister, getCurrentUser } from '../services/api';
import { useNotification } from './NotificationContext';
import axios from 'axios';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotification();

  useEffect(() => {
    // Check for token on load
    const token = localStorage.getItem('authToken');
    if (token) {
      // ensure axios will send the token on subsequent requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      getCurrentUser(token)
        .then(u => {
          if (u) setUser(u);
          else {
            localStorage.removeItem('authToken');
            delete axios.defaults.headers.common['Authorization'];
          }
        })
        .catch(() => {
          localStorage.removeItem('authToken');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, pass: string) => {
    try {
      const res = await apiLogin(email, pass);
      localStorage.setItem('authToken', res.token);
      // set default header for axios so other API calls include the bearer token
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.token}`;
      setUser(res.user);
      addNotification('success', `Welcome back, ${res.user.full_name}!`);
    } catch (e: any) {
      addNotification('error', e.message || 'Login failed');
      throw e;
    }
  };

  const register = async (name: string, email: string, pass: string) => {
    try {
      const res = await apiRegister(name, email, pass);
      localStorage.setItem('authToken', res.token);
      // ensure axios will send the token on subsequent requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.token}`;
      setUser(res.user);
      addNotification('success', 'Registration successful! Welcome.');
    } catch (e: any) {
      addNotification('error', e.message || 'Registration failed');
      throw e;
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    // remove default auth header
    delete axios.defaults.headers.common['Authorization'];
    addNotification('info', 'You have been logged out.');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};