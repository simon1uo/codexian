export interface CodexianSettings {
  cliPath: string;
  environmentVariables: string;
  envSnippets: EnvSnippet[];
  approvalMode: ApprovalMode;
  lastModel?: string;
  lastReasoningEffort?: string;
  lastMode?: CodexianMode;
}

export interface CodexianData {
  settings: CodexianSettings;
  activeConversationId?: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface CodexianConversation {
  id: string;
  threadId?: string;
  title: string;
  model?: string;
  reasoningEffort?: string;
  mode?: CodexianMode;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  messages: ChatMessage[];
}

export type CodexianMode = 'agent' | 'chat' | 'agent-full';

export type ApprovalPolicy = 'on-request' | 'never';

export type SandboxPolicyType = 'readOnly' | 'workspaceWrite' | 'dangerFullAccess';

export interface SandboxPolicy {
  type: SandboxPolicyType;
}

export interface EnvSnippet {
  id: string;
  name: string;
  envVars: string;
  updatedAt: number;
}

export type ApprovalMode = 'safe' | 'yolo';

export type ApprovalDecision = 'approve' | 'decline';

export interface AppServerTextContent {
  type: 'text';
  text?: string;
}

export interface AppServerUserMessage {
  type: 'userMessage';
  id?: string;
  content?: AppServerTextContent[];
}

export interface AppServerAgentMessage {
  type: 'agentMessage';
  id?: string;
  text?: string;
}

export type AppServerMessageItem = AppServerUserMessage | AppServerAgentMessage;

export interface AppServerTurn {
  items?: AppServerMessageItem[];
}

export interface AppServerThread {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  preview?: string;
  cwd?: string;
  path?: string;
  turns?: AppServerTurn[];
}
