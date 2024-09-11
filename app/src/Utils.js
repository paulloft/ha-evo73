export function sendRequest(path, request = {}) {
  return fetch(path, { signal: request.signal })
    .then(async (response) => {
      const result = await response.json();
      if (response.status !== 200) {
        return Promise.reject(result.error)
      }

      return result;
    });
}
