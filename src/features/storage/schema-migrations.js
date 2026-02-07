function asObject(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate;
}

export function isEnvelope(candidate) {
  const source = asObject(candidate);
  if (!source) {
    return false;
  }

  return Number.isInteger(source.schemaVersion) && source.schemaVersion >= 1 && "data" in source;
}

export function migrateSchema({
  schemaVersion,
  data,
  targetSchemaVersion,
  migrations,
  onMigrationStep,
}) {
  let currentVersion = Number.isInteger(schemaVersion) && schemaVersion >= 1 ? schemaVersion : 1;
  const targetVersion = Number.isInteger(targetSchemaVersion) && targetSchemaVersion >= 1
    ? targetSchemaVersion
    : currentVersion;

  let currentData = data;

  if (currentVersion > targetVersion) {
    return {
      schemaVersion: currentVersion,
      data: currentData,
      migrated: false,
      downgraded: false,
      migrationSteps: [],
    };
  }

  const steps = [];
  while (currentVersion < targetVersion) {
    const nextVersion = currentVersion + 1;
    const migrate = migrations?.[nextVersion];
    if (typeof migrate !== "function") {
      throw new Error(`Missing migration step ${currentVersion} -> ${nextVersion}.`);
    }

    currentData = migrate(currentData);
    steps.push(`${currentVersion}->${nextVersion}`);
    currentVersion = nextVersion;
    onMigrationStep?.({
      from: nextVersion - 1,
      to: nextVersion,
    });
  }

  return {
    schemaVersion: currentVersion,
    data: currentData,
    migrated: steps.length > 0,
    downgraded: false,
    migrationSteps: steps,
  };
}

export function readMigratedEnvelope({
  storage,
  key,
  targetSchemaVersion,
  migrations,
  defaultData,
  legacySchemaVersion = 1,
  persistAfterRead = true,
  onMigrationStep,
  onError,
}) {
  const fallback = {
    schemaVersion: targetSchemaVersion,
    data: defaultData,
    migrated: false,
    migrationSteps: [],
    corrupted: false,
    missing: true,
  };

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      if (persistAfterRead) {
        writeEnvelope({
          storage,
          key,
          schemaVersion: targetSchemaVersion,
          data: defaultData,
        });
      }
      return fallback;
    }

    const parsed = JSON.parse(raw);
    const sourceEnvelope = isEnvelope(parsed)
      ? {
          schemaVersion: parsed.schemaVersion,
          data: parsed.data,
        }
      : {
          schemaVersion: legacySchemaVersion,
          data: parsed,
        };

    const migrated = migrateSchema({
      schemaVersion: sourceEnvelope.schemaVersion,
      data: sourceEnvelope.data,
      targetSchemaVersion,
      migrations,
      onMigrationStep,
    });

    if (persistAfterRead && (migrated.migrated || !isEnvelope(parsed))) {
      writeEnvelope({
        storage,
        key,
        schemaVersion: migrated.schemaVersion,
        data: migrated.data,
      });
    }

    return {
      schemaVersion: migrated.schemaVersion,
      data: migrated.data,
      migrated: migrated.migrated,
      migrationSteps: migrated.migrationSteps,
      corrupted: false,
      missing: false,
    };
  } catch (error) {
    onError?.(error);

    if (persistAfterRead) {
      writeEnvelope({
        storage,
        key,
        schemaVersion: targetSchemaVersion,
        data: defaultData,
      });
    }

    return {
      schemaVersion: targetSchemaVersion,
      data: defaultData,
      migrated: false,
      migrationSteps: [],
      corrupted: true,
      missing: false,
    };
  }
}

export function writeEnvelope({ storage, key, schemaVersion, data }) {
  const version = Number.isInteger(schemaVersion) && schemaVersion >= 1 ? schemaVersion : 1;
  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: version,
      data,
    }),
  );
}
