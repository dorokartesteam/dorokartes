import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const {build} = createRequire(require.resolve('tsx'))('esbuild');
const bundle=await build({stdin:{contents:`
import {StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import CatalogView from './components/analytics/CatalogView';
import CatalogOutboundLink from './components/analytics/CatalogOutboundLink';
function Fixture(){const [detail,setDetail]=useState(false);const context={merchantId:'merchant',giftCardId:detail?'card':undefined,pageType:detail?'gift_card':'brand',sourcePath:detail?'/gift-cards/card':'/brands/merchant'};return <><CatalogView {...context}/><CatalogOutboundLink context={{...context,giftCardId:'card'}}>Official card</CatalogOutboundLink><button onClick={()=>setDetail(true)}>Detail</button></>;}
document.addEventListener('click',event=>{if(event.target.closest('a[href^="/go/"]'))event.preventDefault();});
createRoot(document.getElementById('root')).render(<StrictMode><Fixture/></StrictMode>);
`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const context=await browser.newContext();
 await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'}));
 const page=await context.newPage();
 await page.goto('https://dorokartes.gr/brands/merchant');
 await page.getByText('Official card').waitFor();
 await page.evaluate(()=>{window.events=[];window.gtag=(...args)=>window.events.push(args);window.dispatchEvent(new Event('dorokartes:analytics-ready'));window.dispatchEvent(new Event('dorokartes:analytics-ready'));});
 await page.waitForFunction(()=>window.events.length===1);
 assert.equal(await page.getByText('Official card').getAttribute('href'),'/go/card?from=brand');
 await page.getByText('Official card').click();
 assert.equal((await page.evaluate(()=>window.events)).filter(row=>row[1]==='catalog_outbound_click').length,1);
 await page.getByText('Detail',{exact:true}).click();
 await page.waitForFunction(()=>window.events.filter(row=>row[1]==='catalog_view').length===2);
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 const events=await page.evaluate(()=>window.events);
 assert.equal(events.length,3);
 assert.equal(events[0][2].page_type,'brand');assert.equal(events[2][2].gift_card_id,'card');
 assert.equal(await page.getByText('Official card').getAttribute('href'),'/go/card');
 const local=await context.newPage();await local.goto('http://localhost/brands/merchant');await local.getByText('Official card').waitFor();
 await local.evaluate(()=>{window.events=[];window.gtag=(...args)=>window.events.push(args);window.dispatchEvent(new Event('dorokartes:analytics-ready'));});
 await local.getByText('Official card').click();assert.equal(await local.evaluate(()=>window.events.length),0);
 fs.writeFileSync('reports/catalog-events-browser-check.json',JSON.stringify({checkedAt:new Date().toISOString(),actualReactComponents:true,strictMode:true,brandViews:1,giftCardViews:1,clickEvents:1,localEvents:0,networkEventsSent:0},null,2));
 console.log('Browser component checks passed: delayed GA readiness, StrictMode deduplication, page changes, clicks and localhost exclusion.');
}finally{await browser.close();}
