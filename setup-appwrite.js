import { Client, Databases, Storage, Permission, Role } from 'node-appwrite';

const ENDPOINT = 'https://cloud.appwrite.io/v1';
const PROJECT_ID = '6a478349003b4919115a';
const API_KEY = 'standard_9991cc6f7b67fb52bf4a78f5d3cdb949d572803a7356040c6a709c1d9f85f5ac7c412cef8debe6da4eee1a5ae47fcfad0cce8f2cf7a36a6adddcb2bb627e491f24500f2e1c4c7d793b2e24328074f7ca5c500d6c8af1e16d1f8c33826116ac68c4dff4a7fc34331e19f4f51d9c251f039052d02945d2af8e06c19b6337e9784a';
const DB_ID = 'regulon-db';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);
const storage = new Storage(client);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function setup() {
  console.log('--- Iniciando Configuração do Appwrite ---');

  // 1. Criar Base de Dados
  try {
    await databases.create(DB_ID, 'Regulon DB');
    console.log('✅ Base de dados criada!');
  } catch (e) {
    if (e.code === 409) console.log('⚡ Base de dados já existe.');
    else throw e;
  }

  // 2. Criar Coleção: Corpus
  try {
    await databases.createCollection(DB_ID, 'corpus', 'Corpus', [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ]);
    console.log('✅ Coleção "corpus" criada!');
  } catch (e) {
    if (e.code === 409) console.log('⚡ Coleção "corpus" já existe.');
    else throw e;
  }

  // Atributos do Corpus
  try {
    await databases.createStringAttribute(DB_ID, 'corpus', 'title', 255, true);
    await databases.createStringAttribute(DB_ID, 'corpus', 'intermediary', 255, true);
    await databases.createStringAttribute(DB_ID, 'corpus', 'ingestedAt', 255, true);
    await databases.createStringAttribute(DB_ID, 'corpus', 'obligations', 1000000, true);
    console.log('✅ Atributos do "corpus" criados! (A aguardar indexação...)');
    await sleep(2000);
  } catch (e) {
    if (e.code === 409) console.log('⚡ Atributos do "corpus" já existem.');
    else console.error('Aviso ao criar atributos corpus:', e.message);
  }

  // 3. Criar Coleção: Evidence
  try {
    await databases.createCollection(DB_ID, 'evidence', 'Evidence', [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ]);
    console.log('✅ Coleção "evidence" criada!');
  } catch (e) {
    if (e.code === 409) console.log('⚡ Coleção "evidence" já existe.');
    else throw e;
  }

  // Atributos do Evidence
  try {
    await databases.createStringAttribute(DB_ID, 'evidence', 'status', 50, true);
    await databases.createStringAttribute(DB_ID, 'evidence', 'note', 5000, false);
    await databases.createStringAttribute(DB_ID, 'evidence', 'fileUrl', 1000, false);
    await databases.createStringAttribute(DB_ID, 'evidence', 'updatedAt', 255, false);
    console.log('✅ Atributos de "evidence" criados!');
    await sleep(2000);
  } catch (e) {
    if (e.code === 409) console.log('⚡ Atributos do "evidence" já existem.');
    else console.error('Aviso ao criar atributos evidence:', e.message);
  }

  // 4. Criar Storage Bucket
  try {
    await storage.createBucket('evidence-files', 'Evidence Files', [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ], false, false, undefined, ['jpg', 'png', 'pdf', 'jpeg']);
    console.log('✅ Bucket "evidence-files" criado com sucesso!');
  } catch (e) {
    if (e.code === 409) console.log('⚡ Bucket "evidence-files" já existe.');
    else throw e;
  }

  console.log('--- Configuração do Appwrite Concluída com Sucesso! ---');
}

setup().catch(console.error);
