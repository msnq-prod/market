import type { VideoToolAction, VideoToolState } from './types';

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
                data: { payload: action.payload, loading: false, error: '' }
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
        case 'export/session':
            return {
                ...state,
                export: { ...state.export, session: action.session }
            };
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
