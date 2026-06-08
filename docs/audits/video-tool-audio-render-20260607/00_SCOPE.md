# Scope

- Target: Video Tool v3 local render/editor preview audio.
- Boundary: Electron HQ runtime FFmpeg prepare/render, editor preview UI, tests, FFmpeg docs.
- Expected: prepared preview and rendered item mp4 keep source audio; sources without audio still render with silent audio.
- Non-goals: UI audio editor, backend upload contract change.
