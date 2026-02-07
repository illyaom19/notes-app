export const SCHEMA_VERSION = 2;

export function wrapEnvelope(data) {
  return {
    schemaVersion: SCHEMA_VERSION,
    data,
  };
}

export function readEnvelope(raw) {
  if (!raw) {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return null;
  }

  if (parsed && typeof parsed === "object" && Number.isFinite(parsed.schemaVersion) && parsed.data) {
    return parsed;
  }

  return {
    schemaVersion: 1,
    data: parsed,
  };
}
