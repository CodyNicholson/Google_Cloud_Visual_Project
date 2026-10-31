import { AdcVisual, BudgetVisual, GatesVisual, HierarchyVisual, IamMatrixVisual, IdentityVisual, WorldMapVisual } from './FoundationVisuals.jsx';
import { ChooserVisual, ComputeEngineVisual, ContractVisual, DeliveriesVisual, GkeVisual, RunScaleVisual } from './ComputeVisuals.jsx';
import { CloudSqlVisual, FirestoreVisual, HotspotsVisual, StorageAccessVisual, StorageClassesVisual } from './DataStoreVisuals.jsx';
import { EdgeVisual, EgressVisual, FirewallVisual, PeeringVisual } from './NetworkVisuals.jsx';
import { BigQueryVisual, PubsubVisual, RagVisual, RetriesVisual, WindowsVisual } from './DataVisuals.jsx';
import { GatesTrafficVisual, LogRouterVisual, SloVisual, TerraformVisual } from './OpsVisuals.jsx';
import { GuardrailsVisual, SecretsVisual } from './SecurityVisuals.jsx';

// Maps each demo's `visual` name (see demos/catalog.js) to the component that draws its data
export const VISUALS = {
  gates: GatesVisual,
  hierarchy: HierarchyVisual,
  iamMatrix: IamMatrixVisual,
  adc: AdcVisual,
  identity: IdentityVisual,
  worldMap: WorldMapVisual,
  budget: BudgetVisual,
  chooser: ChooserVisual,
  computeEngine: ComputeEngineVisual,
  runScale: RunScaleVisual,
  contract: ContractVisual,
  deliveries: DeliveriesVisual,
  gke: GkeVisual,
  storageClasses: StorageClassesVisual,
  storageAccess: StorageAccessVisual,
  cloudSql: CloudSqlVisual,
  hotspots: HotspotsVisual,
  firestore: FirestoreVisual,
  peering: PeeringVisual,
  firewall: FirewallVisual,
  egress: EgressVisual,
  edge: EdgeVisual,
  bigquery: BigQueryVisual,
  pubsub: PubsubVisual,
  windows: WindowsVisual,
  retries: RetriesVisual,
  rag: RagVisual,
  gatesTraffic: GatesTrafficVisual,
  terraform: TerraformVisual,
  logRouter: LogRouterVisual,
  slo: SloVisual,
  secrets: SecretsVisual,
  guardrails: GuardrailsVisual,
};
