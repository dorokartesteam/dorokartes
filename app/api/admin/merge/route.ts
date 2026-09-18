import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req:NextRequest){
  const body=await req.json();
  const keepId=String(body.keepId||""),mergeId=String(body.mergeId||"");
  if(body.confirm!=="MERGE")return NextResponse.json({error:"confirmation_required"},{status:400});
  if(!keepId||!mergeId||keepId===mergeId)return NextResponse.json({error:"invalid_merchant_pair"},{status:400});
  const db=prisma as any;
  try{
    const result=await db.$transaction(async(tx:any)=>{
      const [keep,dup]=await Promise.all([
        tx.merchant.findUnique({where:{id:keepId}}),
        tx.merchant.findUnique({where:{id:mergeId}})
      ]);
      if(!keep||!dup)throw new Error("merchant_not_found");
      const moved=await tx.giftCard.updateMany({where:{merchantId:mergeId},data:{merchantId:keepId}});
      await tx.merchant.update({where:{id:mergeId},data:{status:"ARCHIVED"}});
      return {reassignedCards:moved.count};
    });
    return NextResponse.json({ok:true,...result});
  }catch(e:any){return NextResponse.json({error:e?.message||"merge_failed"},{status:500})}
}
