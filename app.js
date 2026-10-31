(() => {
const SUPABASE_URL="https://tztevpmknztxjsfwyhep.supabase.co";
const SUPABASE_KEY="sb_publishable_OHajZSxF47-EiH39VcNqiQ__TslGlz5";
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY),$=id=>document.getElementById(id),PAGE_SIZE=15;
const state={user:null,isOwner:false,view:"recent",query:"",category:"",offset:0,hasMore:true,loading:false,currentPage:null,templates:[],currentTemplate:null};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slugify=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const dateText=v=>v?new Date(v).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"—";
const notice=m=>{$("notice").textContent=m;$("notice").hidden=!m;};
const show=id=>{$(id).hidden=false;},hide=id=>{$(id).hidden=true;};

async function init(){
 if(!db){$("wiki-status").textContent="Offline";$("article-list").innerHTML='<div class="error-state">Supabase did not load. Refresh and try again.</div>';return;}
 $("wiki-status").textContent="Online";
 const {data:{session}}=await db.auth.getSession();state.user=session?.user||null;await refreshOwner();
 db.auth.onAuthStateChange(async(_event,s)=>{state.user=s?.user||null;await refreshOwner();});
 await loadTemplates();await Promise.all([loadCategories(),loadArticles(true)]);
 $("auth-button").addEventListener("click",authAction);
 $("search-form").addEventListener("submit",e=>{e.preventDefault();state.query=$("search-input").value.trim();state.category="";state.view="all";loadArticles(true);$("browse").scrollIntoView({behavior:"smooth"});});
 $("load-more").addEventListener("click",()=>loadArticles(false));
 $("back-button").addEventListener("click",showLibrary);
 $("home-link").addEventListener("click",e=>{e.preventDefault();state.query="";state.category="";state.view="recent";$("search-input").value="";showLibrary();loadArticles(true);});
 $("nav-home").addEventListener("click",e=>{e.preventDefault();showLibrary();});
 $("nav-all").addEventListener("click",e=>{e.preventDefault();state.view="all";state.category="";state.query="";$("search-input").value="";showLibrary();loadArticles(true);});
 $("hero-all").addEventListener("click",e=>{e.preventDefault();state.view="all";showLibrary();loadArticles(true);});
 $("new-page-button").addEventListener("click",()=>openPageEditor());
 $("edit-page-button").addEventListener("click",()=>openPageEditor(state.currentPage));
 $("close-editor").addEventListener("click",()=>hide("editor-panel"));
 $("page-form").addEventListener("submit",savePage);
 $("delete-page-button").addEventListener("click",deletePage);
 $("history-button").addEventListener("click",toggleHistory);
 $("nav-templates").addEventListener("click",e=>{e.preventDefault();openTemplateLibrary();});
 $("close-templates").addEventListener("click",()=>hide("template-panel"));
 $("new-template-button").addEventListener("click",()=>openTemplateEditor());
 $("template-form").addEventListener("submit",saveTemplate);
 $("cancel-template").addEventListener("click",()=>{state.currentTemplate=null;hide("template-form");});
 $("delete-template").addEventListener("click",deleteTemplate);
 renderAuth();
 const match=decodeURIComponent(location.hash||"").match(/^#article\/(.+)$/);if(match)openArticle(match[1]);
}
async function refreshOwner(){state.isOwner=false;if(state.user){const {data,error}=await db.rpc("is_tds_wiki_owner");state.isOwner=!error&&data===true;}renderAuth();}
function renderAuth(){
 $("auth-label").textContent=state.user?(state.isOwner?"Wiki owner":"Signed in · read only"):"Read-only visitor";
 $("auth-button").textContent=state.user?"Sign out":"Sign in with GitHub";
 $("new-page-button").hidden=!state.isOwner;$("nav-templates").hidden=!state.isOwner;
 $("edit-page-button").hidden=!state.isOwner||!state.currentPage;
 $("delete-page-button").hidden=!state.isOwner||!state.currentPage;
}
async function authAction(){
 if(state.user){await db.auth.signOut();state.user=null;state.isOwner=false;renderAuth();return;}
 const {error}=await db.auth.signInWithOAuth({provider:"github",options:{redirectTo:window.location.href.split("#")[0]}});
 if(error)notice("GitHub sign-in could not start: "+error.message+". Check that GitHub is enabled in Supabase Auth.");
}
async function loadTemplates(){
 const {data,error}=await db.from("wiki_templates").select("id,name,slug,content_wikitext,summary,updated_at").order("name").limit(300);
 if(error){state.templates=[];$("template-count").textContent="0";return;}
 state.templates=data||[];$("template-count").textContent=String(state.templates.length);
}
async function loadCategories(){
 const {data,error}=await db.from("wiki_categories").select("id,name,slug").order("name").limit(100);
 if(error){$("category-list").innerHTML='<p class="muted">Categories unavailable.</p>';return;}
 $("category-list").innerHTML=(data||[]).map(c=>'<button class="category-button" data-category="'+esc(c.slug)+'">'+esc(c.name)+'</button>').join("")||'<p class="muted">No categories yet.</p>';
 $("category-list").querySelectorAll("[data-category]").forEach(b=>b.addEventListener("click",()=>{state.category=b.dataset.category;state.query="";state.view="all";$("search-input").value="";loadArticles(true);}));
}
async function loadArticles(reset=false){
 if(state.loading)return;if(reset){state.offset=0;state.hasMore=true;}if(!state.hasMore)return;
 state.loading=true;$("load-more").disabled=true;
 if(reset)$("article-list").innerHTML='<div class="loading"><span class="spinner"></span> Loading articles…</div>';
 let q=db.from("wiki_pages").select("id,title,slug,summary,updated_at").order(state.view==="recent"&&!state.query&&!state.category?"updated_at":"title",{ascending:!(state.view==="recent"&&!state.query&&!state.category)});
 if(state.query){const term=state.query.replace(/[,%()]/g," ").trim();q=q.or("title.ilike.%"+term+"%,summary.ilike.%"+term+"%");}
 if(state.category){
  const {data:cats}=await db.from("wiki_categories").select("id").eq("slug",state.category).limit(1);
  const {data:links}=cats?.[0]?await db.from("wiki_page_categories").select("page_id").eq("category_id",cats[0].id).range(0,999):{data:[]};
  const ids=(links||[]).map(x=>x.page_id);if(!ids.length)q=null;else q=q.in("id",ids);
 }
 let data=[],error=null;if(q)({data,error}=await q.range(state.offset,state.offset+PAGE_SIZE-1));
 if(error){$("article-list").innerHTML='<div class="error-state">Could not load articles: '+esc(error.message)+'</div>';$("wiki-status").textContent="Check setup";state.loading=false;return;}
 data=data||[];if(reset)$("article-list").innerHTML="";
 if(!data.length&&reset)$("article-list").innerHTML='<div class="empty-state"><strong>No articles yet.</strong><p>The database is ready. Sign in with the owner GitHub account to create the first page.</p></div>';
 else{
  $("article-list").insertAdjacentHTML("beforeend",data.map(p=>'<button class="article-card" data-slug="'+esc(p.slug)+'"><span class="article-icon">✦</span><span class="article-card-copy"><h3>'+esc(p.title)+'</h3><p>'+esc(p.summary||"Open this wiki article.")+'</p><span class="card-meta"><span>WIKI ARTICLE</span><span>UPDATED '+esc(dateText(p.updated_at))+'</span></span></span><span class="card-arrow">›</span></button>').join(""));
  $("article-list").querySelectorAll("[data-slug]").forEach(b=>b.addEventListener("click",()=>openArticle(b.dataset.slug)));
 }
 state.offset+=data.length;state.hasMore=data.length===PAGE_SIZE;$("load-more").hidden=!state.hasMore;$("load-more").disabled=false;
 $("results-title").textContent=state.query?"Search results":state.category?"Category: "+state.category.replace(/-/g," "):state.view==="all"?"All articles":"Recently updated";
 $("results-count").textContent=state.offset+" shown";$("results-kicker").textContent=state.query?"SEARCH":state.category?"CATEGORY":"THE LIBRARY";
 $("article-count").textContent=String(state.offset);state.loading=false;
}
function expandTemplates(source,depth=0){
 if(depth>8)return source;
 return String(source||"").replace(/\{\{([^{}]+)\}\}/g,(_whole,inside)=>{
  const parts=inside.split("|"),name=parts.shift().trim().toLowerCase().replace(/^template:/,"");
  const t=state.templates.find(x=>x.slug===slugify(name)||x.name.toLowerCase()===name);
  if(!t)return '<span class="missing-template">Template:'+esc(name)+'</span>';
  const params={};let positional=1;
  parts.forEach(part=>{const eq=part.indexOf("=");if(eq>=0)params[part.slice(0,eq).trim()]=part.slice(eq+1).trim();else params[String(positional++)]=part.trim();});
  const body=t.content_wikitext.replace(/\{\{\{([^{}]+)\}\}\}/g,(_m,raw)=>{const bits=raw.split("|"),key=bits.shift().trim();return params[key]??bits.join("|");});
  return expandTemplates(body,depth+1);
 });
}
function renderWikitext(source){
 const lines=expandTemplates(source).replace(/\r/g,"").split("\n");let html="",para=[],listType=null,items=[];
 const flushP=()=>{if(para.length){html+="<p>"+inlineMarkup(para.join(" "))+"</p>";para=[];}};
 const flushL=()=>{if(items.length){html+="<"+listType+">"+items.map(x=>"<li>"+inlineMarkup(x)+"</li>").join("")+"</"+listType+">";items=[];listType=null;}};
 for(const raw of lines){
  const line=raw.trim();if(!line){flushP();flushL();continue;}
  const h=line.match(/^(={2,6})\s*(.*?)\s*\1$/);
  if(h){flushP();flushL();const n=Math.min(6,h[1].length);html+="<h"+n+">"+inlineMarkup(h[2])+"</h"+n+">";continue;}
  if(line==="----"){flushP();flushL();html+="<hr>";continue;}
  const li=line.match(/^([*#]+)\s*(.*)$/);
  if(li){flushP();const type=li[1][0]==="#"?"ol":"ul";if(listType&&listType!==type)flushL();listType=type;items.push(li[2]);continue;}
  flushL();para.push(line);
 }
 flushP();flushL();return html||"<p>This article is empty.</p>";
}
function inlineMarkup(value){
 let out=esc(value);
 out=out.replace(/\[\[([^\]]+)\]\]/g,(_m,raw)=>{const bits=raw.split("|"),title=bits[0].trim(),label=bits[1]?.trim()||title;return '<a href="#article/'+encodeURIComponent(slugify(title))+'" data-wiki-link="'+esc(slugify(title))+'">'+label+'</a>';});
 out=out.replace(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/g,(_m,url,label)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+(label||url)+'</a>');
 out=out.replace(/'''(.*?)'''/g,"<strong>$1</strong>").replace(/''(.*?)''/g,"<em>$1</em>");
 out=out.replace(/~([^~]+)~/g,"<code>$1</code>");return out;
}
async function openArticle(slug){
 hide("home");hide("stats");hide("browse");hide("about");hide("editor-panel");hide("template-panel");show("article-view");
 $("article-content").innerHTML='<div class="loading">Loading article…</div>';
 const {data:p,error}=await db.from("wiki_pages").select("*").eq("slug",slug).maybeSingle();
 if(error||!p){$("article-content").innerHTML='<div class="empty-state">This article could not be found.</div>';return;}
 state.currentPage=p;renderAuth();
 const {data:links}=await db.from("wiki_page_categories").select("category_id").eq("page_id",p.id);
 const ids=(links||[]).map(x=>x.category_id),{data:cats}=ids.length?await db.from("wiki_categories").select("name").in("id",ids):{data:[]};
 const catHtml=(cats||[]).map(c=>'<span class="article-category">'+esc(c.name)+'</span>').join("");
 $("article-content").innerHTML='<div class="wiki-article"><h1>'+esc(p.title)+'</h1><div class="article-source">Updated '+esc(dateText(p.updated_at))+' · '+(catHtml||"Uncategorised")+'</div><div class="wiki-body">'+renderWikitext(p.content_wikitext||"")+'</div><div class="article-source">Independent community wiki · Tower Defense Simulator belongs to its respective creators.</div></div>';
 $("article-content").querySelectorAll("[data-wiki-link]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();openArticle(a.dataset.wikiLink);}));
 history.replaceState(null,"","#article/"+encodeURIComponent(p.slug));window.scrollTo({top:0,behavior:"smooth"});
}
function showLibrary(){
 state.currentPage=null;renderAuth();hide("article-view");hide("editor-panel");hide("template-panel");show("home");show("stats");show("browse");show("about");
 history.replaceState(null,"",state.query?"#search/"+encodeURIComponent(state.query):"#browse");window.scrollTo({top:0,behavior:"smooth"});
}
function openPageEditor(page=null){
 if(!state.isOwner)return;state.currentPage=page;$("editor-heading").textContent=page?"Edit "+page.title:"Create article";
 $("page-title").value=page?.title||"";$("page-summary").value=page?.summary||"";$("page-wikitext").value=page?.content_wikitext||"";
 $("edit-summary").value="";$("page-categories").value="";$("delete-page-button").hidden=!page;
 hide("article-view");hide("template-panel");show("editor-panel");window.scrollTo({top:0,behavior:"smooth"});
}
async function savePage(e){
 e.preventDefault();if(!state.isOwner)return;
 const title=$("page-title").value.trim(),slug=slugify(title),wikitext=$("page-wikitext").value,summary=$("page-summary").value.trim();
 if(!title||!slug){notice("Add a valid page title first.");return;}
 const payload={title,slug,content_wikitext:wikitext,content_html:"",summary,locally_edited:true,updated_by:state.user.id};
 const result=state.currentPage?.id?await db.from("wiki_pages").update(payload).eq("id",state.currentPage.id).select().single():await db.from("wiki_pages").insert({...payload,created_by:state.user.id}).select().single();
 if(result.error){notice("Could not save the article: "+result.error.message);return;}
 const p=result.data,rev=await db.from("wiki_page_revisions").insert({page_id:p.id,title,content_wikitext:wikitext,content_html:"",summary,editor_id:state.user.id,edit_summary:$("edit-summary").value.trim(),is_import:false});
 if(rev.error)notice("Article saved, but revision history could not be added: "+rev.error.message);
 await updateCategories(p.id,$("page-categories").value);hide("editor-panel");await loadCategories();await loadArticles(true);await openArticle(slug);
}
async function updateCategories(pageId,raw){
 const names=[...new Set(raw.split(",").map(x=>x.trim()).filter(Boolean))];await db.from("wiki_page_categories").delete().eq("page_id",pageId);
 for(const name of names){const slug=slugify(name);let {data:c}=await db.from("wiki_categories").select("id").eq("slug",slug).maybeSingle();
  if(!c){const made=await db.from("wiki_categories").insert({name,slug}).select("id").single();c=made.data;}
  if(c)await db.from("wiki_page_categories").insert({page_id:pageId,category_id:c.id});
 }
}
async function deletePage(){
 if(!state.isOwner||!state.currentPage||!confirm("Delete this article and its revision history?"))return;
 const {error}=await db.from("wiki_pages").delete().eq("id",state.currentPage.id);
 if(error){notice("Could not delete article: "+error.message);return;}
 state.currentPage=null;hide("editor-panel");showLibrary();await loadArticles(true);
}
async function toggleHistory(){
 if(!state.currentPage)return;const panel=$("history-panel");if(!panel.hidden){hide("history-panel");return;}
 show("history-panel");panel.innerHTML="<h2>Revision history</h2><p>Loading…</p>";
 const {data,error}=await db.from("wiki_page_revisions").select("id,edit_summary,created_at").eq("page_id",state.currentPage.id).order("created_at",{ascending:false}).limit(40);
 if(error){panel.innerHTML="<h2>Revision history</h2><p>History unavailable.</p>";return;}
 panel.innerHTML="<h2>Revision history</h2>"+((data||[]).map(r=>'<div class="revision-row"><span>'+esc(r.edit_summary||"Article saved")+'</span><time>'+esc(dateText(r.created_at))+'</time></div>').join("")||'<p class="muted">No saved revisions yet.</p>');
}
async function openTemplateLibrary(){
 if(!state.isOwner)return;hide("home");hide("stats");hide("browse");hide("article-view");hide("about");hide("editor-panel");show("template-panel");
 await loadTemplates();renderTemplateList();window.scrollTo({top:0,behavior:"smooth"});
}
function renderTemplateList(){
 $("template-list").innerHTML=state.templates.map(t=>'<div class="template-row"><div><strong>'+esc(t.name)+'</strong><p>'+esc(t.summary||"Reusable wikitext template")+'</p><code>{{'+esc(t.name)+'}}</code></div><button class="quiet-button" data-template-id="'+esc(t.id)+'">Edit</button></div>').join("")||'<p class="muted">No templates created yet.</p>';
 $("template-list").querySelectorAll("[data-template-id]").forEach(b=>b.addEventListener("click",()=>openTemplateEditor(state.templates.find(t=>t.id===b.dataset.templateId))));
}
function openTemplateEditor(t=null){
 state.currentTemplate=t;$("template-name").value=t?.name||"";$("template-summary").value=t?.summary||"";$("template-wikitext").value=t?.content_wikitext||"";
 $("delete-template").hidden=!t;show("template-form");
}
async function saveTemplate(e){
 e.preventDefault();if(!state.isOwner)return;const name=$("template-name").value.trim(),slug=slugify(name);if(!name||!slug)return;
 const payload={name,slug,summary:$("template-summary").value.trim(),content_wikitext:$("template-wikitext").value,updated_by:state.user.id};
 const result=state.currentTemplate?await db.from("wiki_templates").update(payload).eq("id",state.currentTemplate.id).select().single():await db.from("wiki_templates").insert({...payload,created_by:state.user.id}).select().single();
 if(result.error){notice("Could not save template: "+result.error.message);return;}
 state.currentTemplate=null;hide("template-form");await loadTemplates();renderTemplateList();
}
async function deleteTemplate(){
 if(!state.isOwner||!state.currentTemplate||!confirm("Delete this template? Articles using it will show a missing-template notice."))return;
 const {error}=await db.from("wiki_templates").delete().eq("id",state.currentTemplate.id);
 if(error){notice("Could not delete template: "+error.message);return;}
 state.currentTemplate=null;hide("template-form");await loadTemplates();renderTemplateList();
}
init();
})();