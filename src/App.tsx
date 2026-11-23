import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  DoorOpen,
  Layers,
  MapPin,
  Search,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { api, type CampusPayload, type ConfigStatusResponse, type FairnessSummary } from './api';
import { AdminDashboard } from './components/AdminDashboard';
import { BookingModal } from './components/BookingModal';
import { EquipmentCard } from './components/EquipmentCard';
import { FacultyPortal } from './components/FacultyPortal';
import { FairAllocationDemo } from './components/FairAllocationDemo';
import { Header, type PageRoute } from './components/Header';
import { ProjectPlannerSection } from './components/ProjectPlannerSection';
import { StudentBookingsAndAlerts } from './components/StudentBookingsAndAlerts';
import { WelcomeScreen } from './components/WelcomeScreen';
import { clearAccessToken, setAccessToken } from './lib/auth';
import type {
  AIDiscoveryResponse,
  Booking,
  CertificationRecord,
  DamageReport,
  Equipment,
  EquipmentCategory,
  NotificationItem,
  RescueProposal,
  UserProfile,
} from './types';

const PAGE_PATHS: Record<PageRoute, string> = {
  home: '/',
  explore: '/explore',
  bookings: '/bookings',
  planner: '/planner',
  notifications: '/notifications',
  faculty: '/faculty',
  admin: '/admin',
};

function parseRouteFromPathname(pathname: string): PageRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  switch (clean) {
    case '/explore':
      return 'explore';
    case '/bookings':
      return 'bookings';
    case '/planner':
      return 'planner';
    case '/notifications':
      return 'notifications';
    case '/faculty':
      return 'faculty';
    case '/admin':
      return 'admin';
    default:
      return 'home';
  }
}

const CATEGORIES: Array<'All' | EquipmentCategory> = [
  'All',
  'Electronics',
  'Embedded Systems',
  'Robotics',
  'IoT',
  'Computing',
  'Mechanical',
];

const EMPTY_FAIRNESS: FairnessSummary = {
  hoursUsed: 0,
  approvedCount: 0,
  completedCount: 0,
  cancellationCount: 0,
  noShowCount: 0,
  usageFairnessU: 1,
};

export default function App() {
  const [activePage, setActivePage] = useState<PageRoute>(() =>
    parseRouteFromPathname(window.location.pathname)
  );

  // Auth & Config state
  const [configStatus, setConfigStatus] = useState<ConfigStatusResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [certifications, setCertifications] = useState<CertificationRecord[]>([]);
  const [fairnessHistory, setFairnessHistory] = useState<FairnessSummary>(EMPTY_FAIRNESS);

  // Domain Data state
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [campus, setCampus] = useState<CampusPayload | null>(null);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [damageReports, setDamageReports] = useState<DamageReport[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [rescueProposals, setRescueProposals] = useState<RescueProposal[]>([]);

  // Discovery / Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResult, setAiResult] = useState<AIDiscoveryResponse | null>(null);

  // Cascading Campus & Catalog Filters on Explore page
  const [selectedCategory, setSelectedCategory] = useState<'All' | EquipmentCategory>('All');
  const [selectedBlockId, setSelectedBlockId] = useState<number>(0);
  const [selectedFloorId, setSelectedFloorId] = useState<number>(0);
  const [selectedRoomId, setSelectedRoomId] = useState<number>(0);
  const [onlyAvailableToday, setOnlyAvailableToday] = useState(false);

  // Booking Modal state
  const [modalEquipment, setModalEquipment] = useState<Equipment | null>(null);
  const [modalInitialStep, setModalInitialStep] = useState<'details' | 'calendar' | 'project'>(
    'calendar'
  );
  const [modalProjectContext, setModalProjectContext] = useState<
    { projectName?: string; projectDescription?: string; projectDeadline?: string } | undefined
  >(undefined);

  const navigate = useCallback((page: PageRoute) => {
    setActivePage(page);
    const targetPath = PAGE_PATHS[page] ?? '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ page }, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActivePage(parseRouteFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadProtectedAppData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const [campusRes, eqRes, bookingRes, dmgRes, notifRes] = await Promise.all([
        api.getCampus(),
        api.getEquipment(),
        api.getStudentBookings(),
        api.getStudentDamageReports(),
        api.getNotifications(),
      ]);
      setCampus(campusRes);
      setEquipmentList(eqRes.equipment);
      setBookings(bookingRes.bookings);
      setFairnessHistory(bookingRes.fairnessHistory);
      setDamageReports(dmgRes.damageReports);
      setNotifications(notifRes.notifications);
      setRescueProposals(notifRes.rescueProposals);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to load laboratory records.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  const refreshConfigStatus = useCallback(async () => {
    try {
      const cfg = await api.getConfigStatus();
      setConfigStatus(cfg);
    } catch {
      setConfigStatus(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshConfigStatus();
  }, [refreshConfigStatus]);

  const handleAuthSuccess = useCallback(
    async (loggedInProfile: UserProfile, token: string) => {
      setAccessToken(token);
      setProfile(loggedInProfile);
      try {
        const me = await api.getAuthMe();
        setProfile(me.profile);
        setCertifications(me.certifications);
        setFairnessHistory(me.fairnessHistory);
      } catch {
        setCertifications([]);
        setFairnessHistory(EMPTY_FAIRNESS);
      }
      await loadProtectedAppData();
    },
    [loadProtectedAppData]
  );

  const handleSignOut = async () => {
    clearAccessToken();
    setProfile(null);
    setCertifications([]);
    setFairnessHistory(EMPTY_FAIRNESS);
    setEquipmentList([]);
    setBookings([]);
    setDamageReports([]);
    setNotifications([]);
    setRescueProposals([]);
    setAiResult(null);
    navigate('home');
    await refreshConfigStatus();
  };

  // Enforce route role guards cleanly
  useEffect(() => {
    if (!profile) return;
    if (activePage === 'admin' && profile.role !== 'admin') {
      navigate('home');
    } else if (activePage === 'faculty' && profile.role !== 'faculty' && profile.role !== 'admin') {
      navigate('home');
    }
  }, [activePage, profile, navigate]);

  const studentCertificationNames = useMemo(
    () => certifications.filter((c) => c.active).map((c) => c.certificationName),
    [certifications]
  );

  const isCertifiedFor = useCallback(
    (eq: Equipment) =>
      !eq.requiresCertification ||
      (eq.certificationName ? studentCertificationNames.includes(eq.certificationName) : true),
    [studentCertificationNames]
  );

  // Cascading campus filter lists
  const availableFloors = useMemo(() => {
    const all = campus?.floors.filter((f) => f.isActive) ?? [];
    if (!selectedBlockId) return all;
    return all.filter((f) => f.blockId === selectedBlockId);
  }, [campus, selectedBlockId]);

  const availableRooms = useMemo(() => {
    const all = campus?.rooms ?? [];
    return all.filter((r) => {
      if (selectedBlockId && r.blockId !== selectedBlockId) return false;
      if (selectedFloorId && r.floorId !== selectedFloorId) return false;
      return true;
    });
  }, [campus, selectedBlockId, selectedFloorId]);

  const filteredEquipment = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return equipmentList.filter((eq) => {
      if (selectedCategory !== 'All' && eq.category !== selectedCategory) return false;
      if (selectedBlockId && eq.blockId !== selectedBlockId) return false;
      if (selectedFloorId && eq.floorId !== selectedFloorId) return false;
      if (selectedRoomId && eq.roomId !== selectedRoomId) return false;
      if (onlyAvailableToday && eq.availableTodayCount <= 0) return false;
      if (q) {
        const hay = [
          eq.name,
          eq.category,
          eq.description,
          eq.blockName,
          eq.floorLabel,
          eq.roomCode,
          eq.labName,
          JSON.stringify(eq.specs),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    equipmentList,
    selectedCategory,
    selectedBlockId,
    selectedFloorId,
    selectedRoomId,
    onlyAvailableToday,
    searchQuery,
  ]);

  const handleAiSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setAiResult(null);
      return;
    }
    setAiSearching(true);
    try {
      const res = await api.discoverEquipment(q);
      setAiResult(res);
    } catch {
      setAiResult(null);
    } finally {
      setAiSearching(false);
    }
  };

  const openEquipmentModal = (
    eq: Equipment,
    step: 'details' | 'calendar' | 'project' = 'calendar',
    projectCtx?: { projectName?: string; projectDescription?: string; projectDeadline?: string }
  ) => {
    setModalEquipment(eq);
    setModalInitialStep(step);
    setModalProjectContext(projectCtx);
  };

  const unreadNotifications = notifications.filter((n) => !n.isRead).length;
  const activeFeaturedEquipment =
    equipmentList.find((e) => e.availableTodayCount > 0) ?? equipmentList[0] ?? null;

  const selectedRoomObj = useMemo(
    () => (selectedRoomId ? campus?.rooms.find((r) => r.id === selectedRoomId) ?? null : null),
    [campus, selectedRoomId]
  );

  // Loading Splash
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div className="w-10 h-10 rounded-full border-4 border-[#E8D8C8] border-t-[#641E36] animate-spin" />
        <p className="font-display text-lg font-bold text-[#641E36]">
          Connecting to LabLink...
        </p>
        <p className="text-xs text-[#30252A]/65">
          Loading SQLite Laboratory Schedule (India/Karnataka IST)
        </p>
      </div>
    );
  }

  // Auth Gate (Students log in with Name; Faculty & Admin with Password)
  if (!profile) {
    return (
      <WelcomeScreen
        configStatus={configStatus}
        onAuthSuccess={handleAuthSuccess}
        onConfigUpdated={refreshConfigStatus}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex flex-col">
      <Header
        profile={profile}
        activePage={activePage}
        unreadNotifications={unreadNotifications}
        onNavigate={navigate}
        onSignOut={handleSignOut}
      />

      {dataError && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{dataError}</span>
            </div>
            <button
              type="button"
              onClick={loadProtectedAppData}
              className="font-semibold underline cursor-pointer shrink-0"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 w-full">
        {/* ==================== PAGE: HOME ==================== */}
        {activePage === 'home' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
            {/* Hero Section */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 bg-white border border-[#E8D8C8] rounded-2xl p-6 sm:p-9 flex flex-col justify-between shadow-sm">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#8F3453]">
                    <span className="font-semibold text-[#641E36] uppercase tracking-wider">
                      Campus Resource Hub
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Signed in: {profile.fullName} ({profile.role.toUpperCase()})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      IST {campus?.todayIST ?? ''}
                    </span>
                  </div>

                  <h1 className="font-display text-3xl sm:text-5xl font-bold text-[#641E36] leading-[1.1] text-balance">
                    Your ideas deserve the right tools.
                  </h1>
                  <p className="text-sm sm:text-base text-[#30252A]/80 max-w-2xl leading-relaxed">
                    Discover specialised campus hardware in natural language, inspect live database
                    hourly availability in India/Karnataka (IST), and reserve verified laboratory
                    benches with transparent 60/40 priority scheduling.
                  </p>

                  {/* Natural Language AI Discovery Bar */}
                  <form onSubmit={handleAiSearch} className="pt-2">
                    <div className="flex flex-col sm:flex-row gap-2.5 p-2 rounded-2xl bg-[#FAF6F0] border border-[#E8D8C8] focus-within:border-[#641E36] transition-colors">
                      <div className="flex items-center gap-2.5 flex-1 px-2">
                        <Search className="w-4 h-4 text-[#641E36] shrink-0" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Ask in plain English (e.g., Arduino for SPI sensor node, oscilloscope, 3D printer)..."
                          className="w-full py-2 text-sm bg-transparent text-[#30252A] focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={aiSearching}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl whitespace-nowrap cursor-pointer disabled:opacity-60"
                      >
                        <Sparkles className="w-4 h-4 text-[#C49A55]" />
                        <span>{aiSearching ? 'Searching...' : 'AI Discover'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Quick Category Jumps */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          navigate('explore');
                        }}
                        className="px-3.5 py-1.5 text-xs font-medium text-[#641E36] bg-[#FAF6F0] hover:bg-[#E8D8C8]/60 border border-[#E8D8C8] rounded-lg transition-colors cursor-pointer"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Role-aware shortcuts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-[#E8D8C8]">
                  <button
                    type="button"
                    onClick={() => navigate('explore')}
                    className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] hover:border-[#641E36] text-left transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-[#641E36] flex items-center justify-between">
                      <span>Explore Equipment</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </p>
                    <p className="text-xs text-[#30252A]/70 mt-1">
                      {equipmentList.length} instrument(s) across {campus?.rooms.length ?? 0} room(s)
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('bookings')}
                    className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] hover:border-[#641E36] text-left transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-[#641E36] flex items-center justify-between">
                      <span>My Bookings</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </p>
                    <p className="text-xs text-[#30252A]/70 mt-1">
                      {bookings.length} reservation(s) · Report damage
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('planner')}
                    className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] hover:border-[#641E36] text-left transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-[#641E36] flex items-center justify-between">
                      <span>Project Planner</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </p>
                    <p className="text-xs text-[#30252A]/70 mt-1">
                      AI stage graph &amp; 60/40 fairness simulator
                    </p>
                  </button>
                </div>
              </div>

              {/* Right Spotlight Card (compact without oversized image) */}
              <div className="lg:col-span-5 bg-[#641E36] text-white rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between border border-[#8F3453]/40 p-6">
                {activeFeaturedEquipment ? (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-[#FAF6F0]">
                        <span className="font-medium text-[#C49A55]">
                          Live Bench Spotlight · {activeFeaturedEquipment.category}
                        </span>
                        <span className="font-mono-tabular">
                          {activeFeaturedEquipment.availableTodayCount}/{activeFeaturedEquipment.units.length}{' '}
                          open today
                        </span>
                      </div>

                      <div className="flex items-start gap-3.5">
                        <img
                          src={activeFeaturedEquipment.imageUrl}
                          alt={activeFeaturedEquipment.name}
                          className="w-20 h-20 rounded-xl object-cover border border-white/20 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <h2 className="font-display text-xl font-bold text-[#FAF6F0]">
                            {activeFeaturedEquipment.name}
                          </h2>
                          <p className="text-xs text-[#E8D8C8] mt-1 flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#C49A55] shrink-0 mt-0.5" />
                            <span>{activeFeaturedEquipment.location}</span>
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-[#FAF6F0]/80 line-clamp-3 leading-relaxed">
                        {activeFeaturedEquipment.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-white/15">
                      <div className="text-xs">
                        <p className="text-[#E8D8C8]">Today&apos;s Hours (IST)</p>
                        <p className="font-mono-tabular font-semibold text-white">
                          {activeFeaturedEquipment.todayOpenHours}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEquipmentModal(activeFeaturedEquipment, 'calendar')}
                        className="px-4 py-2.5 text-xs font-semibold text-[#30252A] bg-[#C49A55] hover:bg-[#d4ab66] rounded-xl cursor-pointer whitespace-nowrap"
                      >
                        Check Live Slots
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col justify-center space-y-4">
                    <Building2 className="w-9 h-9 text-[#C49A55]" />
                    <h2 className="font-display text-2xl font-bold text-[#FAF6F0]">
                      Ready for Campus Lab Setup
                    </h2>
                    <p className="text-sm text-[#FAF6F0]/80 leading-relaxed">
                      No laboratory equipment has been registered yet. Once an Administrator creates
                      Campus Blocks, Floors, and Rooms, Faculty or Admin can add real hardware
                      instruments and units to the catalog.
                    </p>
                    {profile.role === 'admin' ? (
                      <button
                        type="button"
                        onClick={() => navigate('admin')}
                        className="self-start px-5 py-2.5 text-xs font-semibold text-[#30252A] bg-[#C49A55] hover:bg-[#d4ab66] rounded-xl cursor-pointer"
                      >
                        Open Admin Campus Setup
                      </button>
                    ) : profile.role === 'faculty' ? (
                      <button
                        type="button"
                        onClick={() => navigate('faculty')}
                        className="self-start px-5 py-2.5 text-xs font-semibold text-[#30252A] bg-[#C49A55] hover:bg-[#d4ab66] rounded-xl cursor-pointer"
                      >
                        Open Faculty Equipment Manager
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

            {/* AI Discovery Results Panel */}
            {aiResult && (
              <section className="bg-white border border-[#C49A55] rounded-2xl p-6 sm:p-7 space-y-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E8D8C8]">
                  <div>
                    <p className="text-xs font-semibold text-[#8F3453] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#C49A55]" />
                      <span>
                        {aiResult.mode === 'gemini'
                          ? 'Gemini Natural-Language Equipment Discovery'
                          : 'Specification Keyword Match'}
                      </span>
                    </p>
                    <h2 className="font-display text-xl font-bold text-[#30252A] mt-0.5">
                      Recommendations for &ldquo;{aiResult.query}&rdquo;
                    </h2>
                    <p className="text-xs text-[#30252A]/75 mt-1">{aiResult.intentSummary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiResult(null)}
                    className="text-xs font-semibold text-[#641E36] hover:underline cursor-pointer"
                  >
                    Clear Results
                  </button>
                </div>

                {aiResult.warning && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2">
                    {aiResult.warning}
                  </p>
                )}

                {aiResult.recommendations.length === 0 ? (
                  <p className="text-sm text-[#30252A]/75 py-4">
                    No matching campus equipment was found in the active catalog for that query.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiResult.recommendations.map((rec) => (
                      <div
                        key={rec.equipment.id}
                        className="p-4 rounded-xl bg-[#FAF6F0]/60 border border-[#E8D8C8] flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start gap-3.5">
                          <img
                            src={rec.equipment.imageUrl}
                            alt={rec.equipment.name}
                            className="w-20 h-16 object-cover rounded-lg border border-[#E8D8C8] shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-medium text-[#8F3453]">
                              {rec.equipment.category} ·{' '}
                              {rec.equipment.availableTodayCount} unit(s) open today
                            </p>
                            <h3 className="font-display text-base font-bold text-[#30252A] truncate">
                              {rec.equipment.name}
                            </h3>
                            <p className="text-xs text-[#30252A]/75 flex items-start gap-1">
                              <MapPin className="w-3.5 h-3.5 text-[#641E36] shrink-0 mt-0.5" />
                              <span>{rec.equipment.location}</span>
                            </p>
                          </div>
                        </div>

                        <div className="text-xs text-[#30252A]/85 space-y-1">
                          <p>
                            <strong>Match:</strong> {rec.matchReason}
                          </p>
                          <p className="text-[#30252A]/70">{rec.compatibilityNote}</p>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openEquipmentModal(rec.equipment, 'details')}
                            className="flex-1 px-3 py-2 text-xs font-medium text-[#641E36] bg-white border border-[#E8D8C8] rounded-lg hover:border-[#641E36] cursor-pointer"
                          >
                            View Specs
                          </button>
                          <button
                            type="button"
                            onClick={() => openEquipmentModal(rec.equipment, 'calendar')}
                            className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg cursor-pointer"
                          >
                            Book in {rec.equipment.labName}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Dynamic Campus Labs Overview */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#30252A]">
                    Active Campus Laboratories
                  </h2>
                  <p className="text-xs text-[#30252A]/70">
                    Managed dynamically by Campus Administration · Operating Hours Mon–Sat 09:00–17:00 IST
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('explore')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#641E36] hover:underline cursor-pointer"
                >
                  <span>Browse All Filters</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {!campus || campus.rooms.length === 0 ? (
                <div className="bg-white border border-dashed border-[#E8D8C8] rounded-2xl p-8 text-center space-y-2">
                  <DoorOpen className="w-8 h-8 text-[#641E36]/45 mx-auto" />
                  <p className="text-sm font-semibold text-[#30252A]">
                    No Campus Blocks or Laboratory Rooms Created Yet
                  </p>
                  <p className="text-xs text-[#30252A]/70 max-w-md mx-auto">
                    College block, floor, and room names are never hardcoded. An Administrator can
                    add real campus buildings and labs in the Admin Dashboard.
                  </p>
                  {profile.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => navigate('admin')}
                      className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Configure Campus Blocks &amp; Rooms</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {campus.rooms.slice(0, 6).map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        setSelectedBlockId(room.blockId);
                        setSelectedFloorId(room.floorId);
                        setSelectedRoomId(room.id);
                        navigate('explore');
                      }}
                      className="text-left p-5 bg-white border border-[#E8D8C8] hover:border-[#641E36] rounded-xl shadow-sm transition-colors space-y-2 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono-tabular font-semibold text-[#8F3453]">
                          {room.blockName} · Room {room.roomNumber}
                        </span>
                        <span
                          className={`font-semibold capitalize ${
                            room.status === 'available'
                              ? 'text-emerald-700'
                              : room.status === 'maintenance'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {room.status}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-[#30252A]">
                        {room.labName}
                      </h3>
                      <p className="text-xs text-[#30252A]/70">
                        {room.floorLabel} · Mon–Fri{' '}
                        <span className="font-mono-tabular">
                          {String(room.openHour).padStart(2, '0')}:00–
                          {String(room.closeHour).padStart(2, '0')}:00
                        </span>{' '}
                        IST
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Popular Equipment Strip */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-bold text-[#30252A]">
                  Campus Equipment Highlights
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('explore')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#641E36] hover:underline cursor-pointer"
                >
                  <span>View Full Catalog ({equipmentList.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {dataLoading && equipmentList.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-80 bg-white border border-[#E8D8C8] rounded-xl animate-pulse"
                    />
                  ))}
                </div>
              ) : equipmentList.length === 0 ? (
                <div className="bg-white border border-dashed border-[#E8D8C8] rounded-2xl p-8 text-center">
                  <Cpu className="w-8 h-8 text-[#641E36]/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-[#30252A]">
                    No equipment registered in the database yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {equipmentList.slice(0, 3).map((eq) => (
                    <EquipmentCard
                      key={eq.id}
                      equipment={eq}
                      studentCertified={isCertifiedFor(eq)}
                      onViewDetails={(item) => openEquipmentModal(item, 'details')}
                      onBookNow={(item) => openEquipmentModal(item, 'calendar')}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== PAGE: EXPLORE EQUIPMENT ==================== */}
        {activePage === 'explore' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[#8F3453]">
                    Live India/Karnataka (IST) Availability · Dynamic Campus Hierarchy
                  </p>
                  <h1 className="font-display text-3xl font-bold text-[#30252A] mt-0.5">
                    Explore Laboratory Equipment
                  </h1>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#30252A]/75 bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl px-3.5 py-2">
                  <Clock className="w-3.5 h-3.5 text-[#641E36]" />
                  <span>{campus?.istNow ?? 'IST Schedule Active'}</span>
                </div>
              </div>

              {/* Search + Cascading Block -> Floor -> Room Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2 relative">
                  <Search className="w-4 h-4 text-[#641E36] absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by name, specification, or lab..."
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                  />
                </div>

                <select
                  value={selectedBlockId}
                  onChange={(e) => {
                    setSelectedBlockId(Number(e.target.value));
                    setSelectedFloorId(0);
                    setSelectedRoomId(0);
                  }}
                  aria-label="Filter by Campus Block"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value={0}>All Campus Blocks</option>
                  {(campus?.blocks.filter((b) => b.isActive) ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedFloorId}
                  onChange={(e) => {
                    setSelectedFloorId(Number(e.target.value));
                    setSelectedRoomId(0);
                  }}
                  aria-label="Filter by Floor"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value={0}>All Floors</option>
                  {availableFloors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.blockName ? `${f.blockName} · ` : ''}
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                  aria-label="Filter by Laboratory Room"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value={0}>All Laboratory Rooms</option>
                  {availableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomNumber} · {r.labName} ({r.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Tabs & Available Today Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-[#641E36] text-white'
                          : 'bg-[#FAF6F0] text-[#30252A]/80 border border-[#E8D8C8] hover:border-[#641E36]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#30252A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyAvailableToday}
                      onChange={(e) => setOnlyAvailableToday(e.target.checked)}
                      className="accent-[#641E36] w-4 h-4"
                    />
                    <span>Available Today Only</span>
                  </label>

                  {(selectedBlockId ||
                    selectedFloorId ||
                    selectedRoomId ||
                    selectedCategory !== 'All' ||
                    searchQuery ||
                    onlyAvailableToday) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBlockId(0);
                        setSelectedFloorId(0);
                        setSelectedRoomId(0);
                        setSelectedCategory('All');
                        setSearchQuery('');
                        setOnlyAvailableToday(false);
                      }}
                      className="text-xs font-semibold text-[#641E36] hover:underline cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Room Status & Holidays Notice */}
              {selectedRoomObj && (
                <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#641E36]" />
                    <span>
                      <strong>
                        {selectedRoomObj.blockName} · {selectedRoomObj.floorLabel} · Room{' '}
                        {selectedRoomObj.roomNumber} ({selectedRoomObj.labName})
                      </strong>{' '}
                      · Status:{' '}
                      <span className="font-semibold capitalize">{selectedRoomObj.status}</span>
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[#30252A]/75">
                    Mon–Fri {String(selectedRoomObj.openHour).padStart(2, '0')}:00–
                    {String(selectedRoomObj.closeHour).padStart(2, '0')}:00 · Sat{' '}
                    {String(selectedRoomObj.saturdayOpenHour).padStart(2, '0')}:00–
                    {String(selectedRoomObj.saturdayCloseHour).padStart(2, '0')}:00 IST
                  </span>
                </div>
              )}

              {campus && campus.holidays.length > 0 && (
                <div className="text-xs text-[#30252A]/75 flex flex-wrap items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-[#8F3453]" />
                  <span className="font-semibold">Configured College / Lab Holidays:</span>
                  {campus.holidays.slice(0, 4).map((h) => (
                    <span
                      key={h.id}
                      className="font-mono-tabular bg-[#FAF6F0] border border-[#E8D8C8] px-2 py-0.5 rounded-md"
                    >
                      {h.holidayDate} ({h.title})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {filteredEquipment.length === 0 ? (
              <div className="bg-white border border-dashed border-[#E8D8C8] rounded-2xl p-10 text-center space-y-2">
                <Wrench className="w-8 h-8 text-[#641E36]/40 mx-auto" />
                <p className="text-sm font-semibold text-[#30252A]">
                  No equipment matches your active filters.
                </p>
                <p className="text-xs text-[#30252A]/65">
                  Try clearing room or category filters, or unchecking &ldquo;Available Today
                  Only&rdquo; to schedule a future IST date.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredEquipment.map((eq) => (
                  <EquipmentCard
                    key={eq.id}
                    equipment={eq}
                    studentCertified={isCertifiedFor(eq)}
                    onViewDetails={(item) => openEquipmentModal(item, 'details')}
                    onBookNow={(item) => openEquipmentModal(item, 'calendar')}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== PAGE: MY BOOKINGS ==================== */}
        {activePage === 'bookings' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <StudentBookingsAndAlerts
              studentName={profile.fullName}
              bookings={bookings}
              damageReports={damageReports}
              fairnessHistory={fairnessHistory}
              notifications={notifications}
              rescueProposals={rescueProposals}
              sectionMode="bookings"
              onCancelBooking={async (id) => {
                await api.cancelBooking(id);
                await loadProtectedAppData();
              }}
              onReportDamage={async (payload) => {
                await api.reportDamage(payload);
                await loadProtectedAppData();
              }}
              onMarkNotificationRead={async (id) => {
                await api.markNotificationRead(id);
                await loadProtectedAppData();
              }}
              onAcceptRescue={async (proposalId) => {
                await api.acceptRescueProposal(proposalId);
                await loadProtectedAppData();
              }}
            />
          </div>
        )}

        {/* ==================== PAGE: PROJECT PLANNER & FAIRNESS ==================== */}
        {activePage === 'planner' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
            <ProjectPlannerSection
              studentName={profile.fullName}
              studentCertifications={studentCertificationNames}
              onBookEquipment={(eq, projectCtx) => openEquipmentModal(eq, 'calendar', projectCtx)}
            />
            <FairAllocationDemo />
          </div>
        )}

        {/* ==================== PAGE: NOTIFICATIONS ==================== */}
        {activePage === 'notifications' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <StudentBookingsAndAlerts
              studentName={profile.fullName}
              bookings={bookings}
              damageReports={damageReports}
              fairnessHistory={fairnessHistory}
              notifications={notifications}
              rescueProposals={rescueProposals}
              sectionMode="notifications"
              onCancelBooking={async (id) => {
                await api.cancelBooking(id);
                await loadProtectedAppData();
              }}
              onReportDamage={async (payload) => {
                await api.reportDamage(payload);
                await loadProtectedAppData();
              }}
              onMarkNotificationRead={async (id) => {
                await api.markNotificationRead(id);
                await loadProtectedAppData();
              }}
              onAcceptRescue={async (proposalId) => {
                await api.acceptRescueProposal(proposalId);
                await loadProtectedAppData();
              }}
            />
          </div>
        )}

        {/* ==================== PAGE: FACULTY PORTAL ==================== */}
        {activePage === 'faculty' && (
          <FacultyPortal profile={profile} onDataMutated={loadProtectedAppData} />
        )}

        {/* ==================== PAGE: ADMIN DASHBOARD ==================== */}
        {activePage === 'admin' && (
          <AdminDashboard profile={profile} onDataMutated={loadProtectedAppData} />
        )}
      </main>

      <footer className="mt-12 border-t border-[#E8D8C8] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#30252A]/70">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#641E36]" />
            <span>
              <strong className="text-[#641E36]">LabLink</strong> — Discover · Book · Innovate
            </span>
          </div>
          <p className="font-mono-tabular">
            SQLite Persistence · Timezone: India/Karnataka (IST) · 60/40 Fair Allocation
          </p>
        </div>
      </footer>

      {modalEquipment && (
        <BookingModal
          equipment={modalEquipment}
          allEquipment={equipmentList}
          studentName={profile.fullName}
          studentCertifications={studentCertificationNames}
          initialStep={modalInitialStep}
          initialProject={modalProjectContext}
          onClose={() => setModalEquipment(null)}
          onBookingCreated={loadProtectedAppData}
          onSelectEquipment={(nextEq) => setModalEquipment(nextEq)}
        />
      )}
    </div>
  );
}
