/**
 * Project serialization — the network graph is the single source of truth, so
 * a project file is just the versioned JSON of a PipelineNetwork. All catalog
 * data on the links (pipe sizes, valve types, pump coefficients) is plain data,
 * so no custom (de)serializers are needed; we only wrap it with a schema
 * version and validate structure on load.
 */

import { PipelineNetwork, validateNetwork } from './network';

export const SCHEMA_VERSION = 1;

export interface ProjectFile {
  schemaVersion: number;
  savedAt: string;
  network: PipelineNetwork;
}

export function serializeProject(net: PipelineNetwork): string {
  const file: ProjectFile = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    network: net,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Parse and validate a project file. Throws with a clear message on malformed
 * input or an unsupported schema version so the UI can surface it.
 */
export function deserializeProject(json: string): PipelineNetwork {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Project file is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Project file is empty or not an object.');
  }
  const file = parsed as Partial<ProjectFile>;

  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported project schema version ${file.schemaVersion ?? '(missing)'}; expected ${SCHEMA_VERSION}.`,
    );
  }

  const net = file.network;
  if (
    !net ||
    !Array.isArray(net.nodes) ||
    !Array.isArray(net.links) ||
    !Array.isArray(net.subAssemblies) ||
    typeof net.temperatureC !== 'number'
  ) {
    throw new Error('Project file is missing required network fields.');
  }

  const issues = validateNetwork(net);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Project failed validation: ${errors.map((e) => e.message).join('; ')}`);
  }

  return net;
}
