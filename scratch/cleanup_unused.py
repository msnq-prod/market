import os

path = '/Users/nikitamysnik/Desktop/progs/stones/src/admin/pages/video-tool/VideoToolController.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Helper list of replacements
replacements = [
    (
        "const [helperDiagnosticCopied, setHelperDiagnosticCopied] = useState(false);",
        "// const [helperDiagnosticCopied, setHelperDiagnosticCopied] = useState(false);"
    ),
    (
        "const [renderProgress, setRenderProgress] = useState({ processed: 0, total: 0 });",
        "// const [renderProgress, setRenderProgress] = useState({ processed: 0, total: 0 });"
    ),
    (
        "const [v2Runs, setV2Runs] = useState<any[]>([]);",
        "// const [v2Runs, setV2Runs] = useState<any[]>([]);"
    ),
    (
        "setV2Runs(runsPayload.runs);",
        "// setV2Runs(runsPayload.runs);"
    ),
    (
        "setHelperDiagnosticCopied(true);",
        "// setHelperDiagnosticCopied(true);"
    ),
    (
        "window.setTimeout(() => setHelperDiagnosticCopied(false), 2200);",
        "// window.setTimeout(() => setHelperDiagnosticCopied(false), 2200);"
    ),
    (
        "const activeSourceNeedsLocalFile = Boolean(activeSource && (isDesktopApp ? !activeSource.stagedSourceId : (!activeSource.file && !activeSource.helperSourceId)));",
        "// const activeSourceNeedsLocalFile = Boolean(activeSource && (isDesktopApp ? !activeSource.stagedSourceId : (!activeSource.file && !activeSource.helperSourceId)));"
    ),
    (
        "const rulerMarks = useMemo(",
        "/* const rulerMarks = useMemo("
    ),
    (
        "const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLElement>, rect: DOMRect) => {",
        "/* const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLElement>, rect: DOMRect) => {"
    ),
    (
        "const seekTimelineAtClientX = useCallback((clientX: number) => {",
        "/* const seekTimelineAtClientX = useCallback((clientX: number) => {"
    ),
    (
        "const seekToNearestCut = (direction: 'prev' | 'next') => {",
        "/* const seekToNearestCut = (direction: 'prev' | 'next') => {"
    ),
    (
        "const handleResetSource = () => {",
        "/* const handleResetSource = () => {"
    ),
    (
        "const handleExport = async () => {",
        "/* const handleExport = async () => {"
    ),
    (
        "const clipCounterText = `Товарных клипов: ${totalSegments} / ${expectedOutputCount}`;",
        "// const clipCounterText = `Товарных клипов: ${totalSegments} / ${expectedOutputCount}`;"
    ),
    (
        "const selectedSegmentIsDeleted = Boolean(selectedSegmentRow?.isDeleted);",
        "// const selectedSegmentIsDeleted = Boolean(selectedSegmentRow?.isDeleted);"
    ),
    (
        "const selectedSegmentLocked = Boolean(",
        "/* const selectedSegmentLocked = Boolean("
    ),
    (
        "const helperProblemTitle = isDesktopApp",
        "/* const helperProblemTitle = isDesktopApp"
    ),
    (
        "const helperSteps = isDesktopApp",
        "/* const helperSteps = isDesktopApp"
    ),
    (
        "const canCancelSession = Boolean(session && ['OPEN', 'UPLOADING', 'FAILED', 'ABANDONED'].includes(session.status));",
        "// const canCancelSession = Boolean(session && ['OPEN', 'UPLOADING', 'FAILED', 'ABANDONED'].includes(session.status));"
    )
]

for target, replacement in replacements:
    content = content.replace(target, replacement)

# For block comment closings, let's close them cleanly
content = content.replace(
    "    }, [durationMs, visibleDurationMs, visibleStartMs]);\n    const fitTimelineToAll = useCallback(() => {",
    "    }, [durationMs, visibleDurationMs, visibleStartMs]); */\n    const fitTimelineToAll = useCallback(() => {"
)

code_timeline_wheel_end = """    }, [durationMs, timelineClientXToMs, updateTimelineViewport, visibleDurationMs, visibleStartMs, zoomTimelineTo]);
    const timelineViewportCenterMs = () => {"""
content = content.replace(
    code_timeline_wheel_end,
    """    }, [durationMs, timelineClientXToMs, updateTimelineViewport, visibleDurationMs, visibleStartMs, zoomTimelineTo]); */\n    const timelineViewportCenterMs = () => {"""
)

content = content.replace(
    "        syncVideoTime(nextPlayheadMs);\n    }, [syncVideoTime, timelineClientXToMs]);\n    const handleTimelinePointerDown = (event: React.PointerEvent<HTMLElement>) => {",
    "        syncVideoTime(nextPlayheadMs);\n    }, [syncVideoTime, timelineClientXToMs]); */\n    const handleTimelinePointerDown = (event: React.PointerEvent<HTMLElement>) => {"
)

content = content.replace(
    "            syncVideoTime(nextCut ?? durationMs);\n        }\n    };\n    const syncVideoTime = (timeMs: number) => {",
    "            syncVideoTime(nextCut ?? durationMs);\n        }\n    }; */\n    const syncVideoTime = (timeMs: number) => {"
)

content = content.replace(
    "        setNotice(null);\n    };\n    const handleSourcePicked = (file: File | null,",
    "        setNotice(null);\n    }; */\n    const handleSourcePicked = (file: File | null,"
)

content = content.replace(
    "            setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Неизвестная ошибка экспорта' });\n        }\n    };\n    const handleCollectDiagnostics = () => {",
    "            setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Неизвестная ошибка экспорта' });\n        }\n    }; */\n    const handleCollectDiagnostics = () => {"
)

content = content.replace(
    "        || (selectedSegmentRow?.role === 'intro' && session?.render_manifest?.intro_asset)\n    );\n    const helperNeedsAttention = helperStatus === 'unavailable'",
    "        || (selectedSegmentRow?.role === 'intro' && session?.render_manifest?.intro_asset)\n    ); */\n    const helperNeedsAttention = helperStatus === 'unavailable'"
)

content = content.replace(
    "                        : 'Helper не запущен';\n    const helperProblemDescription = isDesktopApp",
    "                        : 'Helper не запущен'; */\n    const helperProblemDescription = isDesktopApp"
)

content = content.replace(
    "                : ['Откройте ZAGARAMI Video Helper', 'Нажмите «Проверить»', 'Загрузите вертикальный исходник'];\n    const helperQuickActionTitle = isDesktopApp",
    "                : ['Откройте ZAGARAMI Video Helper', 'Нажмите «Проверить»', 'Загрузите вертикальный исходник']; */\n    const helperQuickActionTitle = isDesktopApp"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Cleanup script executed successfully.")
