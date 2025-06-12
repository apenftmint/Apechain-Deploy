
import React, { useState } from 'react';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../../constants'; // ADMIN_SESSION_KEY removed

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username || !password) {
      setError('Username and password are required.');
      setIsLoading(false);
      return;
    }

    // WARNING: This is a mock login for demonstration purposes ONLY.
    // Real applications MUST use a secure backend for authentication.
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        // localStorage.setItem(ADMIN_SESSION_KEY, 'true'); // Removed: Session is not stored in localStorage
        onLoginSuccess();
    } else {
        setError('Invalid username or password.');
    }
    setIsLoading(false);
  };

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-xl mx-auto max-w-md w-full">
      {/* Removed mt-8 and min-h for flex-grow to handle centering */}
      <div className="w-full"> {/* Inner container for form content */}
        <h2 className="text-3xl font-bold text-sky-400 mb-8 text-center">Admin Login</h2>
        <p className="text-xs text-yellow-400 mb-4 p-2 bg-yellow-900/50 rounded-md border border-yellow-700">
          <span className="font-bold">DEMO ONLY:</span> This is a mock admin login. Do not use this pattern in production due to security risks. Credentials are hardcoded.
        </p>
        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-300">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm text-white"
              placeholder="Enter username"
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm text-white"
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-400 bg-red-900/50 p-2 rounded-md border border-red-700">{error}</p>}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-500 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>
        <a href="#/" className="mt-6 block text-center text-sm text-slate-400 hover:text-sky-300 transition-colors">
          &larr; Back to Main Site
        </a>
      </div>
    </div>
  );
};

export default AdminLogin;
