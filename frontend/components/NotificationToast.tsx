import React from 'react';
import { useNotification } from '../context/NotificationContext';

export const NotificationToast: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  const getStyles = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-500 border-green-600 text-white';
      case 'error': return 'bg-red-500 border-red-600 text-white';
      case 'warning': return 'bg-yellow-500 border-yellow-600 text-white';
      default: return 'bg-blue-500 border-blue-600 text-white';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-80 pointer-events-none">
      {notifications.map(n => (
        <div 
          key={n.id} 
          className={`pointer-events-auto px-4 py-3 rounded shadow-lg border flex justify-between items-center animate-fade-in-down ${getStyles(n.type)}`}
        >
          <span className="text-sm font-medium">{n.message}</span>
          <button 
            onClick={() => removeNotification(n.id)}
            className="ml-4 text-white opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};