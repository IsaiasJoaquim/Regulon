import { Client, Databases } from 'node-appwrite';

const ENDPOINT = 'https://cloud.appwrite.io/v1';
const PROJECT_ID = '6a478349003b4919115a';
const API_KEY = 'standard_9991cc6f7b67fb52bf4a78f5d3cdb949d572803a7356040c6a709c1d9f85f5ac7c412cef8debe6da4eee1a5ae47fcfad0cce8f2cf7a36a6adddcb2bb627e491f24500f2e1c4c7d793b2e24328074f7ca5c500d6c8af1e16d1f8c33826116ac68c4dff4a7fc34331e19f4f51d9c251f039052d02945d2af8e06c19b6337e9784a';
const DB_ID = 'regulon-db';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);

async function test() {
  console.log("Testing Appwrite connection...");
  
  // Test listing databases
  try {
    const dbList = await databases.list();
    console.log("✅ Databases:", dbList.databases.map(d => d.$id));
  } catch (e) {
    console.error("❌ Database list failed:", e.message);
  }

  // Test listing collections in regulon-db
  try {
    const colList = await databases.listCollections(DB_ID);
    console.log("✅ Collections:", colList.collections.map(c => `${c.$id} (${c.name})`));
  } catch (e) {
    console.error("❌ Collections list failed:", e.message);
  }
  
  console.log("\nDone.");
}

test();
