import { Assistant } from "@/components/Assistant";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const params = await searchParams;
  return <Assistant googleNotice={params.google ?? null} />;
}
