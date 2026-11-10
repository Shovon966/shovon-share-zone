const gallery=document.querySelector("#gallery"),count=document.querySelector("#count"),empty=document.querySelector("#empty");
let photos=[],current=0;
const url=p=>"/media/"+encodeURIComponent(p.filename);
async function load(){try{const r=await fetch("/api/photos");photos=await r.json();count.textContent=photos.length+" photos";gallery.innerHTML="";empty.hidden=photos.length!==0;photos.forEach((p,i)=>{const el=document.createElement("article");el.className="tile";el.innerHTML=`<img loading="lazy" alt=""><div class="meta"><span></span><span>View ↗</span></div>`;el.querySelector("img").src=url(p);el.querySelector(".meta span").textContent=p.album||"Gallery";el.addEventListener("click",()=>open(i));gallery.append(el)});}catch{count.textContent="Could not load gallery"}}
function open(i){current=i;const p=photos[current];document.querySelector("#big").src=url(p);document.querySelector("#big").alt=p.originalName;document.querySelector("#caption").textContent=p.originalName;const d=document.querySelector("#download");d.href=url(p);d.download=p.originalName;document.querySelector("#viewer").hidden=false}
function move(n){if(!photos.length)return;open((current+n+photos.length)%photos.length)}
document.querySelector("#close").onclick=()=>document.querySelector("#viewer").hidden=true;
document.querySelector("#prev").onclick=()=>move(-1);document.querySelector("#next").onclick=()=>move(1);
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelector("#viewer").hidden=true;if(e.key==="ArrowLeft")move(-1);if(e.key==="ArrowRight")move(1)});
document.querySelector("#year").textContent=new Date().getFullYear();load();