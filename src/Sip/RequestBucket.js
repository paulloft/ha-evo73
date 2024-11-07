import { generateBranch } from './Utils.js';
import { REQUEST_TIMEOUT } from './Constants.js';

const bucket = {
  count: 1,
  resolvers: {},
  requests: {},
  tags: {},
};

function resolveResponse(response) {
  if (bucket.resolvers[response.id]) {
    const [resolver, timeoutTimer] = bucket.resolvers[response.id];
    clearTimeout(timeoutTimer);
    resolver(response);
    delete bucket.resolvers[response.id];
  }
}

function addResponseResolver(id, resolver, reject) {
  const timeoutTimer = setTimeout(() => {
    if (bucket.resolvers[id]) {
      reject(new Error('Connection timeout'));
    }
  }, REQUEST_TIMEOUT);
  bucket.resolvers[id] = [resolver, timeoutTimer];
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
  addResponseResolver,
  resolveResponse,
  getRequestNumber,
  storeRequest,
  completeRequest,
  getStoredRequest,
  getRequestTag,
};