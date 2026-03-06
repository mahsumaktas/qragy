let pendingRequest = $state(null);
let activeContext = $state(null);
let requestSeq = 0;

export function getPendingCopilotRequest() {
  return pendingRequest;
}

export function openCopilotRequest(request) {
  if (!request) return;
  requestSeq += 1;
  pendingRequest = {
    requestId: requestSeq,
    ...request,
  };
}

export function clearCopilotRequest(requestId = null) {
  if (!pendingRequest) return;
  if (requestId && pendingRequest.requestId !== requestId) return;
  pendingRequest = null;
}

export function setAssistantContext(context) {
  activeContext = context ? { ...context } : null;
}

export function getAssistantContext() {
  return activeContext;
}
