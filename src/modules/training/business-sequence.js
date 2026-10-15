
// Business-sequence training for every operational workspace, plus complete Tamil learning copy.
const MODULE_FLOW={
 catalogue:[/create|add product|new item|புதிய பொருள்|பொருள் சேர்/,/details|name|category|விவர|வகை/,/barcode|sku|பார்கோடு/,/price|tax|விலை|வரி/,/validate|சரிபார்/,/save|publish|சேமி|வெளியிடு/],
 stock:[/receive|பெறு/,/invoice|purchase order|source|ஆவண|விலைப்பட்டியல்/,/scan|barcode|ஸ்கேன்|பார்கோடு/,/count|quantity|எண்ண|அளவு/,/reconcile|variance|வேறுபாடு|சமன்/,/post|update stock|பதிவு|புதுப்பி/],
 orders:[/review|open order|ஆர்டரை ஆய்வு|ஆர்டர் திற/,/customer|payment|வாடிக்கையாளர்|கட்டணம்/,/allocate|reserve|ஒதுக்கு|முன்பதிவு/,/pick|எடு/,/pack|பொதி/,/dispatch|ship|அனுப்பு/,/complete|முடி/],
 signals:[/review|open|ஆய்வு|திற/,/investigate|evidence|ஆராய்|ஆதாரம்/,/assign|owner|ஒதுக்கு|பொறுப்பாளர்/,/resolve|action|தீர்வு|நடவடிக்கை/,/close|verify|மூடு|சரிபார்/],
 approvals:[/open|review request|கோரிக்கையைத் திற|ஆய்வு/,/evidence|reason|ஆதாரம்|காரணம்/,/risk|limit|policy|அபாய|வரம்பு|கொள்கை/,/approve|reject|ஒப்புதல்|நிராகரி/,/record|notify|பதிவு|தெரிவி/],
 setup:[/select|store|entity|தேர்வு|கடை/,/configure|edit|அமை|திருத்து/,/role|permission|device|பங்கு|அனுமதி|சாதனம்/,/validate|test|சரிபார்|சோதனை/,/approve|publish|ஒப்புதல்|வெளியிடு/,/audit|version|தணிக்கை|பதிப்பு/],
 delivery:[/plan|batch|திட்ட|தொகுப்பு/,/offer|assign|வழங்கு|ஒதுக்கு/,/accept|ஏற்று/,/pickup|handover|எடுத்துக்கொள்|ஒப்படை/,/route|track|வழித்தட|கண்காணி/,/deliver|proof|விநியோகம்|ஆதாரம்/,/settle|return|சமன்|திரும்ப/],
 workforce:[/accept|task|பணி|ஏற்று/,/pick|scan|எடு|ஸ்கேன்/,/verify|சரிபார்/,/pack|label|பொதி|அடையாள/,/stage|handover|தயார்|ஒப்படை/],
 customers:[/identify|search|அடையாள|தேடு/,/timeline|history|வரலாறு/,/diagnose|issue|பிரச்சினை|காரணம்/,/return|refund|resolve|திருப்பு|மீளளி|தீர்வு/,/confirm|close|உறுதி|மூடு/],
 finance:[/receive|import|பெறு|இறக்குமதி/,/match|reconcile|ஒப்பிடு|சமன்/,/investigate|variance|ஆராய்|வேறுபாடு/,/approve|post|ஒப்புதல்|பதிவு/,/close|report|மூடு|அறிக்கை/],
 procurement:[/need|replenish|தேவை|நிரப்பு/,/supplier|quote|வழங்குநர்|விலைப்புள்ளி/,/create|purchase order|உருவாக்கு|கொள்முதல் ஆணை/,/approve|send|ஒப்புதல்|அனுப்பு/,/receive|match|பெறு|ஒப்பிடு/],
 pricing:[/select|product|தேர்வு|பொருள்/,/cost|margin|செலவு|லாப/,/price|promotion|விலை|விளம்பரம்/,/validate|சரிபார்/,/approve|publish|ஒப்புதல்|வெளியிடு/],
 audit:[/filter|scope|வடிகட்டு|எல்லை/,/event|timeline|நிகழ்வு|காலவரிசை/,/evidence|ஆதாரம்/,/correlation|retry|தொடர்பு எண்|மறுமுயற்சி/,/export|report|ஏற்றுமதி|அறிக்கை/]
};
function flowText(el){return ((el?.dataset?.a||'')+' '+(el?.dataset?.module||'')+' '+(el?.textContent||'')).trim().toLowerCase()}
function moduleFlowRank(el,route){const rules=MODULE_FLOW[route]||[];const t=flowText(el);for(let i=0;i<rules.length;i++)if(rules[i].test(t))return (i+1)*10;return 500}
const allModuleBaseCandidates=labCandidates;
labCandidates=function(){const list=[...allModuleBaseCandidates()];const route=labState?.route;if(!route||route==='sell')return list;return list.sort((a,b)=>moduleFlowRank(a,route)-moduleFlowRank(b,route))};
const allModuleBaseUnique=uniqueScopeActions;
uniqueScopeActions=function(){const route=labState?.route;if(!route)return allModuleBaseUnique();const seen=new Set();return labCandidates().filter(el=>{const k=labButtonKey(el);if(seen.has(k))return false;seen.add(k);return true})};
const allModuleBaseContext=labContext;
labContext=function(el){const c=allModuleBaseContext(el);if(lang!=='ta'||labState?.route==='sell')return c;const route=labState?.route,t=flowText(el),rank=moduleFlowRank(el,route),process=TA_PROCESS[PERSONAS?.[labState?.role]?.role]||TA_PROCESS[labState?.role]||null;let situation=c.situation,before=c.before,outcome=c.outcome;
 if(rank<500){const step=Math.max(0,Math.floor(rank/10)-1),flow=process?.steps?.[step];if(flow){situation=flow[1];before=step===0?'சரியான பொறுப்பு, கடை மற்றும் பணித்தளத்தை உறுதி செய்யவும்.':'முந்தைய படியின் நிலை, ஆதாரம் மற்றும் பொறுப்பாளரைச் சரிபார்க்கவும்.';outcome=(process.steps[step+1]?.[0]?'அடுத்த படியான “'+process.steps[step+1][0]+'”க்கு சரிபார்க்கப்பட்ட பதிவு தயாராகும்.':process.outbound)}}
 if(/reject|cancel|return|exception|நிராகரி|ரத்து|திரும்ப|விதிவிலக்கு/.test(t)){situation='வழக்கமான செயல்முறையைத் தொடர முடியாத, ஆதாரத்துடன் கூடிய விதிவிலக்கில் மட்டும் பயன்படுத்தவும்.';before='காரணம், அனுமதி, பாதிக்கப்படும் பதிவு மற்றும் மீட்பு நடவடிக்கையை உறுதி செய்யவும்.';outcome='விதிவிலக்கு தனியாகப் பதிவாகி, சரியான பொறுப்பாளரிடம் தொடரும்.'}
 return{...c,label:deepTamilText(c.label),situation,before,outcome}}
