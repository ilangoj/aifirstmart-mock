
function applyInterfaceLanguage(){document.documentElement.lang=lang==='ta'?'ta-IN':'en-IN';document.body.classList.toggle('tamil-interface',lang==='ta')}
document.querySelector('#language')?.addEventListener('change',()=>setTimeout(applyInterfaceLanguage,0));
applyInterfaceLanguage();
if(document.fonts&&lang==='ta')document.fonts.load("16px 'AIFM Tamil'").then(()=>document.body.classList.add('tamil-font-ready')).catch(()=>{});
