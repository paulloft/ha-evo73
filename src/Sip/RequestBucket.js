import { generateBranch } from './Utils.js';

const bucket = {
  count: 1,
  resolvers: {},
  requests: {},
  tags: {},
};

function resolveResponse(response) {
  const resolver = bucket.resolvers[response.id];
  if (resolver) {
    resolver(response);
    delete bucket.resolvers[response.id];
  }
}

function addResponseResolver(id, resolver) {
  bucket.resolvers[id] = resolver;
}

function getRequestNumber() {
  return bucket.count++;
}

function storeRequest(SipRequest) {
  bucket.requests[SipRequest.id] = SipRequest;
}

function completeRequest(SipRequest) {
  delete bucket.requests[SipRequest.id];
  delete bucket.tags[SipRequest.id];
}

function getStoredRequest(id) {
  return bucket.requests[id];
}

function getRequestTag(request) {
  if (!bucket.tags[request.id]) {
    bucket.tags[request.id] = generateBranch();
  }

  return bucket.tags[request.id];
}

export default {
  resolveResponse,
  addResponseResolver,
  getRequestNumber,
  storeRequest,
  completeRequest,
  getStoredRequest,
  getRequestTag,
};