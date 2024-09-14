export function getUrl(path) {
  return (`${window.location.pathname}${path}`).replace('//', '/');
}

export function sendRequest(path, request = {}) {
  return fetch(getUrl(path), { signal: request.signal })
    .then(async (response) => {
      const result = await response.json();
      if (response.status !== 200) {
        return Promise.reject(result.error);
      }

      return result;
    });
}
