import { PrismaClient, Prisma } from '@prisma/client';

type PrismaDbClient = PrismaClient | Prisma.TransactionClient;

export const ACTIVE_RECORD_FILTER = {
    deleted_at: null
} as const;

export const softDeleteBatch = async (
    db: PrismaDbClient,
    batchId: string,
    deletedAt = new Date()
) => {
    const batch = await db.batch.findFirst({
        where: {
            id: batchId,
            deleted_at: null
        },
        select: {
            id: true,
            collection_request_id: true
        }
    });

    if (!batch) {
        return null;
    }

    await db.item.updateMany({
        where: {
            batch_id: batch.id,
            deleted_at: null
        },
        data: {
            deleted_at: deletedAt
        }
    });

    if (batch.collection_request_id) {
        await db.collectionRequest.updateMany({
            where: {
                id: batch.collection_request_id,
                deleted_at: null
            },
            data: {
                deleted_at: deletedAt
            }
        });
    }

    await db.batch.update({
        where: { id: batch.id },
        data: {
            deleted_at: deletedAt
        }
    });

    return batch;
};

export const softDeleteProduct = async (
    db: PrismaDbClient,
    productId: string,
    deletedAt = new Date()
) => {
    const product = await db.product.findFirst({
        where: {
            id: productId,
            deleted_at: null
        },
        select: {
            id: true
        }
    });

    if (!product) {
        return null;
    }

    const batches = await db.batch.findMany({
        where: {
            product_id: product.id,
            deleted_at: null
        },
        select: {
            id: true
        }
    });

    for (const batch of batches) {
        await softDeleteBatch(db, batch.id, deletedAt);
    }

    await db.collectionRequest.updateMany({
        where: {
            product_id: product.id,
            deleted_at: null
        },
        data: {
            deleted_at: deletedAt
        }
    });

    await db.item.updateMany({
        where: {
            product_id: product.id,
            deleted_at: null
        },
        data: {
            deleted_at: deletedAt
        }
    });

    await db.product.update({
        where: { id: product.id },
        data: {
            deleted_at: deletedAt,
            is_published: false
        }
    });

    return product;
};

export const softDeleteLocation = async (
    db: PrismaDbClient,
    locationId: string,
    deletedAt = new Date()
) => {
    const location = await db.location.findFirst({
        where: {
            id: locationId,
            deleted_at: null
        },
        select: {
            id: true
        }
    });

    if (!location) {
        return null;
    }

    const products = await db.product.findMany({
        where: {
            location_id: location.id,
            deleted_at: null
        },
        select: {
            id: true
        }
    });

    for (const product of products) {
        await softDeleteProduct(db, product.id, deletedAt);
    }

    await db.location.update({
        where: { id: location.id },
        data: {
            deleted_at: deletedAt
        }
    });

    return location;
};

export const softDeleteOrder = async (
    db: PrismaDbClient,
    orderId: string,
    deletedAt = new Date()
) => {
    const order = await db.order.findFirst({
        where: {
            id: orderId,
            deleted_at: null
        },
        select: {
            id: true
        }
    });

    if (!order) {
        return null;
    }

    await db.order.update({
        where: { id: order.id },
        data: {
            deleted_at: deletedAt
        }
    });

    return order;
};

export const softDeleteAllBusinessData = async (
    db: PrismaDbClient,
    deletedAt = new Date()
) => {
    const [
        orderResult,
        requestResult,
        itemResult,
        batchResult,
        productResult,
        locationResult
    ] = await Promise.all([
        db.order.updateMany({
            where: { deleted_at: null },
            data: { deleted_at: deletedAt }
        }),
        db.collectionRequest.updateMany({
            where: { deleted_at: null },
            data: { deleted_at: deletedAt }
        }),
        db.item.updateMany({
            where: { deleted_at: null },
            data: { deleted_at: deletedAt }
        }),
        db.batch.updateMany({
            where: { deleted_at: null },
            data: { deleted_at: deletedAt }
        }),
        db.product.updateMany({
            where: { deleted_at: null },
            data: {
                deleted_at: deletedAt,
                is_published: false
            }
        }),
        db.location.updateMany({
            where: { deleted_at: null },
            data: { deleted_at: deletedAt }
        })
    ]);

    return {
        deleted_at: deletedAt.toISOString(),
        orders: orderResult.count,
        collection_requests: requestResult.count,
        items: itemResult.count,
        batches: batchResult.count,
        products: productResult.count,
        locations: locationResult.count
    };
};
