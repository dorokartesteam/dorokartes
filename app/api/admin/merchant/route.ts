import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function slugify(v:string){return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}

export async function POST(req:NextRequest){
  const body=await req.json();
  const name=String(body.name||"").trim();
  const websiteUrl=String(body.websiteUrl||"").trim();
  if(!name||!websiteUrl)return NextResponse.json({error:"name_and_website_required"},{status:400});
  try{
    const db=prisma as any;
    let slug=slugify(name)||"merchant";
    let n=2;
    while(await db.merchant.findUnique({where:{slug}}))slug=`${slugify(name)}-${n++}`;
    const row=await db.merchant.create({data:{
      name,slug,websiteUrl,
      country:String(body.country||"GR").trim()||"GR",
      status:["ACTIVE","NEEDS_REVIEW","INACTIVE"].includes(body.status)?body.status:"ACTIVE",
    }});
    return NextResponse.json({ok:true,row});
  }catch(e:any){return NextResponse.json({error:e?.message||"merchant_create_failed"},{status:500})}
}
