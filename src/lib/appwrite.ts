import { Client, Account, Databases, Storage } from "appwrite";

export const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
export const APPWRITE_PROJECT = import.meta.env.VITE_APPWRITE_PROJECT || "regulon-demo";
export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DB_ID || "regulon-db";
export const CORPUS_COLLECTION = "corpus";
export const EVIDENCE_COLLECTION = "evidence";
export const BUCKET_ID = "evidence-files";

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
