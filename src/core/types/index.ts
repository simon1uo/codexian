export interface CodexianSettings {
  cliPath: string;
  environmentVariables: string;
  envSnippets: EnvSnippet[];
  approvalMode: ApprovalMode;
  approvalRules: ApprovalRule[];
  commandBlocklist: string[];
  pathBlocklist: string[];
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
  items?: CodexianConversationItem[];
}

export interface CodexianConversationItem {
  threadId?: string;
  turnId?: string;
  itemId?: string;
  itemType: string;
  timestamp: number;
  item: unknown;
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

export type ApprovalMode = 'safe' | 'yolo' | 'prompt';

export type ApprovalDecision = 'accept' | 'decline';

export type ApprovalRuleKind = 'command' | 'path';

export interface ApprovalRule {
  kind: ApprovalRuleKind;
  pattern: string;
}

export interface AppServerTextContent {
  type: 'text';
  text?: string;
}

export interface AppServerUserMessage extends AppServerItemBase<'userMessage'> {
  content?: AppServerTextContent[];
}

export interface AppServerAgentMessage extends AppServerItemBase<'agentMessage'> {
  text?: string;
}

type Exclude<T, U> = T extends U ? never : T;

export type AppServerKnownItemType = 'userMessage' | 'agentMessage';

declare const appServerUnknownItemBrand: unique symbol;

export type AppServerUnknownItemType = Exclude<string, AppServerKnownItemType> & {
  readonly [appServerUnknownItemBrand]: true;
};

export interface AppServerItemBase<TType extends string = string> {
  id?: string;
  type: TType;
  content?: AppServerTextContent[];
  text?: string;
}

export interface AppServerUnknownItem extends AppServerItemBase<AppServerUnknownItemType> {
  raw: { [key: string]: unknown };
}

export type AppServerItem = AppServerUserMessage | AppServerAgentMessage | AppServerUnknownItem;

export interface AppServerTurn {
  items?: AppServerItem[];
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
