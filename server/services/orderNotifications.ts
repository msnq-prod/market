export type NewOrderNotificationPayload = {
    orderId: string;
    userId: string;
    buyerName: string;
    buyerUsername: string | null;
    total: number;
    itemCount: number;
    createdAt: string;
};

type NotificationAdapter = (payload: NewOrderNotificationPayload) => Promise<void>;

let notificationAdapter: NotificationAdapter = async () => {};

export const setNewOrderNotificationAdapter = (adapter: NotificationAdapter) => {
    notificationAdapter = adapter;
};

export const sendNewOrderCreatedNotification = async (payload: NewOrderNotificationPayload) => {
    await notificationAdapter(payload);
    console.info('[sales.notifications] new-order', JSON.stringify(payload));
};
