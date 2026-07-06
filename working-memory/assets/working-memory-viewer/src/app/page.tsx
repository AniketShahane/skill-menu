import { WorkingMemoryApp } from "@/components/dashboard/working-memory-app";
import { getWorkingMemoryDataset } from "@/lib/working-memory/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const dataset = await getWorkingMemoryDataset();
  return <WorkingMemoryApp dataset={dataset} />;
}
