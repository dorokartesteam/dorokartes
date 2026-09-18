import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id:giftCardId}=await params; const body=await req.json();
  const kind=String(body.kind||""); const targetId=String(body.id||""); const action=String(body.action||"");
  if(!targetId || !["category","occasion"].includes(kind) || !["add","remove"].includes(action))
    return NextResponse.json({error:"invalid_relation_request"},{status:400});

  const db=prisma as any;
  try{
    if(kind==="category"){
      if(action==="add") await db.giftCardCategory.upsert({
        where:{giftCardId_categoryId:{giftCardId,categoryId:targetId}},
        update:{},create:{giftCardId,categoryId:targetId}
      });
      else await db.giftCardCategory.deleteMany({where:{giftCardId,categoryId:targetId}});
    }else{
      if(action==="add") await db.giftCardOccasion.upsert({
        where:{giftCardId_occasionId:{giftCardId,occasionId:targetId}},
        update:{},create:{giftCardId,occasionId:targetId}
      });
      else await db.giftCardOccasion.deleteMany({where:{giftCardId,occasionId:targetId}});
    }
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e?.message||"relation_update_failed"},{status:500})}
}
