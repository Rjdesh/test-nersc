const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const getApiUrl = (pathname: string) => {
  const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || '/api');
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

  return `${apiBaseUrl}${normalizedPath}`;
};
