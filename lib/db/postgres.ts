import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

export function getPostgres() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL이 필요합니다.");
  client ??= postgres(connectionString, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  });
  return client;
}
