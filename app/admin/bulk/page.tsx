import { getBulkData } from "@/lib/admin/ops";
import BulkManager from "@/components/admin/BulkManager";
import { PageIntro } from "@/components/admin/AdminUI";

export default async function BulkPage(){
  const d=await getBulkData();
  return <><PageIntro title="Bulk Editor" text="Mass publication, verification, featured and taxonomy actions across selected gift cards."/><BulkManager cards={d.cards} categories={d.categories} occasions={d.occasions}/></>;
}
