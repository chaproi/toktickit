const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface DevelopmentRequester {
  id: number;
  name: string;
  email: string;
}

export async function getDevelopmentRequesters(): Promise<
  DevelopmentRequester[]
> {
  const response = await fetch(
    `${API_URL}/api/development-requesters`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Development Requesters");
  }

  return (await response.json()) as DevelopmentRequester[];
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  await checkHealth();

  const categoriesResponse = await fetch(`${API_URL}/api/categories`);

  if (!categoriesResponse.ok) {
    throw new Error("Failed to fetch categories");
  }

  const categories = (await categoriesResponse.json()) as Category[];

  return {
    online: true,
    categories,
  };
}
export interface HealthStatus {
  status: string;
  service: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error("Backend is unavailable");
  }

  return (await response.json()) as HealthStatus;
}