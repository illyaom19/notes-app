# UI implementation measurements — 2026-10-08

Reproduce CPU workloads with `node tests/performance/workloads.mjs`. The optional argument is a baseline Git revision (default `6151df2`). These are local Node 20.20.0 CPU microbenchmarks, not physical tablet or end-to-end latency measurements. Workloads use memory storage and synthetic content. No hardware performance acceptance is implied.

| Workload | Samples | Median | p95 |
| --- | ---: | ---: | ---: |
| Baseline: repeat registration of same 10-page, ~1 MB raster object | 100 | 5.100 ms | 6.558 ms |
| Current: same warm raster registration | 100 | 0.00095 ms | 0.00679 ms |
| Current: history capture with 1,000 strokes / 20,000 points | 30 | 10.539 ms | 11.989 ms |
| Current: full reindex of 1,000 notes (~1.7 MB text) | 30 | 41.022 ms | 46.646 ms |
| Current: query over those 1,000 notes | 100 | 0.744 ms | 1.557 ms |

The raster improvement comes from retaining an asset ID for immutable raster objects, avoiding repeated serialization/hashing. Cold imports still decode/rasterize and persist real assets. History capture and full reindex remain measurable main-thread costs; the figures justify further incremental snapshot/index work for dense notebooks. They are not evidence that all performance work is complete.

PDF decoding now shares an LRU cache with two concurrent loads and a 64 MiB soft budget (one oversized page can exceed it). Source compressed assets have separate storage ownership. Module loading remains lazy even though the service worker precaches local dependencies.

Browser emulation measured the 768px-wide tablet header at 109.94px, versus the 332px audit baseline. Viewport checks cover 390×844, 768×1024, 1024×600 and 1440×900; physical pen latency, palm rejection, iPad memory limits, cold-device startup and long-session pressure remain release gates.

## Incremental search follow-up

Caching the exact searchable inputs skips extraction for unchanged entries while still detecting in-place metadata/text/diagram edits. A follow-up run of the same 30 reindex samples (first cold, subsequent unchanged) measured median **5.503 ms**, p95 **10.343 ms**, compared with 41.022/46.646 ms before input caching. Query median/p95 was 0.547/0.867 ms. Cold extraction is still necessary; this improvement applies to repeated indexing, not initial import. Regression tests exercise invalidation after in-place edits and case-preserving snippets.
