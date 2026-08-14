import { notFound } from "next/navigation";
import { siteFromSlug } from "@/lib/inquiries";
import { InquiryForm } from "@/components/inquiry-form";

export default function InquiryPage({ params }: { params: { site: string } }) {
  const site = siteFromSlug(params.site);
  if (!site) notFound();

  return <InquiryForm site={site} siteSlug={params.site} />;
}
