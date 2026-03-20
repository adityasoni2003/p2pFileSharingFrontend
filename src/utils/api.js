export const createSession = async () => {
  const res = await fetch("http://localhost:8080/session", {
    method: "POST",
  });
  const data = await res.json();
  return data.sessionId;
};