export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
export type DeletionStatus = "DELETED" | "PARTIAL" | "NOT_DELETED" | "UNKNOWN" | string;
export type StepType = "FINDING" | "REMEDIATION" | "VERIFICATION";

export interface DashboardStats {
  totalCases?: number | null;
  casesAnalyzed?: number | null;
  deletedDataDetected?: number | null;
  activeSyncRisks?: number | null;
  backupRestoreRisks?: number | null;
  pendingRemediations?: number | null;
  analysisStatus?: Array<{ name: string; value: number }>;
  violationTypes?: Array<{ name: string; value: number }>;
  evidenceSources?: Array<{ name: string; value: number }>;
  remediationStatus?: Array<{ name: string; value: number }>;
  riskSeverity?: Array<{ name: string; value: number }>;
  updatedAt?: string;
}

export interface CaseRecord {
  caseId: string;
  currentUserId?: string | null;
  historicalUserId?: string | null;
  requestType?: string | null;
  auditTimestamp?: string | null;
  deletionStatus?: DeletionStatus | null;
  riskLevel?: Severity | null;
  investigationStatus?: string | null;
}

export interface EvidenceRecord {
  evidenceId: string;
  caseId?: string | null;
  name: string;
  category?: string | null;
  fileType?: string | null;
  sizeBytes?: number | null;
  modifiedAt?: string | null;
  source?: string | null;
  description?: string | null;
  previewUrl?: string | null;
  downloadUrl?: string | null;
}

export interface Finding {
  findingId: string;
  caseId: string;
  description: string;
  evidenceReference?: string | null;
  violationCategory?: string | null;
  severity?: Severity | null;
  detectedAt?: string | null;
}

export interface WorkflowStep {
  stepNumber: number;
  type: StepType;
  description: string;
  evidenceReference?: string | null;
  caseId?: string | null;
  completionStatus?: string | null;
}

export interface GraphNode {
  id: string;
  type: "user" | "id" | "res" | string;
  label: string;
  system?: string | null;
  status?: "ok" | "open" | string;
  target?: string;
  inferred?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
  evidence?: string | null;
}

export interface CaseDetail {
  graph?: { nodes: GraphNode[]; edges: GraphEdge[] };
  case: CaseRecord;
  deletionRequest?: Record<string, unknown> | null;
  evidence?: EvidenceRecord[];
  activity?: Array<{ timestamp?: string; description: string; source?: string }>;
  policies?: Array<{ name: string; description?: string; status?: string }>;
  synchronizationRisks?: Array<{ description: string; status?: string }>;
  backupRisks?: Array<{ description: string; status?: string }>;
  findings?: Finding[];
  remediation?: WorkflowStep[];
  verification?: Array<{ description: string; status?: string; evidenceReference?: string }>;
}

export interface ReportSummary {
  totalCasesProcessed?: number | null;
  findingsBySeverity?: Array<{ name: string; value: number }>;
  policyCompliance?: Array<{ name: string; value: number }>;
  remediationProgress?: Array<{ name: string; value: number }>;
  verificationOutcomes?: Array<{ name: string; value: number }>;
  generatedAt?: string;
  evaluationAvailable?: boolean;
}

export type ApiCollection<T> = T[] | { items: T[]; total?: number };
