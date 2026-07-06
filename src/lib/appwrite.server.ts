import { Client, Databases, Storage } from "node-appwrite";

export const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
export const APPWRITE_PROJECT = process.env.VITE_APPWRITE_PROJECT || "regulon-demo";
export const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || "";
export const DATABASE_ID = process.env.VITE_APPWRITE_DB_ID || "regulon-db";
export const CORPUS_COLLECTION = "corpus";
export const EVIDENCE_COLLECTION = "evidence";

export function getAppwriteServerClient() {
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT);

  if (APPWRITE_API_KEY) {
    client.setKey(APPWRITE_API_KEY);
  }

  return {
    databases: new Databases(client),
    storage: new Storage(client)
  };
}
