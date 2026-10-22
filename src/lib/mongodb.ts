import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * In serverless environments (Vercel), each function invocation could create
 * a brand-new DB connection, quickly exhausting MongoDB's connection limit.
 * We cache the connection on the global object so it's reused across
 * invocations within the same runtime instance.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.local.example to .env.local and add your MongoDB Atlas connection string."
    );
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
