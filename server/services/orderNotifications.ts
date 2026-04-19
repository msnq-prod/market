export type NewOrderNotificationPayload = {
    orderId: string;
    buyerName: string;
    buyerUsername: string | null;
    total: number;
    itemCount: number;
    createdAt: string;
};

export type OrderStatusNotificationPayload = {
    orderId: string;
    fromStatus: string | null;
    toStatus: string;
    buyerName: string;
    buyerUsername: string | null;
    total: number;
    actorName?: string | null;
    happenedAt: string;
};

type NewOrderNotificationAdapter = (payload: NewOrderNotificationPayload) => Promise<void>;
type OrderStatusNotificationAdapter = (payload: OrderStatusNotificationPayload) => Promise<void>;

let newOrderNotificationAdapter: NewOrderNotificationAdapter = async () => {};
let orderStatusNotificationAdapter: OrderStatusNotificationAdapter = async () => {};

export const setNewOrderNotificationAdapter = (adapter: NewOrderNotificationAdapter) => {
    newOrderNotificationAdapter = adapter;
};

export const setOrderStatusNotificationAdapter = (adapter: OrderStatusNotificationAdapter) => {
    orderStatusNotificationAdapter = adapter;
};

export const sendNewOrderCreatedNotification = async (payload: NewOrderNotificationPayload) => {
    await newOrderNotificationAdapter(payload);
    console.info('[sales.notifications] new-order', JSON.stringify(payload));
};

export const sendOrderStatusChangedNotification = async (payload: OrderStatusNotificationPayload) => {
    await orderStatusNotificationAdapter(payload);
    console.info('[sales.notifications] order-status', JSON.stringify(payload));
};
