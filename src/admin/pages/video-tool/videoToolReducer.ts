import type { VideoToolAction, VideoToolState, ExportPhase, VideoToolEvent } from './types';

const transitions: Record<ExportPhase, Partial<Record<VideoToolEvent, ExportPhase>>> = {
    idle: {
        INIT: 'loading',
        SOURCE_ADDED: 'draft_ready',
        SEGMENT_SPLIT: 'draft_ready'
    },
    loading: {
        SOURCE_ADDED: 'draft_ready',
        PREFLIGHT_FAILED: 'failed',
        INIT: 'loading'
    },
    draft_ready: {
        EXPORT_REQUESTED: 'preflight',
        SOURCE_ADDED: 'draft_ready',
        SEGMENT_SPLIT: 'draft_ready'
    },
    preflight: {
        PREFLIGHT_FAILED: 'failed',
        PREFLIGHT_PASSED: 'ready',
        CANCEL: 'cancelled'
    },
    ready: {
        RENDER_STARTED: 'rendering',
        CANCEL: 'cancelled'
    },
    rendering: {
        RENDER_DONE: 'uploading',
        UPLOAD_FAILED: 'failed',
        OFFLINE_DETECTED: 'paused_offline',
        AUTH_EXPIRED: 'auth_required',
        CANCEL: 'cancelled'
    },
    uploading: {
        VERIFY_STARTED: 'verifying',
        UPLOAD_FAILED: 'failed',
        OFFLINE_DETECTED: 'paused_offline',
        AUTH_EXPIRED: 'auth_required',
        CANCEL: 'cancelled'
    },
    verifying: {
        COMPLETE: 'completed',
        UPLOAD_FAILED: 'failed',
        OFFLINE_DETECTED: 'paused_offline',
        AUTH_EXPIRED: 'auth_required',
        CANCEL: 'cancelled'
    },
    completed: {
        RETRY: 'preflight',
        INIT: 'loading'
    },
    failed: {
        RETRY: 'preflight',
        CANCEL: 'cancelled'
    },
    paused_offline: {
        RETRY: 'uploading',
        CANCEL: 'cancelled'
    },
    auth_required: {
        RETRY: 'uploading',
        CANCEL: 'cancelled'
    },
    cancelled: {
        RETRY: 'preflight'
    }
};

export const videoToolReducer = (state: VideoToolState, action: VideoToolAction): VideoToolState => {
    switch (action.type) {
        case 'data/loading':
            return {
                ...state,
                data: { ...state.data, loading: true, error: '' }
            };
        case 'data/loaded':
            return {
                ...state,
                data: { payload: action.payload, loading: false, error: '' },
                export: {
                    ...state.export,
                    phase: state.export.phase === 'loading' ? 'draft_ready' : state.export.phase
                }
            };
        case 'data/error':
            return {
                ...state,
                data: { ...state.data, loading: false, error: action.error }
            };
        case 'sources/set':
            return {
                ...state,
                sources: { ...state.sources, items: action.sources }
            };
        case 'timeline/set-segments':
            return {
                ...state,
                timeline: { ...state.timeline, segments: action.segments }
            };
        case 'helper/status':
            return {
                ...state,
                helper: {
                    ...state.helper,
                    status: action.status,
                    issueMessage: action.issueMessage ?? state.helper.issueMessage
                }
            };
        case 'export/phase':
            return {
                ...state,
                export: {
                    ...state.export,
                    phase: action.phase,
                    message: action.message ?? state.export.message
                }
            };
        case 'export/renderJobId':
            return {
                ...state,
                export: {
                    ...state.export,
                    renderJobId: action.jobId
                }
            };
        case 'transition': {
            const currentPhase = state.export.phase;
            const nextPhase = transitions[currentPhase]?.[action.event];

            if (!nextPhase) {
                console.warn(`[VideoTool StateMachine] Invalid transition: state=${currentPhase} event=${action.event}`);
                return state;
            }

            return {
                ...state,
                export: {
                    ...state.export,
                    phase: nextPhase,
                    message: action.message ?? state.export.message
                }
            };
        }
        case 'layout/preview-width':
            if (state.layout.previewPanelWidth === action.width) {
                return state;
            }
            return {
                ...state,
                layout: { ...state.layout, previewPanelWidth: action.width }
            };
        default:
            return state;
    }
};
