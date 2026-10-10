import { notFound } from "next/navigation";
import { CityPage, cityMetadata } from "@/components/city/CityPage";
import { cityBySlug, citySlugs } from "@/lib/cities";

type Props = { params: Promise<{ city: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => citySlugs().map((city) => ({ city }));

export async function generateMetadata({ params }: Props) {
  const c = cityBySlug((await params).city);
  return c ? cityMetadata(c, "en") : {};
}

export default async function Page({ params }: Props) {
  const c = cityBySlug((await params).city);
  if (!c) notFound();
  return <CityPage city={c} lang="en" />;
}
