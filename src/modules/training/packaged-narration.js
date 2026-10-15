
// Packaged, same-origin narration for Tesla and standard browsers.
let packagedLessonStep=0,packagedAudioKey='',packagedAudio=null;
function packagedPath(){const role=session.activePersona||'manager',step=Math.max(0,Math.min(4,Number(packagedLessonStep)||0)),language=lang==='ta'?'ta':'en';return{key:`${language}/${role}/${step}`,url:`audio/${language}/${role}-${step}.mp3`,role,step,language}}
function playPackagedNarration(force=false){
 if(!voiceEnabled)return;if(typeof packagedVoiceContext!=='undefined'&&packagedVoiceContext!=='lesson'){setVoiceStatus(lang==='ta'?'முதலில் ஒரு பாடத்தைத் தேர்வு செய்யுங்கள்':'Select a lesson first');return}const p=packagedPath();
 if(packagedAudio&&packagedAudioKey===p.key&&!force&&!packagedAudio.paused&&!packagedAudio.ended)return;
 if(packagedAudio){packagedAudio.pause();if(!packagedAudio.matches?.('[data-packaged-player]'))packagedAudio.src=''}
 const visiblePlayer=document.querySelector(`[data-packaged-player][data-key="${p.key}"]`);packagedAudioKey=p.key;packagedAudio=visiblePlayer||new Audio(p.url);activeNarrationAudio=packagedAudio;packagedAudio.preload='auto';packagedAudio.muted=false;packagedAudio.volume=1;
 packagedAudio.onplay=()=>setVoiceStatus(p.language==='ta'?`தமிழ் கதை ஒலி · பாடம் ${p.step+1}`:`English story · Lesson ${p.step+1}`,true);
 packagedAudio.onpause=()=>{if(!packagedAudio?.ended)setVoiceStatus(p.language==='ta'?'கதை இடைநிறுத்தப்பட்டது':'Story paused')};
 packagedAudio.onended=()=>{setVoiceStatus(vc().ready);document.querySelectorAll('.voice-active').forEach(x=>x.classList.remove('voice-active'))};
 packagedAudio.onerror=()=>setVoiceStatus(p.language==='ta'?'இந்தப் பாடத்தின் தமிழ் audio file ஏற்றப்படவில்லை':'This lesson audio file could not be loaded');
 packagedAudio.play().catch(e=>setVoiceStatus(p.language==='ta'?'Voice On அல்லது Replay அழுத்தவும்':'Press Voice On or Replay'))
}
speakSegments=function(segments){lastVoiceSegments=segments;playPackagedNarration(false)};
teacherSpeak=function(text){lastVoiceSegments=[{text}];playPackagedNarration(false)};coachNarrate=teacherSpeak;
stopVoice=function(){voiceQueueToken++;window.speechSynthesis?.cancel();if(packagedAudio){packagedAudio.pause();packagedAudio=null}document.querySelectorAll('.voice-active').forEach(x=>x.classList.remove('voice-active'));setVoiceStatus(voiceEnabled?vc().ready:'Voice off')};
document.addEventListener('click',e=>{const lesson=e.target.closest('[data-training-lesson]');if(lesson)packagedLessonStep=Number(lesson.dataset.trainingLesson)||0;const phased=e.target.closest('[data-teacher-next],[data-teacher-prev],[data-teacher-check],[data-teacher-launch]');if(phased)packagedLessonStep=Number(phased.dataset.step||phased.dataset.teacherCheck)||0;if(e.target.closest('[data-voice-replay]')){e.preventDefault();e.stopImmediatePropagation();return currentContextAudioUrl?playContextFile(currentContextAudioUrl,currentContextAudioLabel):exactContextSpeak(lastVoiceSegments)}if(e.target.closest('[data-voice-pause]')){e.preventDefault();e.stopImmediatePropagation();if(activeNarrationAudio){if(activeNarrationAudio.paused)activeNarrationAudio.play();else activeNarrationAudio.pause()}else if(window.speechSynthesis?.paused)window.speechSynthesis.resume();else window.speechSynthesis?.pause()}},true);
