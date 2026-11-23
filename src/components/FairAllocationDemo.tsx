import React, { useEffect, useState } from 'react';
import { Award, Play, Plus, RotateCcw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { FairnessContenderInput, FairnessSimulationResponse } from '../types';

const INITIAL_CONTENDERS: FairnessContenderInput[] = [
  {
    studentName: 'Candidate A',
    academicYear: 'Fourth Year',
    projectName: 'Thesis Hardware Accelerator',
    daysUntilDeadline: 2,
    weeklyHoursUsed: 1,
    safetyCertified: true,
  },
  {
    studentName: 'Candidate B',
    academicYear: 'First Year',
    projectName: 'Embedded Lab Report',
    daysUntilDeadline: 1,
    weeklyHoursUsed: 0,
    safetyCertified: false,
  },
  {
    studentName: 'Candidate C',
    academicYear: 'Third Year',
    projectName: 'Low-Power RISC-V Core',
    daysUntilDeadline: 4,
    weeklyHoursUsed: 0,
    safetyCertified: true,
  },
];

export const FairAllocationDemo: React.FC = () => {
  const [contenders, setContenders] = useState<FairnessContenderInput[]>(INITIAL_CONTENDERS);
  const [result, setResult] = useState<FairnessSimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const runSimulation = async (input = contenders) => {
    setLoading(true);
    try {
      const res = await api.runFairAllocationSimulation({
        contenders: input,
        equipmentName: 'Xilinx Artix-7 Nexys A7 FPGA Kit (Unit FPGA-201-A)',
        requiredCertification: 'ESD & FPGA Hardware Safety L1',
      });
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSimulation(INITIAL_CONTENDERS);
  }, []);

  const updateContender = (index: number, patch: Partial<FairnessContenderInput>) => {
    setContenders((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const addContender = () => {
    setContenders((prev) => [
      ...prev,
      {
        studentName: `Student ${prev.length + 1}`,
        academicYear: 'Second Year',
        projectName: 'Capstone Module',
        daysUntilDeadline: 3,
        weeklyHoursUsed: 2,
        safetyCertified: true,
      },
    ]);
  };

  const resetDefaults = () => {
    setContenders(INITIAL_CONTENDERS);
    runSimulation(INITIAL_CONTENDERS);
  };

  return (
    <div className="bg-white border border-[#E8D8C8] rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E8D8C8]">
        <div>
          <p className="text-xs font-medium text-[#8F3453] mb-1">
            60/40 Fairness Engine · Safety Pre-Filtered
          </p>
          <h3 className="font-display text-2xl font-bold text-[#30252A]">
            Fair Allocation Simulation
          </h3>
          <p className="text-sm text-[#30252A]/75 mt-1 max-w-2xl">
            Formula: <span className="font-mono-tabular font-semibold text-[#641E36]">Priority Score = (0.60 × D) + (0.40 × U)</span>.
            Safety certification is enforced strictly as a gate before scoring; academic year is never weighted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#30252A] bg-[#FAF6F0] border border-[#E8D8C8] rounded-lg hover:border-[#641E36] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Scenario</span>
          </button>
          <button
            type="button"
            onClick={() => runSimulation()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            <Play className="w-4 h-4" />
            <span>{loading ? 'Calculating...' : 'Run Fair Allocation Simulation'}</span>
          </button>
        </div>
      </div>

      {/* Editable Contenders */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#30252A]">
            Competing Student Requests ({contenders.length})
          </h4>
          <button
            type="button"
            onClick={addContender}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#641E36] hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Contender
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {contenders.map((c, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={c.studentName}
                  onChange={(e) => updateContender(idx, { studentName: e.target.value })}
                  className="font-semibold text-sm bg-white px-2.5 py-1 rounded-lg border border-[#E8D8C8] w-32"
                  aria-label="Student name"
                />
                {contenders.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setContenders((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove contender"
                    className="p-1 text-[#30252A]/50 hover:text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="block">
                  <span className="text-[#30252A]/65">Deadline (days)</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={c.daysUntilDeadline}
                    onChange={(e) =>
                      updateContender(idx, { daysUntilDeadline: Number(e.target.value) })
                    }
                    className="mt-0.5 w-full px-2.5 py-1.5 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular"
                  />
                </label>
                <label className="block">
                  <span className="text-[#30252A]/65">Hours Used (14d)</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={c.weeklyHoursUsed}
                    onChange={(e) =>
                      updateContender(idx, { weeklyHoursUsed: Number(e.target.value) })
                    }
                    className="mt-0.5 w-full px-2.5 py-1.5 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-[#30252A] pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={c.safetyCertified}
                  onChange={(e) => updateContender(idx, { safetyCertified: e.target.checked })}
                  className="accent-[#641E36] w-4 h-4"
                />
                <span>Safety Certified (ESD & FPGA L1)</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Simulation Visual Output */}
      {result && (
        <div className="space-y-4 pt-2">
          <div className="p-4 rounded-xl bg-[#641E36] text-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Award className="w-6 h-6 text-[#C49A55] shrink-0" />
              <div>
                <p className="text-xs text-[#E8D8C8]">Recommended Faculty Allocation</p>
                <p className="font-display text-lg font-bold">
                  {result.recommendedWinner
                    ? `${result.recommendedWinner} ranked #1 for ${result.equipmentName}`
                    : 'No eligible candidate — all contenders lack mandatory safety certification'}
                </p>
              </div>
            </div>
            <span className="font-mono-tabular text-xs text-[#C49A55]">
              Lookback Window: {result.lookbackDays} Days
            </span>
          </div>

          <div className="space-y-3">
            {result.contenders.map((c, idx) => (
              <div
                key={`${c.studentName}-${idx}`}
                className={`p-4 rounded-xl border ${
                  !c.eligible
                    ? 'bg-rose-50/70 border-rose-200'
                    : c.rank === 1
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : 'bg-white border-[#E8D8C8]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono-tabular text-sm font-bold text-[#641E36]">
                      {c.eligible ? `#${c.rank}` : 'EXCLUDED'}
                    </span>
                    <span className="font-semibold text-[#30252A]">{c.studentName}</span>
                    <span className="text-xs text-[#30252A]/60">· {c.projectName}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    {c.eligible ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <ShieldCheck className="w-4 h-4" />
                        Safety Cleared
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-rose-700">
                        <ShieldAlert className="w-4 h-4" />
                        Not Safety Certified
                      </span>
                    )}
                    <span className="font-mono-tabular text-sm font-bold text-[#30252A]">
                      {c.priorityScore !== null ? `Score: ${c.priorityScore.toFixed(3)}` : 'Ineligible'}
                    </span>
                  </div>
                </div>

                {c.eligible && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2.5">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#30252A]/70">Deadline Urgency (D × 0.60)</span>
                        <span className="font-mono-tabular font-semibold">
                          D = {c.deadlineUrgencyD.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 bg-[#E8D8C8]/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#641E36]"
                          style={{ width: `${Math.round(c.deadlineUrgencyD * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#30252A]/70">Usage Fairness (U × 0.40)</span>
                        <span className="font-mono-tabular font-semibold">
                          U = {c.usageFairnessU.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 bg-[#E8D8C8]/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#C49A55]"
                          style={{ width: `${Math.round(c.usageFairnessU * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-[#30252A]/80">{c.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
