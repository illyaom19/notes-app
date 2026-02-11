import test from "node:test";
import assert from "node:assert/strict";

import { selectRasterLevelForZoom } from "../../src/widgets/pdf/pdf-rasterizer.js";

test("selectRasterLevelForZoom supports runtime rasterLevels entries", () => {
  const level = selectRasterLevelForZoom(
    {
      viewportAt1: { width: 900, height: 1200 },
      rasterLevels: [
        { id: "low", width: 640, height: 853 },
        { id: "mid", width: 1024, height: 1365 },
        { id: "high", width: 1536, height: 2048 },
      ],
    },
    1,
  );

  assert.equal(level?.id, "mid");
});

test("selectRasterLevelForZoom keeps compatibility with persisted levels entries", () => {
  const level = selectRasterLevelForZoom(
    {
      width: 700,
      levels: [
        { id: "low", width: 640, height: 914 },
        { id: "high", width: 1280, height: 1828 },
      ],
    },
    1,
  );

  assert.equal(level?.id, "low");
});
