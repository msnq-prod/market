import { HqDesktopDownloadPlaceholder } from '../components/HqDesktopDownloadPlaceholder';
import { isStonesDesktop } from '../../utils/desktop';
import { Navigate } from 'react-router-dom';

export function VideoToolLauncher() {
    if (isStonesDesktop()) {
        return <Navigate to="/admin/acceptance" replace />;
    }

    return <HqDesktopDownloadPlaceholder toolName="Photo Tool и Video Tool" />;
}
