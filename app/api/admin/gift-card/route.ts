import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function slugify(v:string){return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}

export async function POST(req:NextRequest){
  const body=await req.json();
  const merchantId=String(body.merchantId||"");
  const title=String(body.title||"").trim();
  const officialUrl=String(body.officialUrl||"").trim();
  if(!merchantId||!title||!officialUrl)return NextResponse.json({error:"merchant_title_url_required"},{status:400});
  try{
    const db=prisma as any;
    const merchant=await db.merchant.findUnique({where:{id:merchantId},select:{name:true}});
    if(!merchant)return NextResponse.json({error:"merchant_not_found"},{status:404});
    let base=slugify(`${merchant.name}-${title}`)||"gift-card"; let slug=base,n=2;
    while(await db.giftCard.findUnique({where:{slug}}))slug=`${base}-${n++}`;
    const row=await db.giftCard.create({data:{
      merchantId,title,slug,officialUrl,
      status:["ACTIVE","DRAFT","HIDDEN"].includes(body.status)?body.status:"ACTIVE",
      verificationStatus:["VERIFIED","PENDING","NEEDS_REVIEW"].includes(body.verificationStatus)?body.verificationStatus:"NEEDS_REVIEW",
      lastVerifiedAt:body.verificationStatus==="VERIFIED"?new Date():null,
    }});
    return NextResponse.json({ok:true,row});
  }catch(e:any){return NextResponse.json({error:e?.message||"gift_card_create_failed"},{status:500})}
}
