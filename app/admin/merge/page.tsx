import { getMergeData } from "@/lib/admin/ops";
import MergeCenter from "@/components/admin/MergeCenter";
import { PageIntro } from "@/components/admin/AdminUI";

export default async function MergePage(){
  const merchants=await getMergeData();
  return <><PageIntro title="Merge Center" text="Canonicalize duplicate merchants without deleting evidence or losing gift-card relations."/><MergeCenter merchants={merchants}/></>;
}
