import "server-only";

export const getHumeAccessToken = async () => {
  const accessToken = "hus"

  if (accessToken === "undefined") {
    return null;
  }

  return accessToken ?? null;
};
