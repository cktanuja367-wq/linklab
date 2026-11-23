import React, { useState } from 'react';
import { Bell, LogOut, Menu, Shield, ShieldCheck, User, X } from 'lucide-react';
import type { UserProfile } from '../types';

export type PageRoute =
  | 'home'
  | 'explore'
  | 'bookings'
  | 'planner'
  | 'notifications'
  | 'faculty'
  | 'admin';

interface HeaderProps {
  profile: UserProfile;
  activePage: PageRoute;
  unreadNotifications: number;
  onNavigate: (page: PageRoute) => void;
  onSignOut: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  activePage,
  unreadNotifications,
  onNavigate,
  onSignOut,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const isFacultyOrAdmin = profile.role === 'faculty' || profile.role === 'admin';
  const isAdmin = profile.role === 'admin';

  const navItems: { id: PageRoute; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'explore', label: 'Explore Equipment' },
    { id: 'bookings', label: 'My Bookings' },
    { id: 'planner', label: 'Project Planner' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#641E36] text-white border-b border-[#8F3453]/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 lg:gap-6">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C49A55] rounded-lg"
        >
          <img
            src="/assets/aistudio/image_1795424611153860_a07fa963.png"
            alt="LabLink"
            className="w-8 h-8 rounded-lg object-cover border border-[#C49A55]/50"
            referrerPolicy="no-referrer"
          />
          <span className="font-display text-xl font-bold tracking-tight text-[#FAF6F0]">
            LabLink
          </span>
        </button>

        {/* Primary Multi-Page Links */}
        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive ? 'text-[#C49A55]' : 'text-[#FAF6F0]/85 hover:text-white'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {item.label}
                  {item.id === 'notifications' && unreadNotifications > 0 && (
                    <span className="font-mono-tabular text-xs font-semibold text-[#C49A55]">
                      ({unreadNotifications})
                    </span>
                  )}
                </span>
                {isActive && (
                  <span className="absolute left-0 right-0 -bottom-0.5 h-0.5 bg-[#C49A55] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Role Portals + User Profile */}
        <div className="flex items-center gap-2 shrink-0 relative">
          {isFacultyOrAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('faculty')}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'faculty'
                  ? 'bg-white text-[#641E36]'
                  : 'bg-[#C49A55] text-[#30252A] hover:bg-[#d4ab66]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Faculty Portal</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'admin'
                  ? 'bg-white text-[#641E36]'
                  : 'bg-[#8F3453] text-white border border-[#C49A55]/50 hover:bg-[#772943]'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-[#C49A55]" />
              <span>Admin Dashboard</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('notifications')}
            aria-label="Open notifications"
            className="lg:hidden relative p-2 rounded-lg text-[#FAF6F0] hover:bg-[#8F3453] transition-colors cursor-pointer"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 text-[10px] font-bold text-[#C49A55]">
                {unreadNotifications}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#FAF6F0] bg-[#8F3453]/70 hover:bg-[#8F3453] border border-[#C49A55]/40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <User className="w-4 h-4 text-[#C49A55]" />
            <span className="max-w-[120px] truncate">{profile.fullName}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-lg text-[#FAF6F0] hover:bg-[#8F3453] transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 top-12 w-72 bg-white text-[#30252A] border border-[#E8D8C8] rounded-xl shadow-lg p-4 z-50 space-y-3">
              <div className="pb-3 border-b border-[#E8D8C8] space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-[#8F3453] font-semibold">
                  {profile.role === 'admin'
                    ? 'Administrator'
                    : profile.role === 'faculty'
                      ? 'Faculty'
                      : 'Student'}
                </p>
                <p className="font-semibold text-[#641E36] truncate">{profile.fullName}</p>
                {profile.email && (
                  <p className="text-xs text-[#30252A]/75 truncate">{profile.email}</p>
                )}
                {(profile.usn || profile.department) && (
                  <p className="font-mono-tabular text-[11px] text-[#30252A]/65">
                    {[profile.usn, profile.department].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {isFacultyOrAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onNavigate('faculty');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#641E36] rounded-lg hover:bg-[#FAF6F0] cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Faculty Portal</span>
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onNavigate('admin');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#641E36] rounded-lg hover:bg-[#FAF6F0] cursor-pointer"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Dashboard</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  setProfileMenuOpen(false);
                  await onSignOut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Responsive mobile drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#641E36] border-t border-[#8F3453]/50 px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activePage === item.id
                  ? 'bg-[#8F3453] text-white'
                  : 'text-[#FAF6F0]/90 hover:bg-[#8F3453]/60'
              }`}
            >
              {item.label}
              {item.id === 'notifications' && unreadNotifications > 0 && ` (${unreadNotifications})`}
            </button>
          ))}
          {isFacultyOrAdmin && (
            <button
              type="button"
              onClick={() => {
                onNavigate('faculty');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#C49A55] hover:bg-[#8F3453]/60 cursor-pointer"
            >
              Faculty Portal
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                onNavigate('admin');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-white hover:bg-[#8F3453]/60 cursor-pointer"
            >
              Admin Dashboard
            </button>
          )}
        </div>
      )}
    </header>
  );
};
