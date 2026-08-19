const CONFIG=window.YECHIM_CONFIG||{};
const READY=Boolean(window.supabase&&CONFIG.supabaseUrl&&!CONFIG.supabaseUrl.includes('YOUR_PROJECT')&&CONFIG.supabaseAnonKey&&!CONFIG.supabaseAnonKey.includes('YOUR_'));
const sb=READY?window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey):null;
let products=[], enrichment={}, current=null;
const $=s=>document.querySelector(s); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money=v=>Number(v||0).toLocaleString('ru-RU')+' сум';

async function init(){
  $('#loginBtn').onclick=login; $('#logoutBtn').onclick=logout; $('#closeModal').onclick=closeModal; $('#refreshBtn').onclick=loadData;
  $('#dq').oninput=renderTable; $('#statusFilter').onchange=renderTable; $('#brandFilter').onchange=renderTable;
  if(!READY){$('#authError').textContent='Заполни supabase-config.js перед подключением Dashboard.';return;}
  const {data:{session}}=await sb.auth.getSession(); if(session) showApp(session); else showLogin();
  sb.auth.onAuthStateChange((_event,session)=>session?showApp(session):showLogin());
}
function showLogin(){ $('#authPanel').hidden=false; $('#appPanel').hidden=true; $('#logoutBtn').hidden=true; }
async function showApp(session){ $('#authPanel').hidden=true; $('#appPanel').hidden=false; $('#logoutBtn').hidden=false; $('#userLabel').textContent=session.user.email||''; await loadData(); }
async function login(){
  $('#authError').textContent=''; const email=$('#email').value.trim(), password=$('#password').value;
  const {error}=await sb.auth.signInWithPassword({email,password}); if(error) $('#authError').textContent=error.message;
}
async function logout(){ await sb.auth.signOut(); }
async function loadData(){
  $('#syncInfo').textContent='Загрузка…';
  const [{data:p,error:pe},{data:e,error:ee}]=await Promise.all([sb.from('eman_products').select('*').order('name'),sb.from('yechim_enrichment').select('*')]);
  if(pe||ee){$('#syncInfo').textContent='Ошибка загрузки';alert((pe||ee).message);return;}
  products=p||[]; enrichment=Object.fromEntries((e||[]).map(x=>[x.eman_id,x]));
  fillBrands(); renderTable(); $('#syncInfo').textContent=`Товаров: ${products.length}`;
}
function fillBrands(){const brands=[...new Set(products.map(p=>p.brand).filter(Boolean))].sort();$('#brandFilter').innerHTML='<option value="all">Все бренды</option>'+brands.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');}
function completeness(p){const e=enrichment[p.eman_id]||{}; const checks=[e.yechim_category,e.description,Object.keys(e.specs||{}).length>0,e.mounting_scheme_url,(e.additional_images||[]).length>0]; return Math.round(checks.filter(Boolean).length/checks.length*100)}
function renderTable(){
  const q=$('#dq').value.toLowerCase().trim(), st=$('#statusFilter').value, b=$('#brandFilter').value;
  const list=products.filter(p=>{const e=enrichment[p.eman_id]||{};return (!q||`${p.name} ${p.sku||''}`.toLowerCase().includes(q))&&(st==='all'||(st==='published' ? e.published : !e.published))&&(b==='all'||p.brand===b);});
  $('#tbody').innerHTML=list.map(p=>{const e=enrichment[p.eman_id]||{};const c=completeness(p);return `<tr><td><div class="product-cell">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:''}<div><b>${esc(p.name)}</b><div class="muted">${esc(p.brand)}</div></div></div></td><td>${esc(p.sku||'—')}</td><td>${p.price?money(p.price):'—'}</td><td><span class="status ${c>=80?'s1':c>=40?'s2':'s3'}">${c}%</span></td><td><span class="status ${e.published?'s1':'s3'}">${e.published?'Опубликован':'Не опубликован'}</span></td><td><button class="btn btn-ghost" onclick="edit('${encodeURIComponent(p.eman_id)}')">Редактировать</button></td></tr>`}).join('')||'<tr><td colspan="6" class="muted">Ничего не найдено.</td></tr>';
}
function edit(idEncoded){
  const id=decodeURIComponent(idEncoded); current=id; const p=products.find(x=>x.eman_id===id); const e=enrichment[id]||{eman_id:id,published:false,yechim_brand:p?.brand||'',yechim_category:p?.category||'',yechim_subcategory:'',description:'',specs:{},mounting_scheme_url:'',additional_images:[],badge:'',sort_order:0};
  $('#mbrand').textContent=p?.brand||''; $('#mtitle').textContent=p?.name||id; $('#msku').textContent=`Артикул: ${p?.sku||'—'} · Цена Eman: ${p?.price?money(p.price):'—'}`;
  $('#fields').innerHTML=`<div class="grid2"><div class="field"><label>Показывать в каталоге</label><label class="switch"><input id="published" type="checkbox" ${e.published?'checked':''}><span></span></label></div><div class="field"><label>Бейдж</label><input id="badge" value="${esc(e.badge||'')}" placeholder="Новинка"></div></div><div class="grid2"><div class="field"><label>Бренд YECHIM</label><input id="yechim_brand" value="${esc(e.yechim_brand||'')}"></div><div class="field"><label>Категория YECHIM</label><input id="yechim_category" value="${esc(e.yechim_category||'')}"></div></div><div class="field"><label>Подкатегория</label><input id="yechim_subcategory" value="${esc(e.yechim_subcategory||'')}"></div><div class="field"><label>Описание YECHIM</label><textarea id="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Характеристики (JSON)</label><textarea id="specs">${esc(JSON.stringify(e.specs||{},null,2))}</textarea><div class="muted small">Пример: {"Цвет":"черный","Размер":"600 мм"}</div></div><div class="field"><label>Схема присадки</label><div class="upload-row"><input id="mounting_scheme_url" value="${esc(e.mounting_scheme_url||'')}" placeholder="URL или загрузить файл"><input id="schemeFile" type="file" accept="image/*"></div></div><div class="field"><label>Дополнительные фото</label><input id="imagesFiles" type="file" accept="image/*" multiple><div id="existingImages" class="image-list">${(e.additional_images||[]).map(u=>`<div><img src="${esc(u)}"><button class="btn btn-ghost" onclick="removeExistingImage('${encodeURIComponent(u)}')">×</button></div>`).join('')}</div></div><div class="field"><label>Порядок отображения</label><input id="sort_order" type="number" value="${Number(e.sort_order||0)}"></div>`;
  $('#saveError').textContent=''; $('#modal').classList.add('open');
}
async function uploadFile(file,folder){if(!file)return null;const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${folder}/${crypto.randomUUID()}-${safe}`;const {error}=await sb.storage.from('yechim-assets').upload(path,file,{upsert:false});if(error)throw error;return `${CONFIG.supabaseUrl}/storage/v1/object/public/yechim-assets/${path}`;}
async function saveEdit(){
  $('#saveError').textContent=''; try{
    const p=products.find(x=>x.eman_id===current); const currentE=enrichment[current]||{}; const specs=JSON.parse($('#specs').value||'{}');
    let scheme=$('#mounting_scheme_url').value.trim(); const schemeFile=$('#schemeFile').files[0]; if(schemeFile) scheme=await uploadFile(schemeFile,`schemes/${current}`);
    let images=[...(currentE.additional_images||[])]; const files=[...$('#imagesFiles').files]; for(const f of files) images.push(await uploadFile(f,`images/${current}`));
    const row={eman_id:current,published:$('#published').checked,yechim_brand:$('#yechim_brand').value.trim()||p.brand,yechim_category:$('#yechim_category').value.trim()||p.category,yechim_subcategory:$('#yechim_subcategory').value.trim(),description:$('#description').value.trim(),specs,mounting_scheme_url:scheme,additional_images:images,badge:$('#badge').value.trim(),sort_order:Number($('#sort_order').value||0)};
    const {error}=await sb.from('yechim_enrichment').upsert(row,{onConflict:'eman_id'}); if(error)throw error; closeModal(); await loadData();
  }catch(e){$('#saveError').textContent=e.message||String(e);}
}
function removeExistingImage(encoded){const u=decodeURIComponent(encoded);const e=enrichment[current]||{};e.additional_images=(e.additional_images||[]).filter(x=>x!==u);enrichment[current]=e;renderTable();edit(encodeURIComponent(current));}
function closeModal(){$('#modal').classList.remove('open'); current=null;}
window.edit=edit; window.removeExistingImage=removeExistingImage; window.closeModal=closeModal;
init();
