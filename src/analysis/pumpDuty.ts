/**
 * Pump duty-point analysis (roadmap feature P4).
 *
 * A centrifugal pump should run near its best-efficiency point (BEP). Running
 * well below BEP invites low-flow recirculation, suction/discharge cavitation,
 * and vibration; running well above BEP risks motor overload and NPSH
 * problems. The Hydraulic Institute recommends staying within ~70-120% of BEP
 * flow. This analyzer classifies each pump's steady duty point against that
 * window so the UI can warn the engineer.
 */

import { PipelineNetwork } from '../domain/network';

/** Minimal shape shared by the solver output and the UI's stored result. */
export interface DutyResultView {
  links: Map<string, { flow: number; velocity: number; headLoss: number }>;
}

export type DutyStatus = 'low-flow' | 'ok' | 'overload';

export interface PumpDuty {
  linkId: string;
  pumpName: string;
  /** Duty flow [m^3/s]. */
  flow: number;
  bepFlow: number;
  /** flow / bepFlow. */
  bepRatio: number;
  status: DutyStatus;
  message: string;
}

const LOW_LIMIT = 0.7;
const HIGH_LIMIT = 1.2;

export function analyzePumpDuty(net: PipelineNetwork, result: DutyResultView): PumpDuty[] {
  const duties: PumpDuty[] = [];

  for (const link of net.links) {
    if (link.kind !== 'pump') continue;
    const r = result.links.get(link.id);
    if (!r) continue;

    const flow = r.flow;
    const bepFlow = link.spec.bepFlow;
    const bepRatio = bepFlow > 0 ? flow / bepFlow : NaN;

    let status: DutyStatus = 'ok';
    let message = 'Operating within the recommended 70-120% BEP window.';
    if (bepRatio < LOW_LIMIT) {
      status = 'low-flow';
      message = `Low-flow operation at ${(bepRatio * 100).toFixed(0)}% BEP — recirculation / cavitation risk.`;
    } else if (bepRatio > HIGH_LIMIT) {
      status = 'overload';
      message = `Overload operation at ${(bepRatio * 100).toFixed(0)}% BEP — motor / NPSH risk.`;
    }

    duties.push({ linkId: link.id, pumpName: link.spec.name, flow, bepFlow, bepRatio, status, message });
  }

  return duties;
}
