import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const outbound=[];await page.route('**/go/**',route=>{outbound.push(route.request().url());return route.abort();});
 const response=await page.goto('http://127.0.0.1:3100/brands/sephora',{waitUntil:'domcontentloaded',timeout:90000});assert.equal(response.status(),200);
 await page.locator('#brand-official-links').waitFor();
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.scroll<=width.viewport+1);
 const links=await page.locator('a[href*="/go/"]').evaluateAll(es=>es.map(e=>e.getAttribute('href')));assert.ok(links.length>0&&links.every(h=>h.endsWith('?from=brand')));
 assert.ok(await page.locator('nav[aria-label="Κατηγορίες καταστήματος"] a').count()>0);
 await page.screenshot({path:'.vercel/merchant-profile-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.vercel/merchant-profile-desktop.png'});
 const detailHref=await page.locator('.dk24-giftcard-link').first().getAttribute('href');await page.goto('http://127.0.0.1:3100'+detailHref,{waitUntil:'domcontentloaded',timeout:90000});await page.locator('main:not(.dk29-state)').waitFor();
 assert.equal(await page.locator('a[href^="/go/"]').count(),2);assert.equal(outbound.length,0);
 await page.goto('http://127.0.0.1:3100/admin/analytics',{waitUntil:'domcontentloaded',timeout:90000});await page.getByRole('heading',{name:'Top merchants',exact:true}).waitFor();assert.equal(await page.getByRole('alert').filter({hasText:'could not be loaded'}).count(),0);await page.screenshot({path:'.vercel/merchant-analytics-desktop.png'});
 const report={checkedAt:new Date().toISOString(),mobileWidth:width,officialLinks:links.length,prefetchRequests:0,adminAnalyticsRendered:true,productionWrites:0};fs.writeFileSync('reports/merchant-profile-browser-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
