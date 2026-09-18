import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id:giftCardId}=await params; const body=await req.json();
  const url=String(body.url||"").trim();
  if(!url)return NextResponse.json({error:"url_required"},{status:400});
  try{
    const row=await (prisma as any).mediaAsset.create({data:{
      giftCardId,url,
      altText:String(body.altText||"").trim()||null,
      type:String(body.type||"CARD").trim()||"CARD",
    }});
    return NextResponse.json({ok:true,row});
  }catch(e:any){return NextResponse.json({error:e?.message||"media_create_failed"},{status:500})}
}
export async function DELETE(req:NextRequest){
  const id=req.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({error:"missing_id"},{status:400});
  try{await (prisma as any).mediaAsset.delete({where:{id}});return NextResponse.json({ok:true})}
  catch(e:any){return NextResponse.json({error:e?.message||"media_delete_failed"},{status:500})}
}
