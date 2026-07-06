import { InteractiveMemoryStudio } from "@/components/interactive-memory/interactive-memory-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StudioPageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const params = await searchParams;
  const date = params?.date;
  return <InteractiveMemoryStudio initialDate={date} />;
}
