import { AcceptanceWorkspace } from './AcceptanceWorkspace';
import { CollectionOrdersWorkspace } from './CollectionOrdersWorkspace';
import { IdentificationWorkspace } from './IdentificationWorkspace';
import { LocationsWorkspace } from './LocationsWorkspace';
import { PhotosWorkspace, VideosWorkspace } from './MediaWorkspaces';
import { ProductsQueueWorkspace } from './ProductsQueueWorkspace';
import { StockReadinessWorkspace } from './StockReadinessWorkspace';
import { TemplatesWorkspace } from './TemplatesWorkspace';
import { WarehouseWorkspace } from './WarehouseWorkspace';

export function ProductScenarioWorkspace({
    scenarioId,
    contextId,
    onNavigate
}: {
    scenarioId: string;
    contextId?: string;
    onNavigate: (scenarioId: string, contextId?: string) => void;
}) {
    switch (scenarioId) {
        case 'locations':
            return <LocationsWorkspace />;
        case 'templates':
            return <TemplatesWorkspace onCreateOrder={(productId) => onNavigate('collection-orders', productId)} />;
        case 'collection-orders':
            return <CollectionOrdersWorkspace preselectedProductId={contextId} />;
        case 'acceptance':
            return <AcceptanceWorkspace batchId={contextId} onNavigate={onNavigate} />;
        case 'photos':
            return <PhotosWorkspace batchId={contextId} onNavigate={onNavigate} />;
        case 'videos':
            return <VideosWorkspace batchId={contextId} onNavigate={onNavigate} />;
        case 'identification':
            return <IdentificationWorkspace batchId={contextId} onNavigate={onNavigate} />;
        case 'stock-readiness':
            return <StockReadinessWorkspace batchId={contextId} onNavigate={onNavigate} />;
        case 'warehouse':
            return <WarehouseWorkspace />;
        default:
            return <ProductsQueueWorkspace onNavigate={onNavigate} />;
    }
}
