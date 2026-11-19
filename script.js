const $ = (id) => document.getElementById(id);
const topic = $("topic"), expression = $("expression"), approach = $("approach");
const side = $("side"), result = $("result-content"), limitOptions = $("limit-options");

topic.addEventListener("change", () => {
  const isLimit = topic.value === "limit";
  limitOptions.hidden = !isLimit;
  $("expression-label").textContent = isLimit ? "Expressão do limite" : "Função a derivar";
  expression.placeholder = isLimit ? "Ex.: (x^2 - 4)/(x - 2)" : "Ex.: 3*x^3 - 2*x^2 + 5*x - 7";
});

document.querySelectorAll("[data-example]").forEach(btn => btn.addEventListener("click", () => {
  expression.value = btn.dataset.example;
  if (btn.dataset.topic) topic.value = btn.dataset.topic;
  topic.dispatchEvent(new Event("change"));
  if (btn.dataset.at) approach.value = btn.dataset.at;
  $("solve-button").scrollIntoView({behavior:"smooth",block:"center"});
}));

$("solve-button").addEventListener("click", solve);
expression.addEventListener("keydown", e => { if(e.key === "Enter") solve(); });

function show(title, value, steps, warning="") {
  result.className = "";
  result.innerHTML = `<h3 class="answer-title">${escapeHtml(title)}</h3><div class="answer-value">${escapeHtml(value)}</div><ol class="steps">${steps.map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ol>${warning ? `<div class="warning">${escapeHtml(warning)}</div>` : ""}`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function clean(s){return s.replace(/\s+/g,"").replace(/−/g,"-").replace(/×/g,"*").replace(/÷/g,"/");}
function tokenize(s){
  const tokens=[]; let i=0;
  while(i<s.length){
    const rest=s.slice(i), m=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)|^(?:x)|^(?:\^|\+|-|\*|\/|\(|\))/i);
    if(!m) throw new Error(`Símbolo não reconhecido perto de "${s.slice(i)}". Usa números, x, +, -, *, /, parênteses e ^.`);
    tokens.push(m[0]); i+=m[0].length;
  }
  // Multiplicação implícita: 2x, 3(x+1), (x+1)(x-1)
  const out=[];
  for(let j=0;j<tokens.length;j++){
    const a=tokens[j], b=tokens[j+1]; out.push(a);
    if(b && ((/^(?:\d|\.)/.test(a) && (b==="x"||b==="(")) || (a==="x"&&b==="(") || (a===")"&&(b==="x"||b==="("||/^(?:\d|\.)/.test(b))))) out.push("*");
  }
  return out;
}
function parsePoly(input){
  const t=tokenize(clean(input)); let p=0;
  const add=(a,b)=>{const r=a.slice(); b.forEach((v,i)=>r[i]=(r[i]||0)+v);return trim(r);};
  const mul=(a,b)=>{if(a.length+b.length>40)throw new Error("Polinómio demasiado grande.");const r=Array(a.length+b.length-1).fill(0);a.forEach((v,i)=>b.forEach((w,j)=>r[i+j]+=v*w));return trim(r);};
  const scale=(a,k)=>trim(a.map(v=>v*k));
  function primary(){
    let v;
    if(t[p]==="+"){p++;return primary();}
    if(t[p]==="-"){p++;return scale(primary(),-1);}
    if(t[p]==="("){p++;v=expr();if(t[p]!==")")throw new Error("Falta fechar um parêntese.");p++;}
    else if(t[p]==="x"){p++;v=[0,1];}
    else if(t[p]&&/^(?:\d|\.)/.test(t[p])){v=[Number(t[p++])];}
    else throw new Error("Expressão incompleta. Verifica os números e operadores.");
    if(t[p]==="^"){p++;const n=Number(t[p++]);if(!Number.isInteger(n)||n<0||n>12)throw new Error("O expoente deve ser um inteiro entre 0 e 12.");let r=[1];for(let i=0;i<n;i++)r=mul(r,v);v=r;}
    return v;
  }
  function term(){let v=primary();while(t[p]==="*"||t[p]==="/"){const op=t[p++],w=primary();if(op==="/"){if(w.length!==1||w[0]===0)throw new Error("Nesta versão, o denominador de uma fração deve ser uma constante. Para limites com fatorização, usa a forma de polinómios no numerador e denominador separadamente não é suportada ainda.");v=scale(v,1/w[0]);}else v=mul(v,w);}return v;}
  function expr(){let v=term();while(t[p]==="+"||t[p]==="-"){const op=t[p++],w=term();v=add(v,scale(w,op==="+"?1:-1));}return v;}
  const poly=expr();if(p!==t.length)throw new Error("Não foi possível interpretar toda a expressão.");return trim(poly);
}
function trim(a){while(a.length>1&&Math.abs(a[a.length-1])<1e-12)a.pop();return a;}
function evalPoly(a,x){return a.reduce((sum,c,i)=>sum+c*Math.pow(x,i),0);}
function derivative(a){return trim(a.slice(1).map((c,i)=>c*(i+1)).length?a.slice(1).map((c,i)=>c*(i+1)):[0]);}
function fmt(n){if(Math.abs(n)<1e-10)n=0;return Number(n.toPrecision(8)).toString();}
function polyText(a){let parts=[];for(let i=a.length-1;i>=0;i--){const c=a[i];if(Math.abs(c)<1e-10)continue;const sign=c<0?" - ":(parts.length?" + ":"");const abs=Math.abs(c);let term=i===0?fmt(abs):(abs===1?"":fmt(abs)+"*")+"x"+(i>1?"^"+i:"");parts.push(sign+term);}return parts.join("")||"0";}
function divideByLinear(poly, root){ // divisão sintética por (x-root)
  if(poly.length<2)return null;const n=poly.length-1,q=Array(n).fill(0);q[n-1]=poly[n];for(let i=n-2;i>=0;i--)q[i]=poly[i+1]+root*q[i+1];const rem=poly[0]+root*q[0];return {q:trim(q),rem};
}
function solve(){
  const raw=expression.value.trim();
  if(!raw){show("Falta o exercício","Introduz uma expressão",["Escreve uma expressão matemática no campo acima."]);return;}
  try{
    if(topic.value==="derivative") solveDerivative(raw); else solveLimit(raw);
  }catch(e){show("Não consegui resolver esta expressão","Verifica a expressão",["Confirma se escreveste a expressão corretamente."],e.message);}
}
function solveDerivative(raw){
  const p=parsePoly(raw), d=derivative(p);
  show("Derivada da função",`f′(x) = ${polyText(d)}`,[
    `Função inicial: f(x) = ${polyText(p)}.`,
    "Aplicamos a regra da potência: a derivada de a·xⁿ é a·n·xⁿ⁻¹.",
    `Derivamos cada termo e obtemos: f′(x) = ${polyText(d)}.`
  ],"O motor desta versão calcula derivadas de polinómios. Ainda não suporta funções trigonométricas, logaritmos, exponenciais ou regra do quociente.");
}
function solveLimit(raw){
  const p=parsePoly(raw), aText=clean(approach.value);
  if(aText==="inf"||aText==="infinity"||aText==="∞"||aText==="-inf"||aText==="-infinity"){
    const sign=aText.startsWith("-")?-1:1, degree=p.length-1, lead=p[degree];
    let value=degree===0?fmt(lead):(sign<0&&degree%2? (lead>0?"-∞":"+∞"):(lead>0?"+∞":"-∞"));
    show("Limite no infinito",`lim f(x) = ${value}`,[
      `A expressão é um polinómio de grau ${degree}.`,
      degree===0?"O polinómio é constante, por isso o limite é o próprio valor.":`Observamos o termo de maior grau: ${fmt(lead)}·x^${degree}.`,
      `Esse termo determina o comportamento quando x tende para ${aText}.`
    ],"Para já, limites no infinito de polinómios estão disponíveis. Limites de frações no infinito serão acrescentados numa próxima versão.");
    return;
  }
  const x=Number(aText);if(!Number.isFinite(x))throw new Error("Indica um valor numérico para x, ou escreve inf ou -inf.");
  const y=evalPoly(p,x);
  const steps=[`Substituímos x por ${fmt(x)} na expressão.`,`Calculamos f(${fmt(x)}) = ${fmt(y)}.`];
  if(Math.abs(y)>1e-9){show("Resultado do limite",`lim f(x) = ${fmt(y)}`,steps.concat("Como o polinómio é contínuo, o limite é igual ao valor obtido por substituição direta."));return;}
  if(side.value!=="both"){show("Limite lateral",`limite = 0`,steps.concat("O polinómio é contínuo, logo os limites laterais coincidem com o seu valor."));return;}
  show("Resultado do limite",`limite = 0`,steps.concat("O polinómio é contínuo em todos os números reais, por isso o limite é 0."),"Nota: esta versão resolve limites de polinómios. Para frações como (x²−4)/(x−2), a fatorização e simplificação algébrica ainda serão implementadas.");
}
