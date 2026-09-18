import { getCreateData } from "@/lib/admin/ops";
import CreateCenter from "@/components/admin/CreateCenter";
import { PageIntro } from "@/components/admin/AdminUI";

export default async function CreatePage(){
  const {merchants}=await getCreateData();
  return <><PageIntro title="Create Center" text="Manual production entry for a merchant or gift-card program."/><CreateCenter merchants={merchants}/></>;
}
