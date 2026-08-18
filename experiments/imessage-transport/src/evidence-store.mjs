import { mkdir, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function createEvidenceRecorder(
  path = process.env.SIDEBAR_POC_EVIDENCE_PATH ?? ".local/evidence.jsonl",
) {
  const absolutePath = resolve(path);

  return async function recordEvidence(entry) {
    await mkdir(dirname(absolutePath), { recursive: true });
    await appendFile(absolutePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  };
}
