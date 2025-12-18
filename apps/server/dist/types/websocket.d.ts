/**
 * WebSocket message types
 */
export declare enum WsMessageType {
    AUTH = "auth",
    CHAT = "chat",
    MONITOR = "monitor",
    ERROR = "error"
}
export interface WsMessage {
    type: WsMessageType;
    payload: unknown;
}
export interface WsAuthMessage extends WsMessage {
    type: WsMessageType.AUTH;
    payload: {
        token: string;
    };
}
export interface WsChatMessage extends WsMessage {
    type: WsMessageType.CHAT;
    payload: {
        content: string;
        timestamp: string;
    };
}
export interface WsMonitorMessage extends WsMessage {
    type: WsMessageType.MONITOR;
    payload: {
        cpu: number;
        memory: number;
        timestamp: string;
    };
}
