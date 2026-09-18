import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const statuses=new Set(["ACTIVE","INACTIVE","NEEDS_REVIEW","ARCHIVED"]);

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const body=await req.json();
  const data:any={};
  for(const key of ["name","slug","websiteUrl","logoUrl","country","description","seoTitle","metaDescription"]){
    if(typeof body[key]==="string") data[key]=body[key].trim() || null;
  }
  if(typeof body.status==="string" && statuses.has(body.status)) data.status=body.status;
  try{
    const row=await (prisma as any).merchant.update({where:{id},data});
    return NextResponse.json({ok:true,row});
  }catch(e:any){return NextResponse.json({error:e?.message||"update_failed"},{status:500})}
}
