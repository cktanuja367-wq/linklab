import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api, type ConfigStatusResponse } from '../api';
import type { UserProfile } from '../types';

interface WelcomeScreenProps {
  configStatus: ConfigStatusResponse | null;
  onAuthSuccess: (profile: UserProfile, token: string) => Promise<void>;
  onConfigUpdated: () => Promise<void>;
}

type AuthTab = 'student' | 'staff';

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  configStatus,
  onAuthSuccess,
  onConfigUpdated,
}) => {
  const [tab, setTab] = useState<AuthTab>('student');

  // Student Name-Only Login
  const [studentName, setStudentName] = useState('');

  // Unified Faculty / Admin Login (single shared password)
  const [staffRole, setStaffRole] = useState<'faculty' | 'admin'>('faculty');
  const [staffName, setStaffName] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsReady = Boolean(configStatus?.passwordsConfigured);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.studentLogin(studentName.trim());
      await onAuthSuccess(res.profile, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleStaffLoginOrSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedPassword = staffPassword.trim();
    if (trimmedPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setBusy(true);
    try {
      // If no staff password has been set yet, save this single password for BOTH Faculty & Admin first
      if (configStatus && !passwordsReady) {
        await api.setupStaffPasswords({ password: trimmedPassword });
        await onConfigUpdated();
      }

      const res = await api.staffLogin({
        role: staffRole,
        name: staffName.trim() || undefined,
        password: trimmedPassword,
      });
      setStaffPassword('');
      await onAuthSuccess(res.profile, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex flex-col justify-between px-4 py-6 sm:px-8">
      {/* Compact Header without big images */}
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#641E36] text-[#C49A55] flex items-center justify-center font-display font-bold text-lg shadow-sm">
            L
          </div>
          <div>
            <span className="font-display text-xl font-bold text-[#641E36] tracking-tight block leading-none">
              LabLink
            </span>
            <span className="text-[11px] font-medium text-[#8F3453] tracking-wide">
              Discover · Book · Innovate
            </span>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E8D8C8] text-[11px] font-mono-tabular text-[#30252A]/80">
          <Database className="w-3.5 h-3.5 text-[#641E36]" />
          <span>SQLite · India/Karnataka (IST)</span>
        </div>
      </header>

      {/* Clean Focused Sign-In Card (no oversized hero images) */}
      <main className="max-w-lg w-full mx-auto my-8">
        <div className="bg-white border border-[#E8D8C8] rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wider text-[#C49A55] uppercase">
              Campus Laboratory Portal
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#641E36] leading-tight">
              Your ideas deserve the right tools.
            </h1>
            <p className="text-xs text-[#30252A]/75 leading-relaxed">
              Discover specialised lab instruments, check live IST availability, and book verified
              equipment slots.
            </p>
          </div>

          {/* Role Switch Tabs */}
          <div className="flex gap-1.5 p-1 bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl">
            <button
              type="button"
              onClick={() => {
                setTab('student');
                setError(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'student'
                  ? 'bg-[#641E36] text-white'
                  : 'text-[#30252A]/75 hover:text-[#30252A]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Student Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('staff');
                setError(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'staff'
                  ? 'bg-[#641E36] text-white'
                  : 'text-[#30252A]/75 hover:text-[#30252A]'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Faculty / Admin Sign In</span>
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: STUDENT NAME-ONLY LOGIN */}
          {tab === 'student' && (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <p className="text-xs text-[#30252A]/75 bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl px-3.5 py-2.5">
                No registration or password required — enter your name to enter the Student Portal.
              </p>

              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g., Tanuja Sharma"
                  className="w-full px-4 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>{busy ? 'Signing In...' : 'Enter Student Portal'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 2: FACULTY / ADMIN UNIFIED ONE-PASSWORD LOGIN */}
          {tab === 'staff' && (
            <form onSubmit={handleStaffLoginOrSetup} className="space-y-4">
              {configStatus && !passwordsReady && (
                <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#C49A55]/70 text-xs text-[#30252A]/85 flex items-start gap-2">
                  <KeyRound className="w-4 h-4 text-[#641E36] shrink-0 mt-0.5" />
                  <span>
                    First-time setup: enter your chosen password below. The{' '}
                    <strong>same password</strong> will be saved for both{' '}
                    <strong>Faculty</strong> and <strong>Admin</strong> and log you in immediately.
                  </span>
                </div>
              )}

              {/* Role Picker */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStaffRole('faculty');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    staffRole === 'faculty'
                      ? 'bg-[#641E36] text-white border-[#641E36]'
                      : 'bg-[#FAF6F0] text-[#30252A] border-[#E8D8C8] hover:border-[#641E36]'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Faculty</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStaffRole('admin');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    staffRole === 'admin'
                      ? 'bg-[#641E36] text-white border-[#641E36]'
                      : 'bg-[#FAF6F0] text-[#30252A] border-[#E8D8C8] hover:border-[#641E36]'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1">
                  Password {passwordsReady ? '(Faculty & Admin)' : '(min 4 characters)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="Enter Faculty / Admin password"
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-2.5 text-[#30252A]/55 hover:text-[#641E36] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#30252A]/75 mb-1">
                  Your Name <span className="text-[#30252A]/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder={
                    staffRole === 'admin' ? 'Campus Administrator' : 'Faculty Member'
                  }
                  className="w-full px-3.5 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>
                  {busy
                    ? 'Logging In...'
                    : staffRole === 'admin'
                      ? 'Login to Admin Portal'
                      : 'Login to Faculty Portal'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Subtle Schedule Metadata */}
          <div className="pt-3 border-t border-[#E8D8C8] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#30252A]/65">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#641E36]" />
              Mon–Sat 09:00–17:00 IST
            </span>
            <span>60/40 Fair Scheduling · Safety Agreements</span>
          </div>
        </div>
      </main>

      <footer className="max-w-3xl w-full mx-auto text-center text-xs text-[#30252A]/60">
        LabLink · SQLite Persistence · Timezone: India/Karnataka (IST)
      </footer>
    </div>
  );
};
