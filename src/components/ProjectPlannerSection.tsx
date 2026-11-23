import React, { useState } from 'react';
import { ArrowRight, Calendar, CheckCircle2, GitBranch, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../api';
import { getISTDateStr } from '../istTime';
import type { Equipment, ProjectPlanResponse } from '../types';

interface ProjectPlannerSectionProps {
  studentName: string;
  studentCertifications: string[];
  onBookEquipment: (
    equipment: Equipment,
    projectContext: { projectName: string; projectDescription: string; projectDeadline: string }
  ) => void;
}

function defaultDeadline(): string {
  return getISTDateStr(5);
}

export const ProjectPlannerSection: React.FC<ProjectPlannerSectionProps> = ({
  studentName,
  studentCertifications,
  onBookEquipment,
}) => {
  const [projectName, setProjectName] = useState('IoT Smart Monitoring System');
  const [projectDescription, setProjectDescription] = useState(
    'Building a sensor node with Arduino, debugging SPI signals on an oscilloscope, accelerating edge filtering on an FPGA, and verifying output DC voltage.'
  );
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<ProjectPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateProjectPlan({
        projectName,
        projectDescription,
        deadline,
      });
      setPlan(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate project plan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="project-planner" className="scroll-mt-20">
      <div className="bg-white border border-[#E8D8C8] rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Burgundy Planner Panel (matches reference aesthetic) */}
          <div className="lg:col-span-5 bg-[#641E36] text-white p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-medium text-[#C49A55] mb-3">
                <GitBranch className="w-4 h-4" />
                <span>Project Dependency Intelligence</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#FAF6F0] mb-2">
                Plan Your Project
              </h2>
              <p className="text-sm text-[#FAF6F0]/80 mb-6 leading-relaxed">
                Enter your project goal and deadline to map sequential engineering stages,
                inter-stage dependencies, and real available lab instruments.
              </p>

              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#E8D8C8] mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white text-[#30252A] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C49A55]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#E8D8C8] mb-1">
                    Technical Description
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white text-[#30252A] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C49A55]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#E8D8C8] mb-1">
                    Target Deadline
                  </label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white text-[#30252A] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C49A55]"
                  />
                </div>

                {error && <p className="text-xs text-rose-200">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#30252A] bg-[#C49A55] hover:bg-[#d4ab66] rounded-xl transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{loading ? 'Analyzing Project Stages...' : 'Generate Dependency Sequence'}</span>
                </button>
              </form>
            </div>

            <p className="text-xs text-[#FAF6F0]/65 mt-6 pt-4 border-t border-white/15">
              Grounded strictly in verified campus equipment specifications and live availability.
            </p>
          </div>

          {/* Right Dependency Timeline Output */}
          <div className="lg:col-span-7 p-6 sm:p-8 bg-[#FAF6F0]/40">
            {!plan ? (
              <div className="h-full flex flex-col justify-center py-6">
                <h3 className="font-display text-xl font-bold text-[#30252A] mb-2">
                  Sequential Stage & Dependency Flow
                </h3>
                <p className="text-sm text-[#30252A]/75 mb-6">
                  Run the planner to generate an ordered timeline like:
                </p>
                <ol className="space-y-3 text-sm text-[#30252A]/85">
                  {[
                    '01. Circuit & sensor prototyping — Arduino Mega 2560',
                    '02. Signal timing & SPI debugging — Digital Oscilloscope (depends on Stage 1)',
                    '03. Hardware acceleration — Xilinx Artix-7 FPGA Kit (depends on Stage 2)',
                    '04. Final power validation — 6.5-Digit Digital Multimeter (depends on Stage 3)',
                  ].map((example) => (
                    <li
                      key={example}
                      className="p-3.5 bg-white border border-[#E8D8C8] rounded-xl flex items-center gap-3"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#C49A55] shrink-0" />
                      <span>{example}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E8D8C8]">
                  <div>
                    <p className="text-xs font-medium text-[#8F3453]">
                      {plan.mode === 'gemini' ? 'Gemini AI Project Analysis' : 'Specification Sequence Engine'} · Due {plan.deadline}
                    </p>
                    <h3 className="font-display text-xl font-bold text-[#30252A]">
                      {plan.projectName}
                    </h3>
                  </div>
                  <span className="font-mono-tabular text-xs font-medium text-[#30252A]/70">
                    {plan.stages.length} Stages
                  </span>
                </div>

                <p className="text-sm text-[#30252A]/80">{plan.summary}</p>

                <div className="space-y-3.5">
                  {plan.stages.map((st) => {
                    const eq = st.recommendedEquipment;
                    const certified =
                      !eq?.requiresCertification ||
                      (eq.certificationName ? studentCertifications.includes(eq.certificationName) : true);

                    return (
                      <div
                        key={st.stageNumber}
                        className="p-4 bg-white border border-[#E8D8C8] rounded-xl space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#8F3453] font-medium">
                              <span className="font-mono-tabular">Stage 0{st.stageNumber}</span>
                              {st.dependsOn.length > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Depends on Stage {st.dependsOn.join(', ')}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">{st.estimatedHours}h Est.</span>
                            </div>
                            <h4 className="font-display text-base font-bold text-[#30252A] mt-0.5">
                              {st.stageTitle}
                            </h4>
                          </div>

                          {eq && (
                            <button
                              type="button"
                              onClick={() =>
                                onBookEquipment(eq, {
                                  projectName: plan.projectName,
                                  projectDescription,
                                  projectDeadline: plan.deadline,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg whitespace-nowrap cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              <span>Book Stage Resource</span>
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-[#30252A]/75">{st.objective}</p>

                        {eq && (
                          <div className="flex items-center gap-3 pt-2 border-t border-[#E8D8C8]/70">
                            <img
                              src={eq.imageUrl}
                              alt={eq.name}
                              className="w-14 h-11 object-cover rounded-lg border border-[#E8D8C8] shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#30252A] truncate">
                                {eq.name}
                              </p>
                              <p className="text-xs text-[#30252A]/70">
                                {eq.labName} · {eq.availableTodayCount} of {eq.units.length} units open today
                              </p>
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-[#30252A]/80">{st.rationale}</p>

                        {st.safetyNote && (
                          <p
                            className={`text-xs flex items-center gap-1.5 font-medium ${
                              certified ? 'text-emerald-700' : 'text-[#8F3453]'
                            }`}
                          >
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>{st.safetyNote}</span>
                          </p>
                        )}

                        {st.alternativeEquipment.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#30252A]/70 pt-1">
                            <span>Alternatives:</span>
                            {st.alternativeEquipment.map((alt) => (
                              <button
                                key={alt.id}
                                type="button"
                                onClick={() =>
                                  onBookEquipment(alt, {
                                    projectName: plan.projectName,
                                    projectDescription,
                                    projectDeadline: plan.deadline,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[#641E36] font-medium hover:underline cursor-pointer"
                              >
                                <span>{alt.name}</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
