(() => {
  const SUPABASE_URL = "https://tztevpmknztxjsfwyhep.supabase.co";
  const SUPABASE_KEY = "sb_publishable_OHajZSxF47-EiH39VcNqiQ__TslGlz5";
  const SOURCE_BASE = "https://tds.wiki/";
  const PAGE_SIZE = 12;
  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const state = { view: "recent", query: "", category: "", offset: 0, loading: false, hasMore: true, request: 0, page: "home" };

  const esc = (value = "") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const slugify = (value = "") => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const niceDate = value => { if (!value) return "Imported article"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Imported article" : date.toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"}); };
  const showNotice = message => { $("notice").textContent = message; $("notice").hidden = !message; };
  const setActive = () => document.querySelectorAll(".side-link").forEach(button => button.classList.toggle("active", button.dataset.view === state.view && !state.category && !state.query));
  const iconFor = title => /tower|scout|sniper|commander|accelerator|engineer|farm/i.test(title) ? "♜" : /enemy|boss|fallen|molten/i.test(title) ? "◆" : /map|mode|event/i.test(title) ? "▧" : "✦";

  async function init() {
    if (!db) {
      $("wiki-status").textContent = "Offline";
      $("article-list").innerHTML = '<div class="error-state">The Supabase client did not load. Check your connection and refresh.</div>';
      return;
    }
    $("wiki-status").textContent = "Online";
    const [pageCount, categoryCount] = await Promise.all([
      db.from("wiki_pages").select("id", {count:"exact",head:true}),
      db.from("wiki_categories").select("id", {count:"exact",head:true})
    ]);
    $("article-count").textContent = pageCount.count ?? "0";
    $("category-count").textContent = categoryCount.count ?? "0";
    if (pageCount.error || categoryCount.error) {
      $("wiki-status").textContent = "Check setup";
      showNotice("Connected to Supabase, but a database request failed. Check that the project schema has been applied.");
    }
    await loadCategories();
    await loadArticles(true);
  }

  async function loadCategories() {
    const {data,error} = await db.from("wiki_categories").select("id,name,slug").order("name").limit(100);
    if (error) { $("category-list").innerHTML = '<p class="muted">Categories will appear after import.</p>'; return; }
    $("category-count").textContent = String(data.length);
    $("category-list").innerHTML = data.length ? data.map(category =>
      '<button class="category-button" data-category="' + esc(category.slug) + '">' + esc(category.name) + '</button>'
    ).join("") : '<p class="muted">Categories appear after the first import.</p>';
    $("category-list").querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
      state.category = button.dataset.category;
      state.query = "";
      $("search-input").value = "";
      state.view = "all";
      loadArticles(true);
    }));
  }

  function setPage(page) {
    state.page = page;
    const towers = page === "towers";
    $("home").hidden = towers;
    $("stats").hidden = towers;
    $("towers-intro").hidden = !towers;
    $("browse").hidden = false;
    $("about").hidden = towers;
    $("article-view").hidden = true;
    document.querySelectorAll(".topbar nav a").forEach(a => a.classList.toggle("active-nav",
      (towers && a.id === "nav-towers") || (page === "home" && a.id === "nav-home")));
    if (towers) {
      state.category = "towers";
      state.query = "";
      state.view = "all";
      $("search-input").value = "";
    }
    history.replaceState(null, "", towers ? "#towers" : page === "all" ? "#browse" : "#home");
  }

  async function loadArticles(reset = false) {
    if (state.loading) return;
    if (reset) { state.offset = 0; state.hasMore = true; }
    if (!state.hasMore) return;
    state.loading = true;
    const request = ++state.request;
    if (reset) {
      $("article-list").innerHTML = '<div class="loading"><span class="spinner"></span> Loading articles…</div>';
      $("results-count").textContent = "";
    } else {
      $("load-more").textContent = "Loading…";
      $("load-more").disabled = true;
    }
    let query = db.from("wiki_pages").select("id,title,slug,summary,source_url,source_timestamp,updated_at,is_source_import", {count: reset ? "exact" : undefined});
    if (state.query.trim()) {
      const term = state.query.trim().replace(/[,%()]/g, " ");
      query = query.or("title.ilike.%" + term + "%,summary.ilike.%" + term + "%");
    }
    if (!state.category) {
      query = query.order(state.view === "recent" && !state.query ? "updated_at" : "title", {ascending: !(state.view === "recent" && !state.query)})
        .range(state.offset, state.offset + PAGE_SIZE - 1);
    }
    if (state.category) {
      const {data: cats} = await db.from("wiki_categories").select("id").eq("slug", state.category).limit(1);
      const catId = cats?.[0]?.id;
      const {data: links} = catId ? await db.from("wiki_page_categories").select("page_id").eq("category_id", catId).range(0, 999) : {data:[]};
      const ids = (links || []).map(link => link.page_id);
      query = db.from("wiki_pages").select("id,title,slug,summary,source_url,source_timestamp,updated_at,is_source_import", {count: reset ? "exact" : undefined});
      if (ids.length) query = query.in("id", ids); else ids.length === 0 && (query = null);
      if (query) query = query.order("title").range(state.offset, state.offset + PAGE_SIZE - 1);
    }
    let data = [], error = null, count = null;
    if (query) ({data,error,count} = await query);
    if (request !== state.request) { state.loading = false; return; }
    if (error) {
      $("wiki-status").textContent = "Check setup";
      $("article-list").innerHTML = '<div class="error-state">Could not load articles. ' + esc(error.message) + '<br><br>Run the database setup and import steps in the repository README.</div>';
      state.loading = false; $("load-more").hidden = true; return;
    }
    data = data || [];
    if (reset) $("article-list").innerHTML = "";
    if (!data.length && reset) {
      $("article-list").innerHTML = '<div class="empty-state"><strong class="no-results">' + (state.query ? "No matching articles yet." : "The library is ready for its first import.") + '</strong><p>Once the importer runs, articles from the source wiki will appear here.</p></div>';
    } else {
      $("article-list").insertAdjacentHTML("beforeend", data.map(page => {
        const desc = page.summary || (page.is_source_import ? "Imported from the source wiki. Open to read the article and attribution." : "Community wiki article.");
        const source = page.is_source_import ? "SOURCE ARTICLE" : "COMMUNITY ARTICLE";
        return '<button class="article-card" data-slug="' + esc(page.slug) + '"><span class="article-icon">' + iconFor(page.title) + '</span><span class="article-card-copy"><h3>' + esc(page.title) + '</h3><p>' + esc(desc) + '</p><span class="card-meta"><span>' + source + '</span><span>UPDATED ' + esc(niceDate(page.updated_at || page.source_timestamp)) + '</span></span></span><span class="card-arrow">›</span></button>';
      }).join(""));
      $("article-list").querySelectorAll("[data-slug]").forEach(button => button.addEventListener("click", () => openArticle(button.dataset.slug)));
    }
    state.offset += data.length;
    state.hasMore = data.length === PAGE_SIZE;
    $("load-more").hidden = !state.hasMore;
    $("load-more").disabled = false;
    $("load-more").textContent = "Load more articles ↓";
    $("results-count").textContent = count != null ? count + " results" : (state.offset ? "Showing " + state.offset : "");
    $("results-title").textContent = state.query ? 'Search results' : state.category ? 'Category: ' + state.category.replace(/-/g," ") : state.view === "all" ? "All articles" : "Recently updated";
    $("results-kicker").textContent = state.query ? "SEARCH" : state.category ? "CATEGORY" : "THE LIBRARY";
    state.loading = false;
    setActive();
  }

  async function openArticle(slug) {
    const {data: page,error} = await db.from("wiki_pages").select("*").eq("slug",slug).limit(1).maybeSingle();
    if (error || !page) { showNotice("That article could not be opened. Try again."); return; }
    $("browse").hidden = true; $("home").hidden = true; $("stats").hidden = true; $("towers-intro").hidden = true; $("article-view").hidden = false; $("about").hidden = true;
    const html = window.DOMPurify ? DOMPurify.sanitize(page.content_html || "", {USE_PROFILES:{html:true}, ADD_ATTR:["class","colspan","rowspan","align","width","height"]}) : esc(page.content_wikitext || "This article has not been imported yet.").replace(/\n/g,"<br>");
    const source = page.source_url ? '<a href="' + esc(page.source_url) + '" target="_blank" rel="noopener noreferrer">View original article ↗</a>' : "Community-created article";
    const revision = page.source_revision_id ? " · Source revision " + esc(page.source_revision_id) : "";
    $("article-content").innerHTML = '<div class="wiki-article"><h1>' + esc(page.title) + '</h1><div class="article-source">' + source + revision + (page.source_timestamp ? " · Source updated " + esc(niceDate(page.source_timestamp)) : "") + '</div><div class="wiki-body">' + (html || '<p>This article has no imported content yet.</p>') + '</div><p class="article-source">Tower Defense Simulator is owned by its respective creators. Imported content is credited to its source; see the repository README for attribution and license notes.</p></div>';
    window.scrollTo({top:0,behavior:"smooth"});
    history.replaceState(null,"","#article/" + encodeURIComponent(slug));
  }

  function showLibrary() {
    $("browse").hidden = false; $("home").hidden = state.page === "towers"; $("stats").hidden = state.page === "towers"; $("towers-intro").hidden = state.page !== "towers"; $("article-view").hidden = true; $("about").hidden = state.page === "towers";
    history.replaceState(null,"",state.page === "towers" ? "#towers" : state.query ? "#search/" + encodeURIComponent(state.query) : "#browse");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  $("search-form").addEventListener("submit", event => {
    event.preventDefault();
    state.query = $("search-input").value.trim(); state.category = ""; state.view = "all"; state.page = "all"; setPage("all"); loadArticles(true);
    $("browse").scrollIntoView({behavior:"smooth"});
  });
  $("load-more").addEventListener("click", () => loadArticles(false));
  $("back-button").addEventListener("click", showLibrary);
  $("home-link").addEventListener("click", event => { event.preventDefault(); state.query="";state.category="";state.view="recent";state.page="home";$("search-input").value="";showLibrary();loadArticles(true); });
  $("nav-home").addEventListener("click", event => { event.preventDefault(); state.page="home";state.query="";state.category="";state.view="recent";$("search-input").value="";showLibrary();loadArticles(true); });
  $("nav-towers").addEventListener("click", event => { event.preventDefault(); setPage("towers");loadArticles(true);window.scrollTo({top:0,behavior:"smooth"}); });
  $("hero-towers").addEventListener("click", event => { event.preventDefault(); setPage("towers");loadArticles(true);window.scrollTo({top:0,behavior:"smooth"}); });
  $("nav-all").addEventListener("click", event => { event.preventDefault(); state.page="all";state.category="";state.query="";state.view="all";$("search-input").value="";showLibrary();loadArticles(true); });
  $("hero-all").addEventListener("click", event => { event.preventDefault(); state.page="all";state.category="";state.query="";state.view="all";$("search-input").value="";showLibrary();loadArticles(true); });
  document.querySelectorAll(".side-link").forEach(button => button.addEventListener("click", () => {
    state.view = button.dataset.view; state.query = ""; state.category = ""; state.page = "all"; setPage("all"); $("search-input").value = ""; loadArticles(true);
  }));
  $("stats").hidden = false;
  const hash = decodeURIComponent(location.hash || "");
  const articleMatch = hash.match(/^#article\/(.+)$/);
  if (articleMatch) { init().then(() => openArticle(articleMatch[1])); }
  else { const searchMatch = hash.match(/^#search\/(.*)$/); if (searchMatch) { state.query=searchMatch[1];$("search-input").value=state.query;state.view="all"; } init(); }
})();