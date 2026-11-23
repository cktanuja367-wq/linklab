import { GoogleGenAI, Type } from '@google/genai';
import { getAllEquipment } from './services.ts';
import { isStudentCertified } from './fairness.ts';
import type {
  AIDiscoveryRecommendation,
  AIDiscoveryResponse,
  Equipment,
  ProjectPlanResponse,
  ProjectStagePlan,
} from '../src/types.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const CANONICAL_EQUIPMENT_TERMS = [
  'arduino',
  'oscilloscope',
  'fpga',
  'robotic',
  'raspberry',
  'printer',
  'multimeter',
  'supply',
  'cnc',
  'workstation',
  'power',
  'spi',
  'i2c',
  'uart',
  'ppt',
  'presentation',
  'report',
  'slides',
  'latex',
  'matlab',
  'cad',
];

function normalizeAndExpandToken(token: string): string[] {
  const clean = token.toLowerCase().trim();
  const out = new Set<string>([clean]);

  if (clean.length >= 4) {
    for (const target of CANONICAL_EQUIPMENT_TERMS) {
      const maxDist = target.length >= 7 ? 3 : 2;
      if (levenshtein(clean, target) <= maxDist) {
        out.add(target);
      }
    }
  }
  return [...out];
}

function keywordSearchCatalog(query: string, catalog: Equipment[]): {
  extractedKeywords: string[];
  matches: { equip: Equipment; score: number; matchedTerms: string[] }[];
} {
  const stopWords = new Set([
    'i', 'want', 'to', 'need', 'for', 'my', 'a', 'an', 'the', 'of', 'in', 'on', 'and',
    'or', 'with', 'project', 'equipment', 'device', 'tool', 'tools', 'can', 'is', 'get',
    'where', 'which', 'find', 'make', 'making', 'create', 'booking', 'book',
  ]);

  const synonymMap: Record<string, string[]> = {
    arduino: ['arduino', 'mega', 'microcontroller', 'iot', 'sensor'],
    debug: ['oscilloscope', 'spi', 'i2c', 'uart', 'signal', 'trigger'],
    signal: ['oscilloscope', 'bandwidth', 'spi', 'i2c', 'waveform'],
    spi: ['oscilloscope', 'arduino', 'fpga', 'raspberry'],
    i2c: ['oscilloscope', 'arduino', 'fpga', 'raspberry'],
    voltage: ['multimeter', 'oscilloscope', 'power supply', 'dc'],
    current: ['multimeter', 'power supply', 'dc'],
    circuit: ['oscilloscope', 'multimeter', 'power supply', 'arduino'],
    embedded: ['fpga', 'arduino', 'raspberry', 'uart'],
    fpga: ['artix', 'cyclone', 'vivado', 'quartus', 'verilog', 'hdl'],
    robot: ['robotic arm', 'ros', 'kinematics', 'gripper', 'cnc'],
    robotic: ['robotic arm', 'ros', 'kinematics', 'gripper'],
    arm: ['robotic arm', '6-dof', 'payload'],
    print: ['3d printer', 'prusa', 'fdm', 'enclosure'],
    printer: ['3d printer', 'prusa', 'fdm'],
    enclosure: ['3d printer', 'cnc', 'mechanical'],
    iot: ['arduino', 'raspberry pi', 'sensor', 'wi-fi'],
    edge: ['raspberry pi', 'camera', 'computing'],
    ml: ['raspberry pi', 'edge ai', 'fpga'],
    ppt: ['workstation', 'ppt', 'slides', 'presentation', 'report', 'computing'],
    presentation: ['workstation', 'ppt', 'slides', 'computing'],
    slides: ['workstation', 'ppt', 'presentation', 'computing'],
    report: ['workstation', 'report', 'latex', 'matlab', 'computing'],
    documentation: ['workstation', 'report', 'ppt', 'latex'],
    matlab: ['workstation', 'simulation', 'computing'],
  };

  const rawTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));

  const expanded = new Set<string>();
  for (const raw of rawTokens) {
    const normalizedForms = normalizeAndExpandToken(raw);
    for (const form of normalizedForms) {
      expanded.add(form);
      for (const syn of synonymMap[form] ?? []) {
        expanded.add(syn);
      }
    }
  }

  const scored = catalog.map((equip) => {
    const haystack = [
      equip.name,
      equip.category,
      equip.description,
      equip.labName,
      equip.location,
      JSON.stringify(equip.specs),
    ]
      .join(' ')
      .toLowerCase();

    const matchedTerms: string[] = [];
    let score = 0;

    for (const term of expanded) {
      if (haystack.includes(term)) {
        matchedTerms.push(term);
        score += equip.name.toLowerCase().includes(term) ? 4 : 1.5;
      }
    }

    return { equip, score, matchedTerms };
  });

  const sorted = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    extractedKeywords: [...expanded].slice(0, 8),
    matches: sorted,
  };
}

export async function discoverEquipmentAI(query: string): Promise<AIDiscoveryResponse> {
  const catalog = await getAllEquipment();
  if (catalog.length === 0) {
    return {
      mode: 'keyword_fallback',
      query,
      intentSummary:
        'No campus laboratory equipment has been registered yet. An administrator or faculty member can add blocks, labs, and equipment first.',
      extractedKeywords: [],
      recommendations: [],
    };
  }

  const catalogContext = catalog.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    labName: e.labName,
    location: e.location,
    description: e.description,
    specs: e.specs,
    availableUnitsCount: e.availableUnitsCount,
    availableTodayCount: e.availableTodayCount,
    unitCodes: e.units.map((u) => u.unitCode),
    requiresCertification: e.requiresCertification,
    certificationName: e.certificationName,
    compatibleIds: e.compatibleIds,
  }));

  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Student search query: "${query}"\n\nCampus Lab Equipment Database (SOURCE OF TRUTH — never invent equipment or availability):\n${JSON.stringify(catalogContext)}`,
        config: {
          systemInstruction:
            'You are LabLink AI, a campus laboratory equipment advisor. Interpret typos naturally (e.g. "aurdiUNO" means Arduino, "ppt/report" means Computing & Documentation Workstation). Identify matching equipment ONLY from the provided database IDs, explicitly state WHICH laboratory and room/bench location holds it, explain why each item matches based on its specs, and list compatible alternatives from the database. Never fabricate specs or availability.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intentSummary: { type: Type.STRING },
              extractedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    equipmentId: { type: Type.INTEGER },
                    matchReason: { type: Type.STRING },
                    compatibilityNote: { type: Type.STRING },
                  },
                  required: ['equipmentId', 'matchReason', 'compatibilityNote'],
                },
              },
            },
            required: ['intentSummary', 'extractedKeywords', 'recommendations'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        intentSummary?: string;
        extractedKeywords?: string[];
        recommendations?: {
          equipmentId: number;
          matchReason: string;
          compatibilityNote: string;
        }[];
      };

      const recs: AIDiscoveryRecommendation[] = [];
      for (const item of parsed.recommendations ?? []) {
        const equip = catalog.find((e) => e.id === item.equipmentId);
        if (!equip) continue;
        const alternatives = equip.compatibleIds
          .map((cid) => catalog.find((e) => e.id === cid))
          .filter((e): e is Equipment => Boolean(e));
        recs.push({
          equipment: equip,
          matchReason: item.matchReason,
          compatibilityNote: item.compatibilityNote,
          alternatives,
        });
      }

      if (recs.length > 0) {
        return {
          mode: 'gemini',
          query,
          intentSummary: parsed.intentSummary || `Matched equipment for "${query}"`,
          extractedKeywords: parsed.extractedKeywords ?? [],
          recommendations: recs,
        };
      }
    } catch (err) {
      console.warn('Gemini discovery fallback triggered:', err instanceof Error ? err.message : err);
    }
  }

  const fallback = keywordSearchCatalog(query, catalog);
  const recommendations: AIDiscoveryRecommendation[] = fallback.matches.map((m) => {
    const alternatives = m.equip.compatibleIds
      .map((cid) => catalog.find((e) => e.id === cid))
      .filter((e): e is Equipment => Boolean(e));

    const unitList = m.equip.units.map((u) => u.unitCode).join(', ');
    return {
      equipment: m.equip,
      matchReason: `Available in ${m.equip.location}${unitList ? ` · Units: ${unitList}` : ''}. ${m.equip.availableTodayCount} of ${m.equip.units.length} unit(s) open today. Matched on: ${m.matchedTerms.join(', ')}.`,
      compatibilityNote:
        alternatives.length > 0
          ? `Compatible alternatives across campus: ${alternatives.map((a) => `${a.name} (${a.labName})`).join(', ')}.`
          : 'No cross-lab substitute required for this dedicated station.',
      alternatives,
    };
  });

  const topMatch = recommendations[0]?.equipment;
  return {
    mode: 'keyword_fallback',
    query,
    intentSummary: topMatch
      ? `You can get "${topMatch.name}" in ${topMatch.location} — ${topMatch.availableTodayCount} of ${topMatch.units.length} units open today.`
      : `No exact specification match found for "${query}". Try searching by equipment name or browsing the catalog.`,
    extractedKeywords: fallback.extractedKeywords,
    recommendations,
  };
}

export async function generateProjectDependencyPlan(params: {
  projectName: string;
  projectDescription: string;
  deadline: string;
  studentId?: string;
  studentName?: string;
}): Promise<ProjectPlanResponse> {
  const catalog = await getAllEquipment();
  const catalogContext = catalog.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    labName: e.labName,
    specs: e.specs,
    requiresCertification: e.requiresCertification,
    certificationName: e.certificationName,
    compatibleIds: e.compatibleIds,
  }));

  const ai = getGeminiClient();
  if (ai && catalog.length > 0) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Project Name: "${params.projectName}"\nDescription: "${params.projectDescription}"\nTarget Deadline: ${params.deadline}\n\nAvailable Campus Equipment Database:\n${JSON.stringify(catalogContext)}`,
        config: {
          systemInstruction:
            'You are a university engineering project advisor. Break the student project into 3 to 5 logical sequential stages with explicit stage dependencies (dependsOn array of prior stage numbers), mapping each stage ONLY to real equipment IDs from the database when supported by the equipment specs and project description.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              stages: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stageNumber: { type: Type.INTEGER },
                    stageTitle: { type: Type.STRING },
                    objective: { type: Type.STRING },
                    dependsOn: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                    equipmentId: { type: Type.INTEGER },
                    rationale: { type: Type.STRING },
                    estimatedHours: { type: Type.INTEGER },
                  },
                  required: [
                    'stageNumber',
                    'stageTitle',
                    'objective',
                    'dependsOn',
                    'equipmentId',
                    'rationale',
                    'estimatedHours',
                  ],
                },
              },
            },
            required: ['summary', 'stages'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        summary?: string;
        stages?: {
          stageNumber: number;
          stageTitle: string;
          objective: string;
          dependsOn: number[];
          equipmentId: number;
          rationale: string;
          estimatedHours: number;
        }[];
      };

      if (parsed.stages && parsed.stages.length > 0) {
        const stages: ProjectStagePlan[] = [];
        for (const st of parsed.stages) {
          const eq = catalog.find((e) => e.id === st.equipmentId) ?? null;
          const alts = eq
            ? eq.compatibleIds
                .map((cid) => catalog.find((e) => e.id === cid))
                .filter((e): e is Equipment => Boolean(e))
            : [];

          let safetyNote: string | null = null;
          if (eq?.requiresCertification) {
            const certified =
              params.studentId && params.studentName
                ? await isStudentCertified(params.studentId, params.studentName, eq.certificationName)
                : false;
            safetyNote = certified
              ? `Safety verified: "${eq.certificationName}" active.`
              : `Requires "${eq.certificationName}" before booking.`;
          }

          stages.push({
            stageNumber: st.stageNumber,
            stageTitle: st.stageTitle,
            objective: st.objective,
            dependsOn: st.dependsOn,
            recommendedEquipment: eq,
            alternativeEquipment: alts,
            rationale: st.rationale,
            estimatedHours: Math.max(1, st.estimatedHours),
            safetyNote,
          });
        }

        return {
          mode: 'gemini',
          projectName: params.projectName,
          deadline: params.deadline,
          summary: parsed.summary || `Structured ${stages.length}-stage dependency sequence for ${params.projectName}.`,
          stages,
        };
      }
    } catch (err) {
      console.warn('Gemini project planner fallback triggered:', err instanceof Error ? err.message : err);
    }
  }

  // Deterministic stage & dependency fallback grounded in actual DB equipment records
  const text = `${params.projectName} ${params.projectDescription}`.toLowerCase();
  const findBestByTerms = (terms: string[]): Equipment | null => {
    let best: Equipment | null = null;
    let bestScore = 0;
    for (const eq of catalog) {
      const hay = `${eq.name} ${eq.category} ${eq.description} ${JSON.stringify(eq.specs)}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (hay.includes(t)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = eq;
      }
    }
    return best;
  };

  const stages: ProjectStagePlan[] = [];
  const pushStage = async (
    title: string,
    objective: string,
    dependsOn: number[],
    eq: Equipment | null,
    rationale: string,
    hours: number
  ) => {
    const alts = eq
      ? eq.compatibleIds
          .map((cid) => catalog.find((e) => e.id === cid))
          .filter((e): e is Equipment => Boolean(e))
      : [];
    let safetyNote: string | null = null;
    if (eq?.requiresCertification) {
      const certified =
        params.studentId && params.studentName
          ? await isStudentCertified(params.studentId, params.studentName, eq.certificationName)
          : false;
      safetyNote = certified
        ? `Safety verified: "${eq.certificationName}" active.`
        : `Requires "${eq.certificationName}" certification before booking.`;
    }
    stages.push({
      stageNumber: stages.length + 1,
      stageTitle: title,
      objective,
      dependsOn,
      recommendedEquipment: eq,
      alternativeEquipment: alts,
      rationale,
      estimatedHours: hours,
      safetyNote,
    });
  };

  if (text.match(/ppt|presentation|slide|report|document|paper|thesis/)) {
    await pushStage(
      'Data Plotting, Report Writing & PPT Slides',
      'Compile experimental waveforms, run analysis, and prepare technical report or PPT slides.',
      [],
      findBestByTerms(['workstation', 'ppt', 'report', 'computing', 'matlab']),
      'Matched computing/documentation workstation in the active campus database.',
      2
    );
  }

  if (text.match(/iot|sensor|arduino|aurdiuno|smart|monitor|node|circuit|motor/)) {
    await pushStage(
      'Circuit & Sensor Prototyping',
      'Wire microcontroller I/O, sensor interfaces (I2C/SPI/UART), and firmware baseline.',
      stages.length > 0 ? [stages.length] : [],
      findBestByTerms(['arduino', 'iot', 'sensor', 'microcontroller']),
      'Matched microcontroller / sensor kit in the active campus database.',
      2
    );
  } else if (text.match(/robot|arm|kinematic|gripper|autonomous|mech/)) {
    await pushStage(
      'Mechanical Bracket Fabrication',
      'Fabricate mounting brackets, sensor housings, or actuator fixtures.',
      stages.length > 0 ? [stages.length] : [],
      findBestByTerms(['3d printer', 'cnc', 'mechanical', 'robotic']),
      'Matched mechanical fabrication instrument in the active campus database.',
      3
    );
  } else if (stages.length === 0) {
    await pushStage(
      'Primary Subsystem Setup',
      'Configure baseline controller or lab station and validate requirements.',
      [],
      catalog[0] ?? null,
      catalog[0] ? `Matched ${catalog[0].name} in ${catalog[0].location}.` : 'Add equipment in Admin / Faculty Portal to map stages.',
      2
    );
  }

  if (text.match(/signal|circuit|fpga|arduino|robot|voltage|sensor|spi|oscilloscope/)) {
    await pushStage(
      'Signal Timing & Protocol Debugging',
      'Inspect bus clocks, transient edges, and PWM/SPI timing waveforms.',
      [stages.length],
      findBestByTerms(['oscilloscope', 'electronics', 'spi', 'bandwidth']),
      'Matched oscilloscope / electronics test equipment in the active campus database.',
      2
    );
  }

  if (text.match(/fpga|verilog|hdl|accelerator|dsp|edge|vision/)) {
    await pushStage(
      'Hardware Processing & Acceleration',
      'Synthesize and benchmark real-time logic pipelines on target hardware.',
      [stages.length],
      findBestByTerms(['fpga', 'embedded', 'verilog', 'raspberry']),
      'Matched embedded / FPGA hardware platform in the active campus database.',
      3
    );
  }

  await pushStage(
    'Final Verification & Documentation',
    'Verify final test results and compile report/presentation deliverables.',
    [stages.length],
    findBestByTerms(['multimeter', 'workstation', 'report', 'ppt']) ?? catalog[0] ?? null,
    'Final verification stage mapped to active campus lab instrumentation.',
    1
  );

  return {
    mode: 'keyword_fallback',
    projectName: params.projectName,
    deadline: params.deadline,
    summary: `Generated a ${stages.length}-stage dependency sequence grounded in live campus catalog records.`,
    stages,
  };
}
