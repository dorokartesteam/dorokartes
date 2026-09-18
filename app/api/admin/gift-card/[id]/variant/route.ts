import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id:giftCardId}=await params; const body=await req.json();
  const amount=body.amount===""||body.amount==null?null:Number(body.amount);
  try{
    const row=await (prisma as any).giftCardVariant.create({data:{
      giftCardId,
      label:String(body.label||"").trim()||null,
      amount:Number.isFinite(amount)?amount:null,
      currency:String(body.currency||"EUR").trim()||"EUR",
      type:String(body.type||"DIGITAL"),
      purchaseUrl:String(body.purchaseUrl||"").trim()||null,
    }});
    return NextResponse.json({ok:true,row});
  }catch(e:any){return NextResponse.json({error:e?.message||"variant_create_failed"},{status:500})}
}

export async function DELETE(req:NextRequest){
  const id=req.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({error:"missing_id"},{status:400});
  try{await (prisma as any).giftCardVariant.delete({where:{id}});return NextResponse.json({ok:true})}
  catch(e:any){return NextResponse.json({error:e?.message||"variant_delete_failed"},{status:500})}
}
