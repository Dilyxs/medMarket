import { MongoClient, Db } from "mongodb";

const dbName = process.env.MONGODB_DB || "db";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function resolveUri(): string {
  const direct = process.env.MONGODB_URI;
  if (direct) return direct;
  const pwd = process.env.db_password;
  if (pwd) {
    return `mongodb+srv://anisb2244_db_user:${encodeURIComponent(pwd)}@cluster0.c1nykom.mongodb.net/?appName=Cluster0`;
  }
  return "";
}

function getClient(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;
  const uri = resolveUri();
  if (!uri) {
    throw new Error("Missing MongoDB connection string. Set MONGODB_URI or db_password in env.");
  }
  client = new MongoClient(uri);
  clientPromise = client.connect();
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const cli = await getClient();
  return cli.db(dbName);
}
