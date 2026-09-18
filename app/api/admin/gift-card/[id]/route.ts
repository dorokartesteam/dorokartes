import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const allowedStatus=new Set(["DRAFT","ACTIVE","HIDDEN","EXPIRED","ARCHIVED"]);
const allowedVerification=new Set(["DISCOVERED","PENDING","VERIFIED","NEEDS_REVIEW","EXPIRED","REJECTED"]);

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const body=await req.json(); const data:any={};
  for(const key of ["title","officialUrl","shortDescription","description","validityText","termsUrl","seoTitle","metaDescription"]){
    if(typeof body[key]==="string") data[key]=body[key].trim() || null;
  }
  if(typeof body.status==="string" && allowedStatus.has(body.status)) data.status=body.status;
  if(typeof body.verificationStatus==="string" && allowedVerification.has(body.verificationStatus)) data.verificationStatus=body.verificationStatus;
  if(typeof body.featured==="boolean") data.featured=body.featured;
  if(typeof body.corporateAvailable==="boolean") data.corporateAvailable=body.corporateAvailable;
  if(typeof body.personalizationAvailable==="boolean") data.personalizationAvailable=body.personalizationAvailable;
  if(body.validityMonths!==undefined){
    const n=Number(body.validityMonths); data.validityMonths=Number.isFinite(n)&&n>0?Math.round(n):null;
  }
  try{
    const row=await (prisma as any).giftCard.update({where:{id},data});
    return NextResponse.json({ok:true,row});
  }catch(e:any){return NextResponse.json({error:e?.message||"update_failed"},{status:500})}
}
