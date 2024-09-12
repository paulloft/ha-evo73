export function sendRequest(path, request = {}) {
  const url = `${window.location.pathname}${path}`;
  return fetch(url.replace('//', '/'), { signal: request.signal })
    .then(async (response) => {
      const result = await response.json();
      if (response.status !== 200) {
        return Promise.reject(result.error);
      }

      return result;
    });
}
