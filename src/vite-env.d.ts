/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_VIDEO_EXPORT_HELPER_URL?: string;
    readonly VITE_VIDEO_HELPER_DOWNLOAD_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
