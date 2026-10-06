import type { Metadata } from "next";
import { OrderDetailView } from "./OrderDetailView";

export async function generateMetadata({
  params,
}: PageProps<"/admin/orders/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${decodeURIComponent(id).slice(0, 8)}` };
}

export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  return <OrderDetailView id={decodeURIComponent(id)} />;
}
