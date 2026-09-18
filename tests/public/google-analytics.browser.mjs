import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('tsx'))('esbuild');
const measurementId=process.argv[2];
assert.match(measurementId||'',/^G-[A-Z0-9]+$/,'Pass the configured measurement ID as the first argument');
const bundle=await build({stdin:{contents:`
import {StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import {GoogleAnalytics} from './components/analytics/GoogleAnalytics';
createRoot(document.getElementById('root')).render(<StrictMode><GoogleAnalytics measurementId={${JSON.stringify(measurementId)}}/></StrictMode>);
`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'next-fixture',setup(build){
 build.onResolve({filter:/^next\/(script|navigation)$/},args=>({path:args.path,namespace:'next-fixture'}));
 build.onLoad({filter:/.*/,namespace:'next-fixture'},args=>({loader:'js',resolveDir:process.cwd(),contents:args.path==='next/script'?`import {useEffect} from 'react';export default function Script({id,src}){useEffect(()=>{if(document.getElementById(id))return;const script=document.createElement('script');script.id=id;script.src=src;script.async=true;document.head.appendChild(script);},[id,src]);return null;}`:`import {useSyncExternalStore} from 'react';const subscribe=cb=>{window.addEventListener('test:navigation',cb);return ()=>window.removeEventListener('test:navigation',cb);};export function usePathname(){return useSyncExternalStore(subscribe,()=>window.location.pathname,()=>'/');}` }));
}}]});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={checkedAt:new Date().toISOString(),requests:[],pageViews:[],productionEventsSent:0};
try{
 const context=await browser.newContext();
 await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname==='dorokartes.gr'||url.hostname==='localhost')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>GA scoped check</title><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'});
   if(url.pathname.includes('/collect')){
     const bodies=request.postData()?.split('\n')||[''];
     for(const body of bodies){const params=new URLSearchParams(url.search);for(const [key,value]of new URLSearchParams(body))params.set(key,value);if(params.get('en')==='page_view')report.pageViews.push({location:params.get('dl'),measurementId:params.get('tid')});}
     return route.fulfill({status:204,body:''});
   }
   if(url.hostname==='www.googletagmanager.com'){report.requests.push(url.pathname);return route.continue();}
   return route.abort();
 });
 const page=await context.newPage();
 await page.goto('https://dorokartes.gr/admin/analytics');
 await page.waitForFunction(id=>window['ga-disable-'+id]===true,measurementId);
 assert.equal(await page.locator('#google-analytics-loader').count(),0);assert.equal(report.requests.length,0);
 async function navigate(path){await page.evaluate(path=>{history.pushState({},'',path);document.title='GA scoped check '+path;window.dispatchEvent(new Event('test:navigation'));},path);}
 async function waitViews(count){const deadline=Date.now()+20000;while(report.pageViews.length<count&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));assert.equal(report.pageViews.length,count,JSON.stringify(report.pageViews));}
 await navigate('/browse');await waitViews(1);
 await navigate('/categories');await waitViews(2);
 await navigate('/browse?q=sephora');await waitViews(3);
 await navigate('/browse?q=sephora&page=2');await waitViews(4);
 await navigate('/admin/analytics');await page.waitForFunction(id=>window['ga-disable-'+id]===true,measurementId);
 await navigate('/brands/sephora');await waitViews(5);
 // Give any delayed duplicate or blocked admin measurement time to reach the intercepted endpoint.
 await page.waitForTimeout(2200);
 assert.equal(report.pageViews.length,5);
 assert.ok(report.pageViews.every(view=>!new URL(view.location).pathname.startsWith('/admin')&&view.measurementId===measurementId));
 assert.equal(await page.locator('#google-analytics-loader').count(),1);
 assert.equal(report.requests.filter(path=>path==='/gtag/js').length,1);
 const configs=await page.evaluate(()=>window.dataLayer.filter(command=>command[0]==='config').length);assert.equal(configs,1);
 const local=await context.newPage();await local.goto('http://localhost/browse');await local.waitForTimeout(300);assert.equal(await local.locator('#google-analytics-loader').count(),0);
 report.passed=true;report.adminRequests=0;report.scriptLoads=1;report.configCalls=configs;console.log(JSON.stringify(report));
}catch(error){report.passed=false;report.error=error.message;console.error(error);process.exitCode=1;}finally{fs.writeFileSync('reports/ga4-scoped-browser-check.json',JSON.stringify(report,null,2));await browser.close();}
