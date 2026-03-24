(function(){"use strict";
var PI=3000,MP=120,CL=500;
class T{
constructor(c){this.c=c;this.pb=c.dataset.proxyBase||"/apps/tattup";this.li=c.dataset.loggedIn==="true";this.tvi=c.dataset.tattooVariantId||null;this.cr=parseInt(c.dataset.credits||"0",10);this.g=[];this.aj=0;var p=c.closest(".shopify-section")||c.parentElement;if(p)p.classList.add("tattup-section-dark");if(this.li)this.init()}
$(id){return document.getElementById(id)}
async init(){this.bindEv();this.uc();this.ucc();this.ucd();await this.fg()}
bindEv(){
this.c.querySelectorAll(".tattup-nav-btn[data-tab]").forEach(b=>b.addEventListener("click",()=>this.st(b.dataset.tab)));
var g=this.$("tattup-generate-btn");if(g)g.addEventListener("click",()=>this.gen());
var t=this.$("tattup-prompt");
if(t){t.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();this.gen()}});t.addEventListener("input",()=>this.ucc())}
var m=this.$("tattup-model");if(m)m.addEventListener("change",()=>this.ucd());
var b=this.$("tattup-credits-badge");if(b)b.addEventListener("click",()=>this.sbm());
var x=this.$("tattup-modal-close");if(x)x.addEventListener("click",()=>this.hbm());
var o=this.$("tattup-buy-modal");if(o)o.addEventListener("click",e=>{if(e.target===o)this.hbm()});
document.querySelectorAll(".tattup-package-btn").forEach(b=>b.addEventListener("click",()=>this.atc(b.dataset.variantId,b.dataset.sellingPlanId,b)));
var gr=this.$("tattup-gallery-grid");
if(gr)gr.addEventListener("click",e=>{
var tg=e.target.closest(".tattup-prompt-toggle");
if(tg){tg.classList.toggle("open");var d=tg.nextElementSibling;if(d)d.classList.toggle("open");return}
var cp=e.target.closest(".tattup-prompt-copy");
if(cp){navigator.clipboard.writeText(cp.dataset.prompt||"");cp.textContent="Copied!";setTimeout(()=>{cp.textContent="Copy prompt"},1500);return}
var tb=e.target.closest(".tattup-overlay-btn.test-btn");
if(tb&&tb.dataset.imageUrl){window.open(tb.dataset.imageUrl,"_blank");return}
var bk=e.target.closest(".tattup-overlay-btn.book-btn");
if(bk){this.bd(bk.dataset.imageUrl,bk.dataset.prompt,bk);return}
})}
st(tab){this.c.querySelectorAll(".tattup-nav-btn").forEach(b=>b.classList.remove("active"));this.c.querySelector('.tattup-nav-btn[data-tab="'+tab+'"]')?.classList.add("active");this.c.querySelectorAll(".tattup-tab-panel").forEach(p=>p.classList.remove("active"));this.$("tattup-panel-"+tab)?.classList.add("active")}
ucc(){var t=this.$("tattup-prompt"),c=this.$("tattup-char-count");if(!t||!c)return;var l=t.value.length;c.textContent=l+" / "+CL;c.classList.remove("near-limit","at-limit");if(l>=CL)c.classList.add("at-limit");else if(l>=CL*0.85)c.classList.add("near-limit")}
ucd(){var m=this.$("tattup-model"),c=this.$("tattup-cost-display");if(c)c.textContent=m?.value==="pro"?"2":"1"}
async api(p,o={}){var r=await fetch(this.pb+p,{headers:{"Content-Type":"application/json"},...o});return r.json()}
uc(){var e=this.$("tattup-credit-count");if(e)e.textContent=this.cr}
async gen(){
var pe=this.$("tattup-prompt"),me=this.$("tattup-model"),se=this.$("tattup-style"),ae=this.$("tattup-aspect-ratio");
var p=pe?.value?.trim();if(!p){pe?.focus();return}
var mo=me?.value||"standard",sy=se?.value||"",ar=ae?.value||"1:1",co=mo==="pro"?2:1;
if(this.cr<co){this.sbm();return}
var jid="j"+Date.now();this.addJob(jid,p);this.aj++;this.ugb();
try{
var d=await this.api("/generate",{method:"POST",body:JSON.stringify({prompt:p,model:mo,style:sy,aspectRatio:ar})});
if(d.error){this.rmJob(jid);if(d.credits!==undefined||d.required!==undefined)this.sbm();else this.tw("Something went wrong. Please try again.");return}
if(d.creditsRemaining!==undefined){this.cr=d.creditsRemaining;this.uc()}
if(d.jobId){pe.value="";this.ucc();await this.ps(d.jobId,p,jid)}else this.rmJob(jid)
}catch(e){console.error(e);this.rmJob(jid);this.tw("Something went wrong. Please try again.")}finally{this.aj=Math.max(0,this.aj-1);this.ugb()}}
ugb(){var t=this.$("tattup-generate-text");if(t)t.textContent=this.aj>0?"Generate ("+this.aj+" running)":"Generate"}
addJob(id,prompt){var bar=this.$("tattup-jobs-bar");if(!bar)return;var d=document.createElement("div");d.className="tattup-job-status";d.id=id;d.innerHTML='<div class="tattup-spinner-sm"></div><span class="tattup-job-prompt">'+this.esc(prompt)+'</span><span>Generating...</span>';bar.appendChild(d)}
rmJob(id){var e=document.getElementById(id);if(e)e.remove()}
updJob(id,txt){var e=document.getElementById(id);if(!e)return;var s=e.querySelector("span:last-child");if(s)s.textContent=txt}
async ps(jid,prompt,jobElId){
var po=0;
while(po<MP){
try{var d=await this.api("/status/"+jid);
if(d.status==="completed"&&d.imageUrl){this.rmJob(jobElId);var it={prompt:prompt,imageUrl:d.imageUrl};this.g.unshift(it);this.rg();if(d.creditsRemaining!==undefined){this.cr=d.creditsRemaining;this.uc()}return}
if(d.status==="failed"){this.rmJob(jobElId);this.tw("Generation failed. Please try again.");return}
this.updJob(jobElId,d.status==="processing"?"AI is working...":"Waiting in queue...")
}catch(e){console.error(e)}
po++;await new Promise(r=>setTimeout(r,PI))}
this.rmJob(jobElId);this.tw("Generation timed out. Please try again.")}
async fg(){try{var d=await this.api("/gallery");if(d.tattoos?.length){this.g=d.tattoos;this.rg()}}catch(e){console.error(e)}}
esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML}
ri(item){var e=s=>this.esc(s),bk=this.tvi?'<button class="tattup-overlay-btn book-btn" data-image-url="'+e(item.imageUrl)+'" data-prompt="'+e(item.prompt||"")+'">Book This Design</button>':"";
return'<div class="tattup-gallery-img-wrap"><img src="'+e(item.imageUrl)+'" alt="Generated tattoo" loading="lazy"/><div class="tattup-img-overlay"><button class="tattup-overlay-btn test-btn" data-image-url="'+e(item.imageUrl)+'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Test Your Design</button>'+bk+'</div></div><div class="tattup-gallery-item-info"><button class="tattup-prompt-toggle"><span>Prompt</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="tattup-prompt-detail">'+e(item.prompt||"")+'<br/><button class="tattup-prompt-copy" data-prompt="'+e(item.prompt||"")+'">Copy prompt</button></div></div>'}
rg(){var ee=this.$("tattup-gallery-empty"),gr=this.$("tattup-gallery-grid");if(!gr)return;if(this.g.length===0){if(ee)ee.style.display="";gr.innerHTML="";return}if(ee)ee.style.display="none";gr.innerHTML=this.g.map(i=>'<div class="tattup-gallery-item">'+this.ri(i)+'</div>').join("")}
tw(m){var t=this.$("tattup-toast");if(!t)return;t.textContent=m;t.classList.add("visible");setTimeout(()=>t.classList.remove("visible"),4000)}
sbm(){var m=this.$("tattup-buy-modal");if(m)m.style.display=""}
hbm(){var m=this.$("tattup-buy-modal");if(m)m.style.display="none";var s=this.$("tattup-cart-status");if(s)s.style.display="none"}
async bd(imageUrl,prompt,btn){
if(!this.tvi)return;var ot=btn.textContent;btn.disabled=true;btn.textContent="Adding...";
try{var r=await fetch("/cart/add.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:parseInt(this.tvi,10),quantity:1,properties:{"Design Image":imageUrl,"Prompt":prompt}})});
if(!r.ok)throw new Error("Failed");btn.textContent="Redirecting...";setTimeout(()=>{window.location.href="/cart"},800)
}catch(e){console.error(e);btn.disabled=false;btn.textContent=ot}}
async atc(vi,si,cb){
var se=this.$("tattup-cart-status"),ab=document.querySelectorAll(".tattup-package-btn");
ab.forEach(b=>{b.disabled=true;b.style.opacity="0.5"});
if(cb){var n=cb.querySelector(".tattup-package-name");if(n){n.dataset.origText=n.textContent;n.textContent="Adding to cart..."}}
try{var bd={id:parseInt(vi,10),quantity:1};if(si)bd.selling_plan=parseInt(si,10);
var r=await fetch("/cart/add.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(bd)});
if(!r.ok)throw new Error("Failed");
if(cb){var n=cb.querySelector(".tattup-package-name");if(n)n.textContent="Redirecting..."}
if(se){se.className="tattup-cart-status success";se.textContent="Added to cart! Redirecting...";se.style.display=""}
setTimeout(()=>{window.location.href="/cart"},1000)
}catch(e){console.error(e);ab.forEach(b=>{b.disabled=false;b.style.opacity=""});
if(cb){var n=cb.querySelector(".tattup-package-name");if(n&&n.dataset.origText)n.textContent=n.dataset.origText}
if(se){se.className="tattup-cart-status error";se.textContent="Failed to add to cart. Please try again.";se.style.display=""}}}}
var c=document.getElementById("tattup-app");if(c){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>new T(c));else new T(c)}})();
