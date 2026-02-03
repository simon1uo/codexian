export interface ChatState {
  isRunning: boolean;
  activeTurnId: string | null;
  cancelRequested: boolean;
}

export const DEFAULT_CHAT_STATE: ChatState = {
  isRunning: false,
  activeTurnId: null,
  cancelRequested: false,
};
