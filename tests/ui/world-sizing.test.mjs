import test from "node:test";
import assert from "node:assert/strict";

import { defaultWorldSizeConfig, saveWorldSizeConfig } from "../../src/features/widget-system/world-sizing.js";

test("world size config save tolerates storage quota failures", () => {
  const storage = {
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };

  const normalized = saveWorldSizeConfig(defaultWorldSizeConfig(), { storage });
  assert.ok(normalized["pdf-document"]);
  assert.ok(normalized["expanded-area"]);
});
