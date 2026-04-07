import type { RoutingRequestPayload } from "../types";
import { RoutingRequestsPanel } from "./RoutingRequestsPanel";

type ResourceState<T> = {
  data: { generatedAt: string; data: T } | null;
  loading: boolean;
  error: string | null;
  attempted?: boolean;
  reload: () => Promise<void>;
};

export function ApprovalsPage({ routingRequests }: { routingRequests: ResourceState<RoutingRequestPayload> }) {
  return <RoutingRequestsPanel state={routingRequests} />;
}
