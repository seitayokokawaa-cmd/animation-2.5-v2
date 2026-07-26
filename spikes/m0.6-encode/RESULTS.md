# Spike M0.6 — Deterministic encode pipeline

**Question:** do 60 rasterized frames piped into ffmpeg (ffmpeg-static) with
bitexact flags produce a byte-identical MP4 across repeated runs?

**Answer: yes.** Two encodes of the same 60 PNG frames (1920×1080, 30 fps,
libx264 crf 18, `-fflags +bitexact -flags:v +bitexact -map_metadata -1
-movflags +faststart`) hash identically:

```
ffmpeg-static 5.3.0 → ffmpeg 7.0.2-static (johnvansickle build)
frames: 60 @ 1920x1080 30fps
rasterize total: 4255 ms (70.9 ms/frame)
encode total:    2469 ms
render-a sha256: 5ca9ea0c99061de9b61b39d12bfb2d66f2d533c076145bb12b3dd3b9b5dc4a00
render-b sha256: 5ca9ea0c99061de9b61b39d12bfb2d66f2d533c076145bb12b3dd3b9b5dc4a00
byte-identical:  true
```

Notes:

- Frames are piped via `image2pipe` on stdin — no temp frame files; this is
  the exact shape the M2.6 render service will use.
- Default multithreaded x264 stays deterministic with these flags, matching
  the pre-plan sandbox verification (plan v1 §0).
- `pnpm-workspace.yaml` gained `onlyBuiltDependencies` so pnpm 10 runs the
  ffmpeg-static / resvg-js install scripts (pnpm 10 blocks build scripts by
  default, which silently skipped the ffmpeg binary download).
- Rerun with: `node spikes/m0.6-encode/run.mjs` (writes `out/`, gitignored).
