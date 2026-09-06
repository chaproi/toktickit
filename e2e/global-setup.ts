import type { Server } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareTestDatabase } from "../server/src/testing/prepare-test-database.js";

const API_PORT = 3100;
const CLIENT_PORT = 4173;

async function listenForApi(app: {
  listen: (
    port: number,
    host: string,
    callback: () => void,
  ) => Server;
}): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(API_PORT, "127.0.0.1", () => {
      resolve(server);
    });
    server.once("error", reject);
  });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const repositoryRoot = process.cwd();
  const serverDirectory = join(repositoryRoot, "server");
  await prepareTestDatabase(serverDirectory);

  process.env.NODE_ENV = "test";
  process.env.VITE_API_URL = `http://127.0.0.1:${API_PORT}`;

  const clientDirectory = join(repositoryRoot, "client");
  const [{ app }, vite] = await Promise.all([
    import("../server/src/app.js"),
    import(
      pathToFileURL(
        join(
          clientDirectory,
          "node_modules",
          "vite",
          "dist",
          "node",
          "index.js",
        ),
      ).href
    ),
  ]);

  const apiServer = await listenForApi(app);
  const clientServer = await vite.createServer({
    root: clientDirectory,
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: CLIENT_PORT,
      strictPort: true,
    },
  });

  try {
    await clientServer.listen();
  } catch (error) {
    apiServer.closeAllConnections();
    apiServer.close();
    throw error;
  }

  return async () => {
    await clientServer.close();
    apiServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      apiServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };
}
