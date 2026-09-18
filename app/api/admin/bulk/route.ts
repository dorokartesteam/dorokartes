import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req:NextRequest){
  const body=await req.json();
  const ids=Array.isArray(body.giftCardIds)?body.giftCardIds.filter((x:any)=>typeof x==="string"):[];
  const action=String(body.action||""); const value=String(body.value||"");
  if(!ids.length)return NextResponse.json({error:"no_gift_cards_selected"},{status:400});
  const db=prisma as any;
  try{
    if(action==="status"){
      const allowed=new Set(["ACTIVE","HIDDEN","DRAFT","ARCHIVED"]);
      if(!allowed.has(value))return NextResponse.json({error:"invalid_status"},{status:400});
      const r=await db.giftCard.updateMany({where:{id:{in:ids}},data:{status:value}});
      return NextResponse.json({ok:true,updated:r.count});
    }
    if(action==="verification"){
      const allowed=new Set(["VERIFIED","NEEDS_REVIEW","PENDING"]);
      if(!allowed.has(value))return NextResponse.json({error:"invalid_verification"},{status:400});
      const data:any={verificationStatus:value};
      if(value==="VERIFIED")data.lastVerifiedAt=new Date();
      const r=await db.giftCard.updateMany({where:{id:{in:ids}},data});
      return NextResponse.json({ok:true,updated:r.count});
    }
    if(action==="featured"){
      const r=await db.giftCard.updateMany({where:{id:{in:ids}},data:{featured:value==="true"}});
      return NextResponse.json({ok:true,updated:r.count});
    }
    if(action==="addCategory"){
      await db.giftCardCategory.createMany({data:ids.map((giftCardId:string)=>({giftCardId,categoryId:value})),skipDuplicates:true});
      return NextResponse.json({ok:true,updated:ids.length});
    }
    if(action==="addOccasion"){
      await db.giftCardOccasion.createMany({data:ids.map((giftCardId:string)=>({giftCardId,occasionId:value})),skipDuplicates:true});
      return NextResponse.json({ok:true,updated:ids.length});
    }
    return NextResponse.json({error:"invalid_bulk_action"},{status:400});
  }catch(e:any){return NextResponse.json({error:e?.message||"bulk_update_failed"},{status:500})}
}
