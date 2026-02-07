import test from "node:test";
import assert from "node:assert/strict";

import { createOnboardingStateService } from "../../src/features/onboarding/onboarding-state-service.js";
import { createMemoryStorage } from "../helpers/browser-env.mjs";

test("onboarding service tracks completion and dismissal per context", () => {
  const storage = createMemoryStorage();
  const service = createOnboardingStateService({ storage, profileId: "user-a" });

  assert.equal(service.isHintsEnabled("ctx-1"), true);
  assert.equal(service.getHintState("ctx-1", "import-pdf"), null);

  assert.equal(service.markDismissed("ctx-1", "import-pdf"), true);
  assert.equal(service.getHintState("ctx-1", "import-pdf")?.completionState, "dismissed");

  assert.equal(service.markCompleted("ctx-1", "capture-reference"), true);
  assert.equal(service.getHintState("ctx-1", "capture-reference")?.completionState, "completed");
});

test("onboarding service isolates hints by context and profile", () => {
  const storage = createMemoryStorage();
  const profileA = createOnboardingStateService({ storage, profileId: "user-a" });
  const profileB = createOnboardingStateService({ storage, profileId: "user-b" });

  profileA.markCompleted("ctx-a", "import-pdf");
  profileA.markDismissed("ctx-b", "capture-reference");
  profileB.markCompleted("ctx-a", "import-pdf");

  assert.equal(profileA.getHintState("ctx-a", "import-pdf")?.completionState, "completed");
  assert.equal(profileA.getHintState("ctx-b", "capture-reference")?.completionState, "dismissed");
  assert.equal(profileB.getHintState("ctx-b", "capture-reference"), null);
});

test("onboarding service toggles hints and resets context", () => {
  const storage = createMemoryStorage();
  const service = createOnboardingStateService({ storage, profileId: "user-a" });

  service.markCompleted("ctx-1", "import-pdf");
  service.setHintsEnabled("ctx-1", false);
  assert.equal(service.isHintsEnabled("ctx-1"), false);

  service.resetContext("ctx-1");
  assert.equal(service.isHintsEnabled("ctx-1"), true);
  assert.deepEqual(service.listHintStates("ctx-1"), []);
});

test("onboarding service does not throw when storage writes fail", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  };
  const service = createOnboardingStateService({ storage, profileId: "user-a" });

  assert.doesNotThrow(() => {
    service.markCompleted("ctx-1", "import-pdf");
    service.markDismissed("ctx-1", "capture-reference");
    service.setHintsEnabled("ctx-1", false);
    service.resetContext("ctx-1");
  });
});
