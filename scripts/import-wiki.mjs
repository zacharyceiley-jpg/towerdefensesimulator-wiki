import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";

const API = process.env.MEDIAWIKI_API_URL || "https://tds.wiki/api.php";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = Math.min(50, Math.max(5, Number(process.env.IMPORT_BATCH_SIZE || 25)));
const CONCURRENCY = Math.min(5, Math.max(1, Number(process.env.IMPORT_CONCURRENCY || 3)));
const STATE_FILE = new URL("../import-state.json", import.meta.url);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill them in.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const slugify = value => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "article";
const sourceUrl = title => "https://tds.wiki/wiki/" + encodeURIComponent(title.replace(/ /g,"_")).replace(/%2F/gi,"/");
const titleSlug = title => slugify(title);
let checkpoint = { continue: null, imported: 0, failed: [], startedAt: new Date().toISOString() };
try { checkpoint = {...checkpoint, ...JSON.parse(await readFile(STATE_FILE,"utf8"))}; } catch {}
let stopRequested = false;
process.on("SIGINT", () => { stopRequested = true; console.log("\nStopping after current batch; progress checkpoint will be saved."); });

async function api(params, attempt = 0) {
  const url = new URL(API);
  for (const [key,value] of Object.entries({...params,format:"json",formatversion:2})) if (value != null) url.searchParams.set(key,String(value));
  try {
    const response = await fetch(url,{headers:{"User-Agent":"TDS-Wiki-Community-Importer/1.0 (article attribution preserved)"}});
    if (!response.ok) throw new Error("MediaWiki HTTP " + response.status);
    const json = await response.json();
    if (json.error) throw new Error(json.error.info || json.error.code);
    return json;
  } catch (error) {
    if (attempt >= 5) throw error;
    await pause(1000 * (attempt + 1));
    return api(params,attempt + 1);
  }
}
async function parsedPage(title) {
  const result = await api({action:"parse",page:title,prop:"text|categories|revid|displaytitle",disableeditsection:1});
  const parse = result.parse;
  const html = typeof parse.text === "string" ? parse.text : parse.text?.["*"] || "";
  return {html, categories:(parse.categories || []).map(c => typeof c === "string" ? c.replace(/^Category:/,"") : (c["*"] || c.title || "").replace(/^Category:/,""))};
}
async function mapLimit(items, limit, fn) {
  const output = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async () => {
    while (next < items.length) { const index = next++; try { output[index] = await fn(items[index],index); } catch (error) { output[index] = {error}; } }
  }));
  return output;
}
async function saveBatch(pages) {
  const slugs = pages.map(page => page.slug);
  const existingBySlug = new Map();
  for (let start=0;start<slugs.length;start+=100) {
    const {data,error} = await supabase.from("wiki_pages").select("id,slug,locally_edited").in("slug",slugs.slice(start,start+100));
    if (error) throw error;
    for (const page of data || []) existingBySlug.set(page.slug,page);
  }
  const writable = pages.filter(page => !existingBySlug.get(page.slug)?.locally_edited);
  if (!writable.length) return {saved:0,skipped:pages.length};
  const records = writable.map(page => {
    const existing = existingBySlug.get(page.slug);
    return {
      title:page.title, slug:page.slug, content_wikitext:page.wikitext || "",
      content_html:page.html || "", summary:page.summary || "",
      source_url:page.source_url, source_revision_id:page.source_revision_id || null,
      source_timestamp:page.source_timestamp || null, imported_at:new Date().toISOString(),
      is_source_import:true, locally_edited:false,
      ...(existing ? {id:existing.id} : {})
    };
  });
  const {data:saved,error} = await supabase.from("wiki_pages").upsert(records,{onConflict:"slug"}).select("id,slug");
  if (error) throw error;
  const idBySlug = new Map((saved || []).map(page=>[page.slug,page.id]));
  for (const page of writable) if (!idBySlug.has(page.slug) && existingBySlug.has(page.slug)) idBySlug.set(page.slug,existingBySlug.get(page.slug).id);
  const categories = [...new Set(writable.flatMap(page=>page.categories).filter(Boolean))];
  if (categories.length) {
    const categoryRows = categories.map(name=>({name,slug:slugify(name),source_url:"https://tds.wiki/"}));
    const {error:catError} = await supabase.from("wiki_categories").upsert(categoryRows,{onConflict:"slug",ignoreDuplicates:true});
    if (catError) throw catError;
    const {data:storedCats,error:fetchCatError} = await supabase.from("wiki_categories").select("id,slug").in("slug",categoryRows.map(c=>c.slug));
    if (fetchCatError) throw fetchCatError;
    const catBySlug = new Map((storedCats||[]).map(c=>[c.slug,c.id]));
    const links = [];
    for (const page of writable) {
      const pageId = idBySlug.get(page.slug);
      if (!pageId) continue;
      for (const name of page.categories) {
        const categoryId = catBySlug.get(slugify(name));
        if (categoryId) links.push({page_id:pageId,category_id:categoryId});
      }
    }
    for (let start=0;start<links.length;start+=500) {
      const {error:linkError} = await supabase.from("wiki_page_categories").upsert(links.slice(start,start+500),{onConflict:"page_id,category_id",ignoreDuplicates:true});
      if (linkError) throw linkError;
    }
  }
  const revisions = [];
  for (const page of writable) {
    const pageId = idBySlug.get(page.slug);
    if (pageId && page.source_revision_id) revisions.push({
      page_id:pageId,title:page.title,content_wikitext:page.wikitext||"",content_html:page.html||"",
      summary:page.summary||"",source_revision_id:page.source_revision_id,is_import:true,
      edit_summary:"Imported from tds.wiki; see source_url on wiki_pages."
    });
  }
  for (let start=0;start<revisions.length;start+=100) {
    // Skip revision IDs already stored so repeated runs are safe.
    const chunk = revisions.slice(start,start+100);
    const ids = chunk.map(r=>r.source_revision_id);
    const {data:old,error:oldError} = await supabase.from("wiki_page_revisions").select("source_revision_id").in("source_revision_id",ids);
    if (oldError) throw oldError;
    const existing = new Set((old||[]).map(r=>r.source_revision_id));
    const fresh = chunk.filter(r=>!existing.has(r.source_revision_id));
    if (fresh.length) {
      const {error} = await supabase.from("wiki_page_revisions").insert(fresh);
      if (error) throw error;
    }
  }
  return {saved:writable.length,skipped:pages.length-writable.length};
}
async function getWikitext(titles) {
  const result = await api({action:"query",prop:"revisions",titles:titles.join("|"),rvprop:"ids|timestamp|content",rvslots:"main",redirects:1});
  return (result.query?.pages || []).map(page => {
    const revision = page.revisions?.[0];
    return {title:page.title, wikitext:revision?.slots?.main?.content || revision?.["*"] || "",
      source_revision_id:revision?.revid || null,source_timestamp:revision?.timestamp || null,
      summary:"",slug:titleSlug(page.title),source_url:sourceUrl(page.title)};
  });
}
async function main() {
  console.log("Starting resumable import from",API);
  console.log("Batch size:",BATCH_SIZE,"· parse concurrency:",CONCURRENCY);
  while (!stopRequested) {
    const params = {action:"query",list:"allpages",apnamespace:0,apfilterredir:"all",aplimit:BATCH_SIZE};
    if (checkpoint.continue) params.apcontinue = checkpoint.continue;
    const result = await api(params);
    const titles = (result.query?.allpages || []).map(page=>page.title);
    if (!titles.length) break;
    const wikitextPages = await getWikitext(titles);
    const parsed = await mapLimit(wikitextPages,CONCURRENCY,async page=>{
      const rendered = await parsedPage(page.title);
      return {...page,...rendered};
    });
    const good = parsed.filter(page=>page && !page.error);
    const failed = parsed.map((page,index)=>page?.error ? {title:wikitextPages[index]?.title,error:String(page.error)} : null).filter(Boolean);
    if (failed.length) checkpoint.failed = [...(checkpoint.failed||[]),...failed].slice(-500);
    const saved = await saveBatch(good);
    checkpoint.imported = (checkpoint.imported||0) + saved.saved;
    checkpoint.continue = result.continue?.apcontinue || null;
    checkpoint.lastBatchAt = new Date().toISOString();
    await writeFile(STATE_FILE,JSON.stringify(checkpoint,null,2));
    console.log(`Batch ${checkpoint.imported}: ${saved.saved} saved, ${saved.skipped} preserved, ${failed.length} failed; ${titles[0]} → ${titles.at(-1)}`);
    if (!checkpoint.continue) break;
    await pause(400);
  }
  await writeFile(STATE_FILE,JSON.stringify(checkpoint,null,2));
  console.log("Import stopped/completed. Saved or refreshed:",checkpoint.imported,"· recorded failures:",checkpoint.failed?.length||0);
  if (checkpoint.continue) console.log("Run npm run import:wiki again to continue from the saved checkpoint.");
}
main().catch(error=>{console.error("Import failed:",error);process.exitCode=1;});
