
// Tamil-native storytelling voice coach. Never fall back to an English voice for Tamil.
let tamilStoryTurn=0;
const TAMIL_STORY_LEADS=[
 'வாருங்கள், இதை உளுந்தூர்பேட்டை கடையில் நடந்த ஒரு உண்மையான நாளாக நினைத்துப் பார்ப்போம். ',
 'இப்போது கதையின் அடுத்த கட்டத்திற்கு வருகிறோம். இங்கே உங்கள் முடிவு மிகவும் முக்கியம். ',
 'இந்த நேரத்தில் அனுபவமுள்ள கடை ஊழியர் என்ன செய்வார் என்று பார்ப்போம். ',
 'வாடிக்கையாளர் காத்திருக்கிறார்; ஆனால் வேகத்தைவிட சரியான கட்டுப்பாடே முக்கியம். '
];
function tamilStoryText(text){
 if(lang!=='ta')return text;
 const clean=String(text||'').replace(/\bbutton\b/gi,'பொத்தான்').replace(/\bworkspace\b/gi,'பணித்தளம்').replace(/\bbusiness outcome\b/gi,'வணிக முடிவு').replace(/\bhandoff\b/gi,'அடுத்த பொறுப்பாளரிடம் ஒப்படைப்பு').replace(/\bcontrol\b/gi,'கட்டுப்பாடு').replace(/\bevidence\b/gi,'ஆதாரம்').replace(/\bcurrent status\b/gi,'தற்போதைய நிலை').replace(/\bnext owner\b/gi,'அடுத்த பொறுப்பாளர்');
 const lead=TAMIL_STORY_LEADS[tamilStoryTurn++%TAMIL_STORY_LEADS.length];
 return lead+clean+' நீங்கள் பொத்தானை அழுத்தியதும் என்ன மாறியது என்பதை கவனியுங்கள். அதன் பிறகு அடுத்த பொறுப்பாளர் யார் என்று சொல்லுங்கள்.';
}
function tamilStorySegments(segments){
 const translated=segments.map(seg=>({...seg,text:String(seg.text||'').replace(/\bbutton\b/gi,'பொத்தான்').replace(/\bworkspace\b/gi,'பணித்தளம்').replace(/\bbusiness outcome\b/gi,'வணிக முடிவு').replace(/\bhandoff\b/gi,'அடுத்த பொறுப்பாளரிடம் ஒப்படைப்பு').replace(/\bcontrol\b/gi,'கட்டுப்பாடு').replace(/\bevidence\b/gi,'ஆதாரம்').replace(/\bcurrent status\b/gi,'தற்போதைய நிலை').replace(/\bnext owner\b/gi,'அடுத்த பொறுப்பாளர்')}));
 if(!translated.length)return translated;
 translated[0].text=TAMIL_STORY_LEADS[tamilStoryTurn++%TAMIL_STORY_LEADS.length]+translated[0].text;
 translated[translated.length-1].text+=' இப்போது என்ன மாறியது, அடுத்த பொறுப்பாளர் யார் என்பதை கவனியுங்கள்.';
 return translated;
}
function availableVoices(){return window.speechSynthesis?window.speechSynthesis.getVoices():[]}
function chooseNativeVoice(locale){
 const voices=availableVoices(),language=locale.toLowerCase().split('-')[0];
 const same=voices.filter(v=>(v.lang||'').toLowerCase().split('-')[0]===language);
 if(!same.length)return null;
 const preferred=language==='ta'?[/google.*(தமிழ்|tamil)/i,/microsoft.*(valluvar|pallavi|tamil)/i,/(தமிழ்|tamil)/i]:[/google/i,/microsoft/i];
 for(const pattern of preferred){const match=same.find(v=>pattern.test(v.name||''));if(match)return match}
 return same.find(v=>(v.lang||'').toLowerCase()===locale.toLowerCase())||same[0];
}
function waitForNativeVoice(locale,timeout=2500){
 return new Promise(resolve=>{
  const found=chooseNativeVoice(locale);if(found)return resolve(found);
  let finished=false;const done=()=>{if(finished)return;finished=true;window.speechSynthesis?.removeEventListener?.('voiceschanged',changed);resolve(chooseNativeVoice(locale))};
  const changed=()=>{if(chooseNativeVoice(locale))done()};window.speechSynthesis?.addEventListener?.('voiceschanged',changed);window.speechSynthesis?.getVoices();setTimeout(done,timeout)
 })
}
chooseVoice=chooseNativeVoice;
let activeSpeechUtterance=null;
function speechChunks(segments){
 const rows=[];
 for(const seg of segments){
  const sentences=String(seg.text||'').match(/[^.!?…]+[.!?…]?/g)||[String(seg.text||'')];
  let chunk='';
  const flush=()=>{if(chunk.trim()){rows.push({...seg,text:chunk.trim()});chunk=''}};
  for(const sentence of sentences){
   if((chunk+' '+sentence).trim().length<=72){chunk=(chunk+' '+sentence).trim();continue}
   flush();
   if(sentence.length<=72){chunk=sentence;continue}
   for(const word of sentence.split(/\s+/)){if((chunk+' '+word).trim().length>72)flush();chunk=(chunk+' '+word).trim()}
  }
  flush();
 }
 return rows;
}
speakSegments=async function(segments){
 lastVoiceSegments=segments;stopVoice();if(!voiceEnabled||!('speechSynthesis'in window))return;
 const token=voiceQueueToken,locale=voiceLocale(),voice=await waitForNativeVoice(locale);if(token!==voiceQueueToken)return;
 document.documentElement.lang=lang==='ta'?'ta-IN':'en-IN';
 if(lang==='ta'&&!voice)setVoiceStatus('தமிழ் குரலை browser மூலம் தொடங்குகிறோம்…');
 const narrated=speechChunks(lang==='ta'?tamilStorySegments(segments):segments);
 const speakNext=index=>{if(token!==voiceQueueToken||index>=narrated.length)return;const seg=narrated[index],u=new SpeechSynthesisUtterance(seg.text.trim()+'. ');activeSpeechUtterance=u;u.lang=locale;u.rate=lang==='ta'?0.84:0.94;u.pitch=lang==='ta'?0.96:1;u.volume=1;if(voice)u.voice=voice;u.onstart=()=>{if(token!==voiceQueueToken)return;document.querySelectorAll('.voice-active').forEach(x=>x.classList.remove('voice-active'));if(seg.selector)document.querySelector(seg.selector)?.classList.add('voice-active');setVoiceStatus(lang==='ta'?'தமிழில் முழுக் கதை தொடர்கிறது · '+(index+1)+' / '+narrated.length:'Narrating '+(index+1)+' of '+narrated.length,true)};u.onerror=()=>{activeSpeechUtterance=null;if(token===voiceQueueToken)setVoiceStatus(lang==='ta'?'இந்த browser-ல் தமிழ் குரல் தொடங்கவில்லை · Chrome அல்லது Edge-ல் மீண்டும் முயற்சிக்கவும்':'Voice could not be played')};u.onend=()=>{activeSpeechUtterance=null;if(token!==voiceQueueToken)return;if(index<narrated.length-1)return setTimeout(()=>speakNext(index+1),240);setTimeout(()=>{if(token!==voiceQueueToken)return;document.querySelectorAll('.voice-active').forEach(x=>x.classList.remove('voice-active'));setVoiceStatus(vc().ready)},500)};speechSynthesis.speak(u)};
 speakNext(0)
};
teacherSpeak=function(text){speakSegments([{text}])};coachNarrate=function(text){teacherSpeak(text)};
window.speechSynthesis?.getVoices();
