
// Tesla and embedded-browser audio fallback when Web Speech is unavailable.
let activeNarrationAudio=null;
const nativeSpeakSegments=speakSegments,nativeStopVoice=stopVoice;
stopVoice=function(){if(activeNarrationAudio){activeNarrationAudio.pause();activeNarrationAudio.src='';activeNarrationAudio=null}nativeStopVoice()};
function remoteVoiceUrl(text,locale){const tl=locale.toLowerCase().startsWith('ta')?'ta':'en';return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl='+tl+'&ttsspeed=0.9&q='+encodeURIComponent(text)}
function playRemoteNarration(rows,token,index=0){
 if(token!==voiceQueueToken||index>=rows.length)return;
 const row=rows[index],audio=new Audio(remoteVoiceUrl(row.text,voiceLocale()));activeNarrationAudio=audio;audio.preload='auto';
 audio.onplay=()=>{if(token!==voiceQueueToken)return audio.pause();document.querySelectorAll('.voice-active').forEach(x=>x.classList.remove('voice-active'));if(row.selector)document.querySelector(row.selector)?.classList.add('voice-active');setVoiceStatus(lang==='ta'?'தமிழ் கதை ஒலி · '+(index+1)+' / '+rows.length:'English story audio · '+(index+1)+' / '+rows.length,true)};
 audio.onended=()=>{activeNarrationAudio=null;if(token!==voiceQueueToken)return;if(index<rows.length-1)return setTimeout(()=>playRemoteNarration(rows,token,index+1),180);setTimeout(()=>{if(token!==voiceQueueToken)return;document.querySelectorAll('.voice-active').forEach(x=>x.classList.remove('voice-active'));setVoiceStatus(vc().ready)},400)};
 audio.onerror=()=>{activeNarrationAudio=null;if(token===voiceQueueToken)setVoiceStatus(lang==='ta'?'Tesla இணைய இணைப்பைச் சரிபார்த்து Replay அழுத்தவும்':'Check the Tesla internet connection and press Replay')};
 audio.play().catch(()=>{if(token===voiceQueueToken)setVoiceStatus(lang==='ta'?'ஒலியைத் தொடங்க Voice On அல்லது Replay அழுத்தவும்':'Press Voice On or Replay to start audio')})
}
speakSegments=function(segments){
 lastVoiceSegments=segments;stopVoice();if(!voiceEnabled)return;const token=voiceQueueToken,locale=voiceLocale();
 const embedded=/Tesla|QtCarBrowser|TeslaBrowser/i.test(navigator.userAgent),voice=!embedded&&'speechSynthesis'in window?chooseNativeVoice(locale):null;if(token!==voiceQueueToken)return;
 if(voice)return nativeSpeakSegments(segments);
 const prepared=speechChunks(lang==='ta'?tamilStorySegments(segments):segments);setVoiceStatus(lang==='ta'?'Tesla-க்கான தமிழ் ஒலி ஏற்றப்படுகிறது…':'Loading English audio for Tesla…');playRemoteNarration(prepared,token)
};
teacherSpeak=function(text){speakSegments([{text}])};coachNarrate=function(text){teacherSpeak(text)};
