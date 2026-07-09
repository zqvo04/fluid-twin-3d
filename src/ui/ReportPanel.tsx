/**
 * Engineering report export. Generates the report from the current solved
 * network and offers HTML (printable) and CSV downloads, with an inline verdict
 * and findings preview.
 */

import { useMemo } from 'react';
import { useAppStore } from './store';
import { waterProperties } from '../domain/fluid';
import { generateReport, reportToHtml, reportToCsv } from '../analysis/report';
import type { AnalysisResult } from './store';
import type { SteadyResult } from '../physics/steadySolver';

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** The report generator wants a SteadyResult; the stored result is structurally
 *  compatible for the fields it reads. */
function asSteady(r: AnalysisResult): SteadyResult {
  return r as unknown as SteadyResult;
}

export function ReportPanel() {
  const network = useAppStore((s) => s.network);
  const result = useAppStore((s) => s.result);

  const report = useMemo(
    () => (result ? generateReport(network, asSteady(result), waterProperties(network.temperatureC)) : null),
    [network, result],
  );

  if (!result) {
    return (
      <div className="section">
        <h2>Report</h2>
        <p className="muted">Run the analysis to generate an engineering report.</p>
      </div>
    );
  }
  if (!report) return null;

  const violations = report.findings.filter((f) => f.severity === 'violation').length;
  const warnings = report.findings.filter((f) => f.severity === 'warning').length;

  return (
    <div className="section">
      <h2>Report</h2>
      <div className="status">
        <span className={report.verdict === 'PASS' ? 'ok' : 'warn'}>Verdict: {report.verdict}</span>
        <span className="muted"> · {violations} violations · {warnings} warnings</span>
      </div>
      <div className="grid2">
        <button onClick={() => download('pipeline-report.html', reportToHtml(report), 'text/html')}>
          Report (HTML)
        </button>
        <button onClick={() => download('pipeline-results.csv', reportToCsv(report), 'text/csv')}>
          Results (CSV)
        </button>
      </div>
    </div>
  );
}
