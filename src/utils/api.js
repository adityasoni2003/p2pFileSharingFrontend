const apiBase = import.meta.env.VITE_API_BASE_URL;

export const createSession = async () => {
  const res = await fetch(`${apiBase}/session`, {
    method: "POST",
  });
  const data = await res.json();
  return data.sessionId;
};

export const getIceServers = async () => {
  const response = await fetch(`${apiBase}/ice`);

  const data = await response.json();
  return data;
};