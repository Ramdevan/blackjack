import React, { useState } from 'react';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000/api/auth';

export const Login = ({ setAuth }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '',
    phone: '',
    emailOrPhone: '' // New field for login
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (isRegister && formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match');
    }

    setIsLoading(true);
    
    try {
      const endpoint = isRegister ? '/register' : '/login';
      const payload = isRegister 
        ? { 
            username: formData.username, 
            password: formData.password,
            name: formData.name,
            email: formData.email,
            phone: formData.phone
          }
        : { 
            emailOrPhone: formData.emailOrPhone, 
            password: formData.password 
          };

      const res = await axios.post(`${BACKEND_URL}${endpoint}`, payload);
      
      if (isRegister) {
        setSuccess('Registration successful! Please sign in to continue.');
        setIsRegister(false);
        // Clear registration specific fields but keep email/phone for login if possible
        setFormData({
          ...formData,
          emailOrPhone: formData.email || formData.phone,
          password: '',
          confirmPassword: ''
        });
      } else {
        localStorage.setItem('token', res.data.token);
        setAuth(res.data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel p-10 rounded-3xl w-full relative overflow-hidden border border-white/10 max-h-[90vh] overflow-y-auto custom-scrollbar">
      {/* Decorative Elements */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl"></div>
      
      <div className="relative z-10">
        <div className="text-center mb-8">
          <div className="inline-block p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-4 border border-white/5">
            <span className="text-4xl">♠️</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-white mb-2">
            {isRegister ? 'Join the Table' : 'Welcome Back'}
          </h2>
          <p className="text-slate-400 text-sm font-medium">
            {isRegister ? 'Create an account and get $1000 credits' : 'Login to continue your winning streak'}
          </p>
        </div>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 mb-6 rounded-xl text-red-400 text-sm flex items-center gap-3 animate-pulse">
            <span className="text-lg">⚠️</span>
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/20 p-4 mb-6 rounded-xl text-green-400 text-sm flex items-center gap-3 animate-bounce">
            <span className="text-lg">✅</span>
            {success}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {!isRegister ? (
            <div className="space-y-2">
              <label className="block text-slate-400 text-xs uppercase tracking-widest font-bold ml-1">Email Address or Phone Number</label>
              <input
                type="text"
                name="emailOrPhone"
                className="auth-input w-full rounded-xl px-5 py-4 outline-none placeholder:text-slate-600"
                placeholder="Enter email or phone"
                value={formData.emailOrPhone}
                onChange={handleInputChange}
                required
              />
            </div>
          ) : (
            <>

              <div className="space-y-2">
                <label className="block text-slate-400 text-xs uppercase tracking-widest font-bold ml-1">Full Name</label>
                <input
                  type="text"
                  name="name"
                  className="auth-input w-full rounded-xl px-5 py-4 outline-none placeholder:text-slate-600"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-slate-400 text-xs uppercase tracking-widest font-bold ml-1">Email Address</label>
                <input
                  type="email"
                  name="email"
                  className="auth-input w-full rounded-xl px-5 py-4 outline-none placeholder:text-slate-600"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-slate-400 text-xs uppercase tracking-widest font-bold ml-1">Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  className="auth-input w-full rounded-xl px-5 py-4 outline-none placeholder:text-slate-600"
                  placeholder="+1 (555) 000-0000"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </>
          )}
          
          <div className="space-y-2">
            <label className="block text-slate-400 text-xs uppercase tracking-widest font-bold ml-1">Password</label>
            <input
              type="password"
              name="password"
              className="auth-input w-full rounded-xl px-5 py-4 outline-none placeholder:text-slate-600"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleInputChange}
              required
            />
          </div>

          {isRegister && (
            <div className="space-y-2">
              <label className="block text-slate-400 text-xs uppercase tracking-widest font-bold ml-1">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                className="auth-input w-full rounded-xl px-5 py-4 outline-none placeholder:text-slate-600"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
              />
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="auth-button w-full text-white font-black py-4 rounded-xl shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-4"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              isRegister ? 'REGISTER & PLAY' : 'SIGN IN'
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); setSuccess(''); }}
            className="text-slate-400 hover:text-white text-sm font-bold transition-colors"
          >
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register here"}
          </button>
        </div>
      </div>
    </div>
  );
};
