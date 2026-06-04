const { EventEmitter } = require('events');

const DEFAULT_POLL_INTERVAL_MS = 15_000;

class VideoToolV3NetworkService extends EventEmitter {
    constructor({ getNetworkStatus = null, getAccessToken = null, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
        super();
        this.getNetworkStatus = getNetworkStatus;
        this.getAccessToken = getAccessToken;
        this.pollIntervalMs = pollIntervalMs;
        this.timer = null;
        this.running = false;
        this.state = {
            online: true,
            apiReachable: true,
            authenticated: Boolean(getAccessToken?.()),
            checkedAt: null,
            error: null
        };
    }

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        void this.refresh();
        this.schedule();
    }

    stop() {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    schedule() {
        if (!this.running || this.timer) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.refresh().finally(() => this.schedule());
        }, this.pollIntervalMs);
    }

    setAccessToken(accessToken) {
        this.updateState({
            authenticated: Boolean(accessToken)
        });
    }

    getState() {
        return { ...this.state };
    }

    async refresh() {
        const checkedAt = new Date().toISOString();
        if (!this.getNetworkStatus) {
            this.updateState({
                authenticated: Boolean(this.getAccessToken?.()),
                checkedAt
            });
            return this.getState();
        }

        try {
            const status = await this.getNetworkStatus();
            this.updateState({
                online: Boolean(status?.online),
                apiReachable: Boolean(status?.apiReachable),
                authenticated: Boolean(this.getAccessToken?.()),
                checkedAt: status?.checkedAt || checkedAt,
                error: typeof status?.error === 'string' ? status.error : null
            });
        } catch (error) {
            this.updateState({
                online: false,
                apiReachable: false,
                authenticated: Boolean(this.getAccessToken?.()),
                checkedAt,
                error: error instanceof Error ? error.message : 'network check failed'
            });
        }

        return this.getState();
    }

    updateState(nextState) {
        const previous = this.state;
        this.state = {
            ...previous,
            ...nextState
        };
        this.emit('checked', this.getState());

        if (
            previous.online !== this.state.online ||
            previous.apiReachable !== this.state.apiReachable ||
            previous.authenticated !== this.state.authenticated
        ) {
            this.emit('change', this.getState());
        }
    }
}

module.exports = {
    VideoToolV3NetworkService
};
